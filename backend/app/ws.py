"""WebSocket voice session — protocol from STUDYLOOP_ROADMAP_V2.md §2.

client → server
  {"type":"hello", "token"?, "video_id", "session_id"?, "language":"en"|"hi"}
  {"type":"utterance", "turn_id", "text", "playback_s", "max_watched_s", "language"?}
  {"type":"playback", "playback_s", "max_watched_s"}        # heartbeat
  {"type":"turn.cancel", "turn_id"}                          # barge-in (meaningful once answers stream)
  {"type":"ping"}
server → client
  {"type":"ready", "session_id", "classifier"}
  {"type":"action", "turn_id", "action":{...}, "message", "intent", "confidence", "route", "timings"}
  {"type":"answer.done", "turn_id", "text", "intent", "confidence", "route", "timings"}
  {"type":"error", "turn_id"?, "code", "message"}
  {"type":"pong"}
The browser already did ASR — only recognized TEXT crosses the socket, never audio.
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
from app.orchestration.graph import get_graph, new_turn_input
from app.services.sessions import get_session_store, valid_session_id

log = logging.getLogger("studyloop.ws")
router = APIRouter()

MAX_TEXT_LEN = 500
HELLO_TIMEOUT_S = 10


def _lang(v: Any, default: str = "en") -> str:
    return v if v in ("en", "hi") else default


async def run_turn(session: dict[str, Any], msg: dict[str, Any]) -> dict[str, Any]:
    """Run one utterance through the graph and shape the outgoing message."""
    turn_id = str(msg.get("turn_id") or uuid.uuid4())
    text = str(msg.get("text") or "").strip()[:MAX_TEXT_LEN]
    if not text:
        return {"type": "error", "turn_id": turn_id, "code": "empty", "message": "Empty utterance"}

    session["max_watched_s"] = max(
        float(session.get("max_watched_s", 0)), float(msg.get("max_watched_s") or 0)
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
            turn_id=turn_id,
            raw_text=text,
        ),
        {"configurable": {"thread_id": session["session_id"]}},
    )
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
    return {"type": "answer.done", "text": state.get("response_text"), **common}


@router.websocket("/ws/session")
async def session_ws(ws: WebSocket) -> None:
    await ws.accept()
    settings = get_settings()
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
        }
        await ws.send_json(
            {"type": "ready", "session_id": session["session_id"], "classifier": settings.classifier}
        )
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
        await _serve(ws, session)
    finally:
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


async def _serve(ws: WebSocket, session: dict[str, Any]) -> None:
    try:
        while True:
            msg = await ws.receive_json()
            kind = msg.get("type")
            if kind == "utterance":
                try:
                    await ws.send_json(await run_turn(session, msg))
                except Exception:  # never let one bad turn kill the session
                    log.exception("turn failed")
                    await ws.send_json(
                        {
                            "type": "error",
                            "turn_id": msg.get("turn_id"),
                            "code": "internal",
                            "message": "Turn failed",
                        }
                    )
            elif kind == "playback":
                session["max_watched_s"] = max(session["max_watched_s"], float(msg.get("max_watched_s") or 0))
            elif kind == "language":
                session["language"] = _lang(msg.get("language"), session["language"])
            elif kind == "ping":
                await ws.send_json({"type": "pong"})
            elif kind == "turn.cancel":
                pass  # nothing streams yet in Tier 0; becomes meaningful with streamed answers (Tier 1b)
            else:
                await ws.send_json(
                    {"type": "error", "code": "unknown_type", "message": f"Unknown type {kind!r}"}
                )
    except (WebSocketDisconnect, asyncio.TimeoutError):
        return
