"""Personal library, resume points, dashboard numbers and chat history (roadmap Tier 2 retention layer).

- `user_video_history` (resume at `last_position_s`, the spoiler high-water mark `max_watched_s`) is
  written **behind** the WebSocket heartbeat: `note_position()` only updates memory; one background flusher
  upserts dirty rows every FLUSH_S, and a session's row is flushed when its socket closes. No turn ever
  waits on it.
- Library = history rows joined with the shared `videos` cache (title, status, outline) + notes counts.
- Dashboard = library + notes + `study_sessions` (study time per day).
- Chat history = each session's conversation memory in the LangGraph checkpointer (roadmap §4: no
  `saved_chats`), listed from the user's `study_sessions`.

Storage: PostgREST with the service key, every query filtered by the verified `user_id` (the filter IS the
access rule, as in notes). Anonymous demo users (REQUIRE_AUTH=false) have no `profiles` row, so their
history and sessions live in memory for the life of the process.
"""

from __future__ import annotations

import asyncio
import copy
import logging
import time
from datetime import datetime, timedelta, timezone
from typing import Any, Protocol

import httpx

from app.config import Settings
from app.services.notes import ANONYMOUS_ID, VIDEO_ID

log = logging.getLogger("studyloop.library")

FLUSH_S = 20.0  # at most one history write per video per ~20 s of watching
COMPLETED_AT = 0.9  # watched 90 % of the lecture → "completed"
MAX_SESSION_S = 4 * 3600  # a session left open overnight doesn't count as 12 h of study
LIBRARY_VIDEO_COLUMNS = (
    "video_id,title,channel,thumbnail_url,duration_s,ingest_status,has_transcript,summary,chapters"
)


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _iso(t: datetime) -> str:
    return t.isoformat()


def _parse(v: Any) -> datetime | None:
    if isinstance(v, datetime):
        return v
    try:
        return datetime.fromisoformat(str(v).replace("Z", "+00:00"))
    except (TypeError, ValueError):
        return None


def status_for(max_watched_s: float, duration_s: float | None) -> str:
    if duration_s and max_watched_s >= COMPLETED_AT * duration_s:
        return "completed"
    return "in-progress" if max_watched_s > 0 else "not-started"


class LibraryError(RuntimeError):
    pass


class LibraryRepo(Protocol):
    async def upsert_history(self, row: dict[str, Any]) -> None: ...
    async def get_history(self, user_id: str, video_id: str) -> dict[str, Any] | None: ...
    async def list_history(self, user_id: str) -> list[dict[str, Any]]:
        """History rows, most recent first, each with a `videos` dict (the shared cache row)."""
        ...

    async def delete_history(self, user_id: str, video_id: str) -> bool: ...
    async def list_sessions(
        self, user_id: str, since: datetime | None = None, limit: int = 200
    ) -> list[dict]: ...
    async def note_counts(self, user_id: str) -> dict[str, int]: ...


# ------------------------------------------------------------------ in-memory (anonymous / tests)
class InMemoryLibraryRepo:
    def __init__(self, videos: Any = None, notes: Any = None) -> None:
        self.history: dict[tuple[str, str], dict[str, Any]] = {}
        self.sessions: dict[str, dict[str, Any]] = {}
        self._videos = videos  # async (video_id) -> row | None
        self._notes = notes  # async (user_id) -> list[note]

    async def upsert_history(self, row: dict[str, Any]) -> None:
        key = (row["user_id"], row["video_id"])
        self.history[key] = {**self.history.get(key, {}), **copy.deepcopy(row)}

    async def get_history(self, user_id: str, video_id: str) -> dict[str, Any] | None:
        row = self.history.get((user_id, video_id))
        return copy.deepcopy(row) if row else None

    async def list_history(self, user_id: str) -> list[dict[str, Any]]:
        rows = [copy.deepcopy(r) for (u, _), r in self.history.items() if u == user_id]
        for r in rows:
            r["videos"] = (await self._videos(r["video_id"]) if self._videos else None) or {}
        return sorted(rows, key=lambda r: str(r.get("last_studied_at")), reverse=True)

    async def delete_history(self, user_id: str, video_id: str) -> bool:
        return self.history.pop((user_id, video_id), None) is not None

    async def list_sessions(
        self, user_id: str, since: datetime | None = None, limit: int = 200
    ) -> list[dict]:
        rows = [
            copy.deepcopy(s)
            for s in self.sessions.values()
            if s["user_id"] == user_id and (since is None or (_parse(s["started_at"]) or _now()) >= since)
        ]
        return sorted(rows, key=lambda s: str(s["started_at"]), reverse=True)[:limit]

    async def note_counts(self, user_id: str) -> dict[str, int]:
        out: dict[str, int] = {}
        for n in await self._notes(user_id) if self._notes else []:
            out[n["video_id"]] = out.get(n["video_id"], 0) + 1
        return out

    # anonymous sessions (signed-in ones are written to study_sessions by services/sessions.py)
    def record_session(self, session_id: str, user_id: str, video_id: str, language: str) -> None:
        now = _iso(_now())
        s = self.sessions.setdefault(
            session_id,
            {"session_id": session_id, "user_id": user_id, "video_id": video_id, "started_at": now},
        )
        s.update(language=language, last_seen_at=now)


# ------------------------------------------------------------------ Supabase (PostgREST)
class SupabaseLibraryRepo:
    def __init__(self, settings: Settings, client: httpx.AsyncClient | None = None):
        self._base = f"{settings.supabase_url.rstrip('/')}/rest/v1"
        key = settings.supabase_service_key
        self._headers = {"apikey": key, "Content-Type": "application/json"}
        if key.startswith("eyJ"):
            self._headers["Authorization"] = f"Bearer {key}"
        self._client = client or httpx.AsyncClient(timeout=10.0)

    async def _req(self, method: str, table: str, *, prefer: str | None = None, **kw: Any) -> httpx.Response:
        headers = {**self._headers, **({"Prefer": prefer} if prefer else {})}
        try:
            r = await self._client.request(method, f"{self._base}/{table}", headers=headers, **kw)
            r.raise_for_status()
        except httpx.HTTPStatusError as exc:
            raise LibraryError(f"HTTP {exc.response.status_code} {exc.response.text[:200]}") from exc
        except httpx.HTTPError as exc:
            raise LibraryError(type(exc).__name__) from exc
        return r

    async def upsert_history(self, row: dict[str, Any]) -> None:
        await self._req(
            "POST",
            "user_video_history",
            params={"on_conflict": "user_id,video_id"},
            json=[row],
            prefer="resolution=merge-duplicates,return=minimal",
        )

    async def get_history(self, user_id: str, video_id: str) -> dict[str, Any] | None:
        r = await self._req(
            "GET",
            "user_video_history",
            params={"user_id": f"eq.{user_id}", "video_id": f"eq.{video_id}", "select": "*"},
        )
        rows = r.json()
        return rows[0] if rows else None

    async def list_history(self, user_id: str) -> list[dict[str, Any]]:
        r = await self._req(
            "GET",
            "user_video_history",
            params={
                "user_id": f"eq.{user_id}",
                "select": f"*,videos({LIBRARY_VIDEO_COLUMNS})",
                "order": "last_studied_at.desc",
                "limit": "500",
            },
        )
        return r.json()

    async def delete_history(self, user_id: str, video_id: str) -> bool:
        r = await self._req(
            "DELETE",
            "user_video_history",
            params={"user_id": f"eq.{user_id}", "video_id": f"eq.{video_id}"},
            prefer="return=representation",
        )
        return bool(r.json())

    async def list_sessions(
        self, user_id: str, since: datetime | None = None, limit: int = 200
    ) -> list[dict]:
        params = {
            "user_id": f"eq.{user_id}",
            "select": "session_id,video_id,language,max_watched_s,started_at,last_seen_at",
            "order": "started_at.desc",
            "limit": str(limit),
        }
        if since is not None:
            params["started_at"] = f"gte.{_iso(since)}"
        return (await self._req("GET", "study_sessions", params=params)).json()

    async def note_counts(self, user_id: str) -> dict[str, int]:
        r = await self._req(
            "GET", "notes", params={"user_id": f"eq.{user_id}", "select": "video_id", "limit": "5000"}
        )
        out: dict[str, int] = {}
        for n in r.json():
            out[n["video_id"]] = out.get(n["video_id"], 0) + 1
        return out


# ------------------------------------------------------------------ views
def library_item(row: dict[str, Any], notes: int) -> dict[str, Any]:
    v = row.get("videos") or {}
    duration = v.get("duration_s")
    outline = v.get("chapters") if isinstance(v.get("chapters"), dict) else {}
    langs = outline.get("langs") if outline.get("status") == "ready" else None
    watched = float(row.get("max_watched_s") or 0)
    return {
        "video_id": row["video_id"],
        "title": v.get("title"),
        "channel": v.get("channel"),
        "thumbnail_url": v.get("thumbnail_url") or f"https://i.ytimg.com/vi/{row['video_id']}/hqdefault.jpg",
        "duration_s": duration,
        "last_position_s": float(row.get("last_position_s") or 0),
        "max_watched_s": watched,
        "progress": min(1.0, watched / duration) if duration else None,
        "status": status_for(watched, duration),
        "last_studied_at": row.get("last_studied_at"),
        "ingest_status": v.get("ingest_status"),
        "has_transcript": bool(v.get("has_transcript")),
        "outline_status": outline.get("status"),
        "chapters": len((langs or {}).get("en", {}).get("chapters") or []) if langs else 0,
        "overview": {k: d.get("overview") for k, d in (langs or {}).items()} or None,
        "notes": notes,
    }


def session_minutes(s: dict[str, Any]) -> float:
    a, b = _parse(s.get("started_at")), _parse(s.get("last_seen_at"))
    if not a or not b or b <= a:
        return 0.0
    return min((b - a).total_seconds(), MAX_SESSION_S) / 60


def study_days(sessions: list[dict[str, Any]], *, days: int = 7, today: datetime | None = None) -> list[dict]:
    """Minutes studied per UTC day for the last `days` days, oldest first."""
    today = (today or _now()).date()
    buckets = {today - timedelta(days=i): 0.0 for i in range(days)}
    for s in sessions:
        start = _parse(s.get("started_at"))
        if start and start.date() in buckets:
            buckets[start.date()] += session_minutes(s)
    return [{"date": d.isoformat(), "minutes": round(m, 1)} for d, m in sorted(buckets.items())]


# ------------------------------------------------------------------ service
class LibraryService:
    def __init__(
        self,
        repo: LibraryRepo,
        *,
        memory: InMemoryLibraryRepo | None = None,
        notes: Any = None,
        checkpointer: Any = None,
        flush_s: float = FLUSH_S,
    ):
        self.repo = repo
        self.memory = memory or (repo if isinstance(repo, InMemoryLibraryRepo) else InMemoryLibraryRepo())
        self._notes = notes  # NotesService (recent notes for the dashboard)
        self._checkpointer = checkpointer  # () -> BaseCheckpointSaver | None
        self._flush_s = flush_s
        self._dirty: dict[tuple[str, str], dict[str, Any]] = {}
        self._last_flush: dict[tuple[str, str], float] = {}
        self._flusher: asyncio.Task[None] | None = None
        self._tasks: set[asyncio.Task[Any]] = set()

    def repo_for(self, user_id: str) -> LibraryRepo:
        return self.memory if user_id == ANONYMOUS_ID else self.repo

    # ---- write-behind history (never awaited on a turn)
    def note_position(
        self,
        user_id: str,
        video_id: str,
        *,
        position_s: float,
        max_watched_s: float,
        duration_s: float | None = None,
    ) -> None:
        """Remember where the learner is. Memory only; the flusher writes it within ~FLUSH_S."""
        if not VIDEO_ID.fullmatch(video_id):
            return
        key = (user_id, video_id)
        cur = self._dirty.get(key, {})
        self._dirty[key] = {
            "user_id": user_id,
            "video_id": video_id,
            "last_position_s": round(max(0.0, float(position_s)), 2),
            "max_watched_s": round(max(float(max_watched_s), float(cur.get("max_watched_s") or 0)), 2),
            "duration_s": duration_s or cur.get("duration_s"),
        }
        self._ensure_flusher()

    def _ensure_flusher(self) -> None:
        if self._flusher is None or self._flusher.done():
            try:
                self._flusher = asyncio.get_running_loop().create_task(
                    self._flush_loop(), name="history-flush"
                )
            except RuntimeError:  # no loop (sync caller): the next async call starts it
                self._flusher = None

    async def _flush_loop(self) -> None:
        while self._dirty:
            await asyncio.sleep(min(self._flush_s, 5.0))
            now = time.monotonic()
            due = [k for k in list(self._dirty) if now - self._last_flush.get(k, 0.0) >= self._flush_s]
            for key in due:
                await self._flush_key(key)

    async def _flush_key(self, key: tuple[str, str]) -> None:
        item = self._dirty.pop(key, None)
        if item is None:
            return
        self._last_flush[key] = time.monotonic()
        row = {
            "user_id": item["user_id"],
            "video_id": item["video_id"],
            "last_position_s": item["last_position_s"],
            "max_watched_s": item["max_watched_s"],
            "status": status_for(item["max_watched_s"], item.get("duration_s")),
            "last_studied_at": _iso(_now()),
        }
        try:
            await self.repo_for(item["user_id"]).upsert_history(row)
        except Exception as exc:  # the next heartbeat tries again; voice never notices
            log.warning("history %s/%s not saved: %s", item["user_id"][:8], item["video_id"], exc)
            self._dirty.setdefault(key, item)

    def flush_soon(self, user_id: str, video_id: str) -> asyncio.Task[Any] | None:
        """The socket closed: write this video's latest position now (in the background)."""
        key = (user_id, video_id)
        if key not in self._dirty:
            return None
        task = asyncio.create_task(self._flush_key(key))
        self._tasks.add(task)
        task.add_done_callback(self._tasks.discard)
        return task

    async def flush_all(self) -> None:
        """Tests / shutdown."""
        for key in list(self._dirty):
            await self._flush_key(key)

    # ---- reads
    async def resume(self, user_id: str, video_id: str) -> dict[str, Any]:
        pending = self._dirty.get((user_id, video_id))
        row = await self.repo_for(user_id).get_history(user_id, video_id) or {}
        src = {**row, **(pending or {})}
        return {
            "video_id": video_id,
            "last_position_s": float(src.get("last_position_s") or 0),
            "max_watched_s": max(float(row.get("max_watched_s") or 0), float(src.get("max_watched_s") or 0)),
            "status": row.get("status") or ("in-progress" if pending else "not-started"),
            "last_studied_at": row.get("last_studied_at"),
        }

    async def library(self, user_id: str) -> list[dict[str, Any]]:
        repo = self.repo_for(user_id)
        rows, counts = await asyncio.gather(repo.list_history(user_id), repo.note_counts(user_id))
        return [library_item(r, counts.get(r["video_id"], 0)) for r in rows]

    async def remove(self, user_id: str, video_id: str) -> bool:
        self._dirty.pop((user_id, video_id), None)
        return await self.repo_for(user_id).delete_history(user_id, video_id)

    async def dashboard(self, user_id: str) -> dict[str, Any]:
        repo = self.repo_for(user_id)
        since = _now() - timedelta(days=7)
        items, sessions = await asyncio.gather(
            self.library(user_id), repo.list_sessions(user_id, since=since)
        )
        notes: list[dict[str, Any]] = await self._notes.list(user_id) if self._notes else []
        titles = {i["video_id"]: i["title"] for i in items}
        recent_notes = sorted(notes, key=lambda n: str(n.get("created_at")), reverse=True)[:6]
        days = study_days(sessions)
        return {
            "stats": {
                "videos": len(items),
                "completed": sum(1 for i in items if i["status"] == "completed"),
                "notes": len(notes),
                "sessions_7d": len(sessions),
                "minutes_7d": round(sum(d["minutes"] for d in days), 1),
                "hours_watched": round(sum(i["max_watched_s"] for i in items) / 3600, 1),
            },
            "days": days,
            "recent": items[:6],
            "notes": [{**n, "video_title": titles.get(n["video_id"])} for n in recent_notes],
        }

    async def chats(self, user_id: str, *, limit: int = 30) -> list[dict[str, Any]]:
        """Recent sessions with their Q&A turns (from the checkpointer), newest first. Sessions without
        any turns are left out."""
        repo = self.repo_for(user_id)
        sessions, items = await asyncio.gather(
            repo.list_sessions(user_id, limit=limit), self.library(user_id)
        )
        titles = {i["video_id"]: i["title"] for i in items}
        saver = self._checkpointer() if callable(self._checkpointer) else self._checkpointer
        out = []
        for s in sessions:
            turns = await asyncio.to_thread(session_turns, saver, s["session_id"]) if saver else []
            if turns:
                out.append(
                    {
                        "session_id": s["session_id"],
                        "video_id": s["video_id"],
                        "video_title": titles.get(s["video_id"]),
                        "language": s.get("language"),
                        "started_at": s.get("started_at"),
                        "last_seen_at": s.get("last_seen_at"),
                        "turns": turns,
                    }
                )
        return out

    def record_anonymous_session(self, session_id: str, user_id: str, video_id: str, language: str) -> None:
        if user_id == ANONYMOUS_ID:
            self.memory.record_session(session_id, user_id, video_id, language)


def session_turns(saver: Any, session_id: str) -> list[dict[str, Any]]:
    """The conversation memory of one session as [{question, answer, route, at_s, at}]. Read-only: a
    write-behind saver is read from its hot copy, else straight from Postgres (never hydrated into memory)."""
    config = {"configurable": {"thread_id": session_id, "checkpoint_ns": ""}}
    try:
        hot, cold = getattr(saver, "hot", None), getattr(saver, "cold", None)
        t = (hot.get_tuple(config) if hot else None) or (cold or saver).get_tuple(config)
    except Exception as exc:
        log.warning("session %s: could not read memory (%s)", session_id, type(exc).__name__)
        return []
    if t is None:
        return []
    history = (t.checkpoint.get("channel_values") or {}).get("history") or []
    turns: list[dict[str, Any]] = []
    for i in range(len(history) - 1):
        q, a = history[i], history[i + 1]
        if q.get("role") == "user" and a.get("role") == "assistant":
            turns.append(
                {
                    "question": q.get("text") or "",
                    "answer": a.get("text") or "",
                    "route": a.get("route"),
                    "at_s": q.get("at_s"),
                    "at": q.get("at"),
                }
            )
    return turns


_service: LibraryService | None = None


def get_library_service(settings: Settings | None = None) -> LibraryService:
    global _service
    if _service is None:
        from app.config import get_settings
        from app.orchestration.graph import get_graph
        from app.services.ingest import get_ingest_service
        from app.services.notes import get_notes_service

        s = settings or get_settings()
        notes = get_notes_service()

        async def video_row(vid: str) -> dict[str, Any] | None:
            return await get_ingest_service().repo.get(vid)

        async def anon_notes(uid: str) -> list[dict[str, Any]]:
            return await notes.list(uid)

        memory = InMemoryLibraryRepo(videos=video_row, notes=anon_notes)
        db = bool(s.supabase_url and s.supabase_service_key)
        _service = LibraryService(
            SupabaseLibraryRepo(s) if db else memory,
            memory=memory,
            notes=notes,
            checkpointer=lambda: get_graph().checkpointer,
        )
    return _service


def set_library_service(service: LibraryService | None) -> None:
    global _service
    _service = service
