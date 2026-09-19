"""Viewing-session bookkeeping in Supabase (roadmap §4, `study_sessions`; session_id = LangGraph thread_id).

Written through PostgREST with the service key, after the backend has verified the user's JWT.
Never on the voice fast path: one write when the WebSocket says hello, one when it closes.
Every failure is logged and swallowed — a database hiccup must never break voice control.
"""

from __future__ import annotations

import logging
import re
import uuid
from datetime import datetime, timezone
from typing import Protocol

import httpx

from app.config import Settings

log = logging.getLogger("studyloop.sessions")

_VIDEO_ID = re.compile(r"^[A-Za-z0-9_-]{6,20}$")


def valid_session_id(value: object) -> str:
    """The client proposes a session_id (it keys the conversation memory); it must be a UUID for the
    uuid column, otherwise the server mints one and returns it in `ready`."""
    try:
        return str(uuid.UUID(str(value)))
    except (ValueError, TypeError):
        return str(uuid.uuid4())


class SessionStore(Protocol):
    async def start(
        self, *, session_id: str, user_id: str, email: str | None, video_id: str, language: str
    ) -> None: ...

    async def end(self, *, session_id: str, user_id: str, max_watched_s: float, language: str) -> None: ...


class NullSessionStore:
    """Anonymous demo mode, tests, or Supabase not configured."""

    async def start(self, **_: object) -> None:
        return None

    async def end(self, **_: object) -> None:
        return None


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


class SupabaseSessionStore:
    def __init__(self, settings: Settings, client: httpx.AsyncClient | None = None):
        self._base = f"{settings.supabase_url.rstrip('/')}/rest/v1"
        key = settings.supabase_service_key
        # new-style sb_secret_ keys go in `apikey` only; a legacy service_role JWT also as the bearer
        self._headers = {"apikey": key, "Content-Type": "application/json"}
        if key.startswith("eyJ"):
            self._headers["Authorization"] = f"Bearer {key}"
        self._client = client or httpx.AsyncClient(timeout=5.0)

    async def _insert_ignore(self, table: str, row: dict, conflict: str) -> None:
        r = await self._client.post(
            f"{self._base}/{table}",
            params={"on_conflict": conflict},
            json=[row],
            headers={**self._headers, "Prefer": "resolution=ignore-duplicates,return=minimal"},
        )
        r.raise_for_status()

    async def start(
        self, *, session_id: str, user_id: str, email: str | None, video_id: str, language: str
    ) -> None:
        if not _VIDEO_ID.fullmatch(video_id):
            log.warning("session %s: not recording, odd video_id %r", session_id, video_id[:40])
            return
        try:
            # FK parents first: the profile (normally made by the signup trigger) and the shared video
            # cache row (ingest_status 'pending' until Tier 1a fills it)
            await self._insert_ignore("profiles", {"id": user_id, "email": email}, "id")
            await self._insert_ignore("videos", {"video_id": video_id}, "video_id")
            # ignore-duplicates: a reconnect (or a guessed session_id) never overwrites an existing row
            await self._insert_ignore(
                "study_sessions",
                {"session_id": session_id, "user_id": user_id, "video_id": video_id, "language": language},
                "session_id",
            )
            log.info("session %s started (user %s, video %s)", session_id, user_id, video_id)
        except httpx.HTTPError as exc:
            log.warning("session %s: could not record start: %s", session_id, _describe(exc))

    async def end(self, *, session_id: str, user_id: str, max_watched_s: float, language: str) -> None:
        try:
            # filtered by user_id too: a session row can only ever be updated by its owner
            r = await self._client.patch(
                f"{self._base}/study_sessions",
                params={"session_id": f"eq.{session_id}", "user_id": f"eq.{user_id}"},
                json={"max_watched_s": max_watched_s, "language": language, "last_seen_at": _now()},
                headers={**self._headers, "Prefer": "return=minimal"},
            )
            r.raise_for_status()
        except httpx.HTTPError as exc:
            log.warning("session %s: could not record end: %s", session_id, _describe(exc))


def _describe(exc: httpx.HTTPError) -> str:
    if isinstance(exc, httpx.HTTPStatusError):
        return f"HTTP {exc.response.status_code} {exc.response.text[:200]}"
    return type(exc).__name__


_store: SessionStore | None = None


def get_session_store(settings: Settings) -> SessionStore:
    global _store
    if _store is None:
        configured = bool(settings.supabase_url and settings.supabase_service_key)
        _store = SupabaseSessionStore(settings) if configured else NullSessionStore()
    return _store
