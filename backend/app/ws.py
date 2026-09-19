"""WebSocket voice session — protocol from STUDYLOOP_ROADMAP_V2.md §2.

client → server
  {"type":"hello", "token"?, "video_id", "session_id"?, "language":"en"|"hi"}
  {"type":"utterance", "turn_id", "text", "playback_s", "max_watched_s", "language"?}
  {"type":"playback", "playback_s", "max_watched_s"}        # heartbeat
  {"type":"turn.cancel", "turn_id"}                          # barge-in: stop streaming that turn
  {"type":"ping"}
server → client
  {"type":"ready", "session_id", "classifier"}
  {"type":"video.status", "video_id", "status", "has_transcript", "fail_reason", "retryable", ...}
      sent right after `ready`, then on every ingestion change (Tier 1a). status: pending | fetching |
      transcribing | embedding | ready | unavailable | failed. Retry = POST /api/videos {retry: true}.
  {"type":"action", "turn_id", "action":{...}, "message", "intent", "confidence", "route", "timings"}
  {"type":"answer.delta", "turn_id", "text"}                  # streamed answer tokens (Tier 1b, D8)
  {"type":"answer.done", "turn_id", "text", "citations":[{"start_s"}], "cancelled", "intent", "confidence",
   "route", "timings"}                                        # text = the full answer (or template)
  {"type":"error", "turn_id"?, "code", "message"}
  {"type":"pong"}
The browser already did ASR — only recognized TEXT crosses the socket, never audio.
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
from app.orchestration.graph import TurnDeps, default_deps, get_graph, new_turn_input
from app.services.ingest import get_ingest_service
from app.services.sessions import get_session_store, valid_session_id

log = logging.getLogger("studyloop.ws")
router = APIRouter()

MAX_TEXT_LEN = 500
HELLO_TIMEOUT_S = 10


def _lang(v: Any, default: str = "en") -> str:
    return v if v in ("en", "hi") else default


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
    cancelled: set[str] = session.setdefault("cancelled", set())

    async def emit(delta: str) -> None:
        if turn_id not in cancelled:
            await send({"type": "answer.delta", "turn_id": turn_id, "text": delta})

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
            language=_lang(msg.get("language"), session["language"]),
            playback_s=float(msg.get("playback_s") or 0),
            max_watched_s=session["max_watched_s"],
            transcript_status=session.get("transcript_status", "pending"),
            transcript_fail_reason=session.get("transcript_fail_reason"),
            turn_id=turn_id,
            raw_text=text,
        ),
        {"configurable": {"thread_id": session["session_id"], "deps": deps}},
    )
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
            "max_watched_s": 0.0,
            "transcript_status": "pending",
            "transcript_fail_reason": None,
        }
        await send({"type": "ready", "session_id": session["session_id"], "classifier": settings.classifier})
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
                    language=session["language"],
                )
            )
    except (WebSocketDisconnect, asyncio.TimeoutError):
        return

    try:
        await _serve(ws, send, session)
    finally:
        watcher.cancel()
        if user is not ANONYMOUS:
            try:
                await started  # the end update must not race the start insert
                await store.end(
                    session_id=session["session_id"],
                    user_id=user.id,
                    max_watched_s=session["max_watched_s"],
                    language=session["language"],
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
                cancelled.update(inflight)  # a new command barges in on an answer still streaming
                task = asyncio.create_task(handle(msg))
                tasks.add(task)
                task.add_done_callback(tasks.discard)
            elif kind == "playback":
                session["max_watched_s"] = max(session["max_watched_s"], float(msg.get("max_watched_s") or 0))
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
