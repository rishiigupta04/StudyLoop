"""WebSocket voice session — protocol from STUDYLOOP_ROADMAP_V2.md §2.

client → server
  {"type":"hello", "token"?, "video_id", "session_id"?, "language":"auto"|"en"|"hi", "spoiler_guard"?: bool}
      language "auto" = answer in the language the learner uses, per turn (reply_language.py); "en" / "hi" force it
  {"type":"utterance", "turn_id", "text", "playback_s", "max_watched_s", "language"?, "spoiler_guard"?,
   "stt_language"?}   # stt_language: the STT provider's hint ("hi-IN" …), used in Auto for very short commands
      spoiler_guard (UI toggle, default true): Q&A/summaries use only what's been watched (D7). false = the
      learner opted out, the whole lecture is used. The utterance's value wins and sticks for the session.
  {"type":"playback", "playback_s", "max_watched_s", "duration_s"?}   # heartbeat every 5 s; also feeds the
      resume point (`user_video_history`, Tier 2), written behind: memory now, the database within ~20 s
  {"type":"turn.cancel", "turn_id"}                          # barge-in: stop streaming that turn
  {"type":"ping"}
server → client
  {"type":"ready", "session_id", "classifier"}
  {"type":"video.status", "video_id", "status", "has_transcript", "fail_reason", "retryable", ...}
      sent right after `ready`, then on every ingestion change (Tier 1a). status: pending | fetching |
      transcribing | embedding | ready | unavailable | failed. Retry = POST /api/videos {retry: true}.
  {"type":"action", "turn_id", "action":{...}, "message", "intent", "confidence", "route", "timings",
   "language", "code_mix"}
  {"type":"answer.delta", "turn_id", "text", "language"}      # streamed answer tokens (Tier 1b, D8)
  {"type":"answer.done", "turn_id", "text", "citations":[{"start_s"}], "cancelled", "intent", "confidence",
   "route", "timings", "language", "code_mix", "answer_kind", "replay_from_s"}   # text = the full answer
      answer_kind: "answer" | "summary" | "recap" ("I'm lost") for a grounded answer, null for a template;
      replay_from_s: a recap's start (the client offers "Replay from …")
      language = the language this turn was answered in ("en" | "hi"; code_mix = Hinglish): the client's voice
  {"type":"note.created", "turn_id", "note":{id, video_id, session_id, at_s, raw_text, summary, is_auto,
   is_bookmarked, created_at, updated_at}, "summary_status":"pending"}   # voice note (Tier 1e), before
                                                              # the turn's answer.done ack
  {"type":"note.updated", "note":{...}, "summary_status":"done"|"skipped"|"failed"|"kept", "saved"}
      after the background insert + LLM summary; "kept" = the user edited the note meanwhile (theirs wins)
  {"type":"error", "turn_id"?, "code", "message"}
  {"type":"pong"}
Only recognized TEXT crosses the socket, never audio. (Push-to-talk audio goes to `POST /api/stt` first when
hosted speech is configured — roadmap D14 — and only its transcript comes here.)
Turns run one at a time per session, but the socket keeps reading while an answer streams, so a
`turn.cancel` — or a new utterance, which barges in on the one still streaming — takes effect at once.
"""

from __future__ import annotations

import asyncio
import logging
import time
import uuid
from typing import Any

from fastapi import APIRouter, HTTPException, WebSocket, WebSocketDisconnect

from app.auth import ANONYMOUS, resolve_user
from app.config import get_settings
from app.orchestration import onnx_classifier
from app.orchestration.graph import TurnDeps, default_deps, get_graph, new_turn_input
from app.orchestration.reply_language import detect_reply_language, requested_language
from app.services.ingest import get_ingest_service
from app.services.library import get_library_service
from app.services.notes import get_notes_service, new_note, public
from app.services.sessions import get_session_store, valid_session_id

log = logging.getLogger("studyloop.ws")
router = APIRouter()

MAX_TEXT_LEN = 500
HELLO_TIMEOUT_S = 10


def _lang(v: Any, default: str = "en") -> str:
    """The language mode from the UI: "auto" (answer in the language spoken) or a forced "en" / "hi"."""
    return v if v in ("auto", "en", "hi") else default


def _session_lang(session: dict[str, Any]) -> str:
    """A plain en/hi for bookkeeping rows: the forced language, else the one the conversation is in."""
    if session["language"] != "auto":
        return session["language"]
    return (session.get("reply") or ("en", False))[0]


def _reply_language(session: dict[str, Any], msg: dict[str, Any], text: str) -> tuple[str, bool]:
    """This turn's (reply language, code_mix): "explain that in Hindi" first, then the toggle when forced, else
    detected from what was said."""
    mode = _lang(msg.get("language"), session["language"])
    if asked := requested_language(text):
        if mode == "auto":
            session["reply"] = asked
        return asked
    if mode != "auto":
        return mode, False
    stt = msg.get("stt_language")
    reply = detect_reply_language(text, stt if isinstance(stt, str) else None, session.get("reply"))
    session["reply"] = reply
    return reply


async def run_turn(session: dict[str, Any], msg: dict[str, Any], send: Any = None) -> dict[str, Any]:
    """Run one utterance through the graph and shape the outgoing message. With `send`, streamed answer
    tokens go out as `answer.delta` while the graph is still running."""
    turn_id = str(msg.get("turn_id") or uuid.uuid4())
    text = str(msg.get("text") or "").strip()[:MAX_TEXT_LEN]
    if not text:
        return {"type": "error", "turn_id": turn_id, "code": "empty", "message": "Empty utterance"}

    session["max_watched_s"] = max(
        float(session.get("max_watched_s", 0)), float(msg.get("max_watched_s") or 0)
    )
    if isinstance(msg.get("spoiler_guard"), bool):
        session["spoiler_guard"] = msg["spoiler_guard"]
    cancelled: set[str] = session.setdefault("cancelled", set())
    lang, code_mix = _reply_language(session, msg, text)

    async def emit(delta: str) -> None:
        if turn_id not in cancelled:
            # the reply language rides on every delta: the client picks the voice before the first sentence
            await send({"type": "answer.delta", "turn_id": turn_id, "text": delta, "language": lang})

    base = default_deps()
    deps = TurnDeps(
        retriever=base.retriever,
        llm=base.llm,
        emit=emit if send is not None else None,
        is_cancelled=lambda: turn_id in cancelled,
        loop=asyncio.get_running_loop(),
    )
    t0 = time.perf_counter()
    state = await asyncio.to_thread(
        get_graph().invoke,
        new_turn_input(
            session_id=session["session_id"],
            user_id=session["user_id"],
            video_id=session["video_id"],
            language=lang,
            code_mix=code_mix,
            playback_s=float(msg.get("playback_s") or 0),
            max_watched_s=session["max_watched_s"],
            spoiler_guard=session.get("spoiler_guard", True),
            transcript_status=session.get("transcript_status", "pending"),
            transcript_fail_reason=session.get("transcript_fail_reason"),
            turn_id=turn_id,
            raw_text=text,
        ),
        {"configurable": {"thread_id": session["session_id"], "deps": deps}},
    )
    if state.get("note"):  # Tier 1e: ack now, store + summarize in the background
        draft = state["note"]
        note = new_note(
            user_id=session["user_id"],
            video_id=draft["video_id"],
            at_s=draft["at_s"],
            raw_text=draft["raw_text"],
            session_id=draft.get("session_id"),
            is_auto=True,
            is_bookmarked=draft["is_bookmarked"],
        ) | {"id": draft["id"]}
        if send is not None:
            await send(
                {
                    "type": "note.created",
                    "turn_id": turn_id,
                    "note": public(note),
                    "summary_status": "pending",
                }
            )
        get_notes_service().start_voice_note(note, spoken=text, language=lang, send=send)
    was_cancelled = turn_id in cancelled
    cancelled.discard(turn_id)
    timings = dict(state.get("timings") or {})
    timings["server_total"] = round((time.perf_counter() - t0) * 1000, 3)
    common = {
        "turn_id": turn_id,
        "intent": state.get("intent"),
        "confidence": state.get("confidence"),
        "route": state.get("route"),
        "normalized_text": state.get("normalized_text"),
        "timings": timings,
        "language": lang,
        "code_mix": code_mix,
    }
    log.info(
        "turn %s intent=%s route=%s %.1fms",
        turn_id,
        common["intent"],
        common["route"],
        timings["server_total"],
    )
    if state.get("action"):
        return {"type": "action", "action": state["action"], "message": state.get("response_text"), **common}
    return {
        "type": "answer.done",
        "text": state.get("response_text"),
        "citations": state.get("citations") or [],
        "cancelled": was_cancelled,
        # a real grounded answer ("answer" | "summary" | "recap"; null for templates): the client offers follow-ups
        "answer_kind": state.get("answer_kind"),
        "replay_from_s": state.get("replay_from_s"),
        **common,
    }


@router.websocket("/ws/session")
async def session_ws(ws: WebSocket) -> None:
    await ws.accept()
    settings = get_settings()
    lock = asyncio.Lock()

    async def send(payload: dict[str, Any]) -> None:
        async with lock:  # the turn loop and the video-status watcher share the socket
            await ws.send_json(payload)

    try:
        hello = await asyncio.wait_for(ws.receive_json(), timeout=HELLO_TIMEOUT_S)
        if hello.get("type") != "hello" or not hello.get("video_id"):
            await ws.send_json(
                {"type": "error", "code": "bad_hello", "message": "First message must be hello"}
            )
            await ws.close(code=4400)
            return
        try:
            # off the event loop: the first asymmetric-key check fetches the project's JWKS over HTTP
            user = await asyncio.to_thread(resolve_user, hello.get("token"), settings)
        except HTTPException as exc:
            await ws.send_json({"type": "error", "code": "unauthorized", "message": str(exc.detail)})
            await ws.close(code=4401)
            return

        session = {
            "session_id": valid_session_id(hello.get("session_id")),
            "user_id": user.id,
            "video_id": str(hello["video_id"])[:64],
            "language": _lang(hello.get("language")),
            "reply": None,  # Auto mode: the last turn's (reply language, code_mix), for commands too short to tell
            "spoiler_guard": hello.get("spoiler_guard") is not False,
            "max_watched_s": 0.0,
            "transcript_status": "pending",
            "transcript_fail_reason": None,
        }
        classifier = "onnx" if onnx_classifier.active() is not None else "regex"  # what really serves
        await send({"type": "ready", "session_id": session["session_id"], "classifier": classifier})
        library = get_library_service()
        library.record_anonymous_session(
            session["session_id"], user.id, session["video_id"], _session_lang(session)
        )
        # transcript ingestion starts (or is joined) here; progress streams as video.status
        watcher = asyncio.create_task(_watch_video(send, session))
        # a reconnect after a server restart: load this session's conversation memory before the first turn
        hydrate = getattr(get_graph().checkpointer, "hydrate", None)
        if hydrate is not None:
            asyncio.create_task(asyncio.to_thread(hydrate, session["session_id"]))
        # study_sessions row for signed-in users, written in the background so voice is ready at once
        if user is not ANONYMOUS:
            store = get_session_store(settings)
            started = asyncio.create_task(
                store.start(
                    session_id=session["session_id"],
                    user_id=user.id,
                    email=user.email,
                    video_id=session["video_id"],
                    language=_session_lang(session),
                )
            )
    except (WebSocketDisconnect, asyncio.TimeoutError):
        return

    try:
        await _serve(ws, send, session)
    finally:
        watcher.cancel()
        library.flush_soon(user.id, session["video_id"])  # resume point, in the background
        library.record_anonymous_session(
            session["session_id"], user.id, session["video_id"], _session_lang(session)
        )
        if user is not ANONYMOUS:
            try:
                await started  # the end update must not race the start insert
                await store.end(
                    session_id=session["session_id"],
                    user_id=user.id,
                    max_watched_s=session["max_watched_s"],
                    language=_session_lang(session),
                )
            except Exception:  # bookkeeping must never surface as a socket error
                log.exception("session %s bookkeeping failed", session["session_id"])


async def _watch_video(send: Any, session: dict[str, Any]) -> None:
    """Forward this video's ingestion status for the life of the socket (a retry from the REST API
    also streams here). Never raises into the session: voice control works without a transcript."""
    svc = get_ingest_service()
    vid = session["video_id"]
    q = svc.subscribe(vid)
    last: dict[str, Any] | None = None
    try:
        snap = await svc.ensure(vid)
        while True:
            if snap != last:
                session["transcript_status"] = snap["status"]
                session["transcript_fail_reason"] = snap["fail_reason"]
                await send({"type": "video.status", **snap})
                last = snap
            snap = await q.get()
    except asyncio.CancelledError:
        raise
    except Exception:
        log.exception("video %s: status watcher failed", vid)
    finally:
        svc.unsubscribe(vid, q)


def _note_position(session: dict[str, Any], msg: dict[str, Any]) -> None:
    """Resume point + high-water mark into memory (written behind, never awaited here)."""
    if (
        msg.get("playback_s") is None
    ):  # no position in the message (the player was not placed yet): not a position
        return
    try:
        duration = float(msg.get("duration_s") or 0) or None
        get_library_service().note_position(
            session["user_id"],
            session["video_id"],
            position_s=float(msg.get("playback_s") or 0),
            max_watched_s=max(session["max_watched_s"], float(msg.get("max_watched_s") or 0)),
            duration_s=duration,
        )
    except (TypeError, ValueError):
        pass


async def _serve(ws: WebSocket, send: Any, session: dict[str, Any]) -> None:
    turn_lock = asyncio.Lock()  # one graph run at a time per session (shared conversation memory)
    inflight: set[str] = set()
    tasks: set[asyncio.Task[None]] = set()
    cancelled: set[str] = session.setdefault("cancelled", set())

    async def handle(msg: dict[str, Any]) -> None:
        async with turn_lock:
            inflight.add(msg["turn_id"])
            try:
                await send(await run_turn(session, msg, send))
            except Exception:  # never let one bad turn kill the session
                log.exception("turn failed")
                await send(
                    {"type": "error", "turn_id": msg["turn_id"], "code": "internal", "message": "Turn failed"}
                )
            finally:
                inflight.discard(msg["turn_id"])

    try:
        while True:
            msg = await ws.receive_json()
            kind = msg.get("type")
            if kind == "utterance":
                msg["turn_id"] = str(msg.get("turn_id") or uuid.uuid4())
                _note_position(session, msg)
                cancelled.update(inflight)  # a new command barges in on an answer still streaming
                task = asyncio.create_task(handle(msg))
                tasks.add(task)
                task.add_done_callback(tasks.discard)
            elif kind == "playback":
                session["max_watched_s"] = max(session["max_watched_s"], float(msg.get("max_watched_s") or 0))
                _note_position(session, msg)
            elif kind == "language":
                session["language"] = _lang(msg.get("language"), session["language"])
            elif kind == "ping":
                await send({"type": "pong"})
            elif kind == "turn.cancel":
                if msg.get("turn_id"):
                    cancelled.add(str(msg["turn_id"]))
            else:
                await send({"type": "error", "code": "unknown_type", "message": f"Unknown type {kind!r}"})
    except (WebSocketDisconnect, asyncio.TimeoutError):
        return
    finally:
        cancelled.update(inflight)  # stop any stream; the socket is gone
        for task in tasks:
            task.cancel()
