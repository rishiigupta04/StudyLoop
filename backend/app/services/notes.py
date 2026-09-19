"""Timestamped notes (roadmap Tier 1e, `notes` table in schema v2).

Voice notes: `notes_agent` builds the note in-process (no I/O, so the ack is instant), the WebSocket
sends `note.created` at once, and `finish_voice_note` runs in the background:
insert → LLM summary of the last ~60 s of transcript + what was said → `note.updated`.
The summary is written only while the note has none, so an edit the user made meanwhile wins.

Typed notes and edits go through the REST API (`app/api/notes.py`).

Storage: PostgREST with the service key, every query filtered by the verified `user_id` (the service
key bypasses RLS, so the filter IS the access rule). Anonymous demo users (REQUIRE_AUTH=false) have no
`profiles` row to reference, so their notes live in memory for the life of the process.
"""

from __future__ import annotations

import asyncio
import copy
import logging
import re
import time
import uuid
from collections import OrderedDict
from collections.abc import Awaitable, Callable
from datetime import datetime, timezone
from typing import Any, Protocol

import httpx

from app.config import Settings
from app.orchestration import localize as L

log = logging.getLogger("studyloop.notes")

VIDEO_ID = re.compile(r"^[A-Za-z0-9_-]{6,20}$")
ANONYMOUS_ID = "00000000-0000-0000-0000-000000000000"  # app.auth.ANONYMOUS (not imported: no cycle)

CONTEXT_WINDOW_S = 60.0  # "the last ~60 s of transcript" before the note
CONTEXT_MAX_CHARS = 1800
SUMMARY_MAX_TOKENS = 160
MAX_TEXT = 4000
EDITABLE = ("raw_text", "summary", "is_bookmarked", "at_s")
PUBLIC = (
    "id",
    "video_id",
    "session_id",
    "at_s",
    "raw_text",
    "summary",
    "is_auto",
    "is_bookmarked",
    "created_at",
    "updated_at",
)

Send = Callable[[dict[str, Any]], Awaitable[None]]


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def public(note: dict[str, Any]) -> dict[str, Any]:
    """What the client sees (never the user_id)."""
    return {k: note.get(k) for k in PUBLIC}


def new_note(
    *,
    user_id: str,
    video_id: str,
    at_s: float,
    raw_text: str,
    session_id: str | None = None,
    is_auto: bool = False,
    is_bookmarked: bool = False,
) -> dict[str, Any]:
    now = _now()
    return {
        "id": str(uuid.uuid4()),
        "user_id": user_id,
        "video_id": video_id,
        "session_id": session_id,
        "at_s": round(max(0.0, float(at_s)), 2),
        "raw_text": raw_text[:MAX_TEXT],
        "summary": None,
        "is_auto": is_auto,
        "is_bookmarked": is_bookmarked,
        "created_at": now,
        "updated_at": now,
    }


class NotesError(RuntimeError):
    pass


class NotesRepo(Protocol):
    async def list(self, user_id: str, video_id: str | None = None) -> list[dict[str, Any]]: ...
    async def create(self, note: dict[str, Any]) -> dict[str, Any]: ...
    async def update(
        self, user_id: str, note_id: str, fields: dict[str, Any], *, only_if_no_summary: bool = False
    ) -> dict[str, Any] | None: ...
    async def delete(self, user_id: str, note_id: str) -> bool: ...


# ------------------------------------------------------------------ in-memory
class InMemoryNotesRepo:
    def __init__(self) -> None:
        self.rows: dict[str, dict[str, Any]] = {}

    async def list(self, user_id: str, video_id: str | None = None) -> list[dict[str, Any]]:
        rows = [
            r
            for r in self.rows.values()
            if r["user_id"] == user_id and (video_id is None or r["video_id"] == video_id)
        ]
        return copy.deepcopy(sorted(rows, key=lambda r: (r["video_id"], r["at_s"])))

    async def create(self, note: dict[str, Any]) -> dict[str, Any]:
        self.rows[note["id"]] = copy.deepcopy(note)
        return copy.deepcopy(note)

    async def update(
        self, user_id: str, note_id: str, fields: dict[str, Any], *, only_if_no_summary: bool = False
    ) -> dict[str, Any] | None:
        row = self.rows.get(note_id)
        if row is None or row["user_id"] != user_id:
            return None
        if only_if_no_summary and row.get("summary"):
            return None
        row.update(fields, updated_at=_now())
        return copy.deepcopy(row)

    async def delete(self, user_id: str, note_id: str) -> bool:
        row = self.rows.get(note_id)
        if row is None or row["user_id"] != user_id:
            return False
        del self.rows[note_id]
        return True


# ------------------------------------------------------------------ Supabase (PostgREST)
class SupabaseNotesRepo:
    def __init__(self, settings: Settings, client: httpx.AsyncClient | None = None):
        self._base = f"{settings.supabase_url.rstrip('/')}/rest/v1"
        key = settings.supabase_service_key
        # new-style sb_secret_ keys go in `apikey` only; a legacy service_role JWT also as the bearer
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
            raise NotesError(f"HTTP {exc.response.status_code} {exc.response.text[:200]}") from exc
        except httpx.HTTPError as exc:
            raise NotesError(type(exc).__name__) from exc
        return r

    async def list(self, user_id: str, video_id: str | None = None) -> list[dict[str, Any]]:
        params = {
            "user_id": f"eq.{user_id}",
            "select": "*",
            "order": "video_id.asc,at_s.asc",
            "limit": "2000",
        }
        if video_id is not None:
            params["video_id"] = f"eq.{video_id}"
        return (await self._req("GET", "notes", params=params)).json()

    async def create(self, note: dict[str, Any]) -> dict[str, Any]:
        # FK parent: the shared video cache row (normally there already: opening a video creates it)
        await self._req(
            "POST",
            "videos",
            params={"on_conflict": "video_id"},
            json=[{"video_id": note["video_id"]}],
            prefer="resolution=ignore-duplicates,return=minimal",
        )
        row = {k: v for k, v in note.items() if k not in ("created_at", "updated_at")}
        try:
            r = await self._req("POST", "notes", json=[row], prefer="return=representation")
        except NotesError as exc:
            # the session row is written in the background at hello; if it never landed, keep the note
            if row.get("session_id") and "409" in str(exc):
                log.info("note %s: session %s not recorded, saving without it", row["id"], row["session_id"])
                r = await self._req(
                    "POST", "notes", json=[{**row, "session_id": None}], prefer="return=representation"
                )
            else:
                raise
        return r.json()[0]

    async def update(
        self, user_id: str, note_id: str, fields: dict[str, Any], *, only_if_no_summary: bool = False
    ) -> dict[str, Any] | None:
        params = {"id": f"eq.{note_id}", "user_id": f"eq.{user_id}"}
        if only_if_no_summary:
            params["summary"] = "is.null"
        r = await self._req(
            "PATCH",
            "notes",
            params=params,
            json={**fields, "updated_at": _now()},
            prefer="return=representation",
        )
        rows = r.json()
        return rows[0] if rows else None

    async def delete(self, user_id: str, note_id: str) -> bool:
        r = await self._req(
            "DELETE",
            "notes",
            params={"id": f"eq.{note_id}", "user_id": f"eq.{user_id}"},
            prefer="return=representation",
        )
        return bool(r.json())


# ------------------------------------------------------------------ service
def transcript_before(segments: list[Any], at_s: float, window_s: float = CONTEXT_WINDOW_S) -> str:
    """The transcript the learner just heard: segments overlapping [at_s - window_s, at_s]. Nothing after
    at_s (watched-only, like Q&A)."""
    lo = at_s - window_s
    parts = [s.text for s in segments if s.start < at_s and s.start + s.duration > lo]
    text = " ".join(" ".join(parts).split())
    return text[-CONTEXT_MAX_CHARS:]


def summary_messages(spoken: str, context: str, at_s: float, lang: str) -> list[dict[str, str]]:
    language = (
        "Hindi in Devanagari script, but write technical terms in English in Latin letters exactly as the "
        "lecturer says them (e.g. 'divide and conquer', 'array', 'peak', 'O(log n)'), never transliterated"
        if lang == "hi"
        else "English"
    )
    system = (
        "You write short study notes for a learner watching a lecture. At "
        f"{L.fmt_clock(at_s)} the learner asked, by voice, to save a note. Using the transcript of the minute "
        "before that moment, write ONE note of 1-2 sentences (at most 40 words) capturing the key point being "
        "explained. If the learner dictated specific content, keep that content, made precise with the "
        f"transcript. Write in {language}. Plain text only: no markdown, no timestamps, no preamble like "
        "'Note:'. Use only the transcript and what the learner said."
    )
    user = f"Transcript (last minute):\n{context}\n\nLearner said: {spoken}"
    return [{"role": "system", "content": system}, {"role": "user", "content": user}]


def clean_summary(text: str) -> str:
    text = " ".join(text.replace("**", "").split()).strip().strip('"').strip()
    return re.sub(r"^(note|नोट)\s*[:：-]\s*", "", text, flags=re.IGNORECASE)[:600]


class NotesService:
    def __init__(
        self,
        repo: NotesRepo,
        *,
        memory: InMemoryNotesRepo | None = None,
        segments: Callable[[str], Awaitable[list[Any]]] | None = None,
        llm: Any = None,
        segments_ttl_s: float = 600,
    ):
        self.repo = repo
        self.memory = memory or (repo if isinstance(repo, InMemoryNotesRepo) else InMemoryNotesRepo())
        self._segments_fn = segments
        self._llm = llm
        self._ttl = segments_ttl_s
        self._seg_cache: OrderedDict[str, tuple[float, list[Any]]] = OrderedDict()
        self._tasks: set[asyncio.Task[Any]] = set()  # strong refs: background work outlives the socket

    def repo_for(self, user_id: str) -> NotesRepo:
        return self.memory if user_id == ANONYMOUS_ID else self.repo

    # ---- CRUD
    async def list(self, user_id: str, video_id: str | None = None) -> list[dict[str, Any]]:
        return [public(n) for n in await self.repo_for(user_id).list(user_id, video_id)]

    async def create(self, note: dict[str, Any]) -> dict[str, Any]:
        return public(await self.repo_for(note["user_id"]).create(note))

    async def update(self, user_id: str, note_id: str, fields: dict[str, Any]) -> dict[str, Any] | None:
        fields = {k: v for k, v in fields.items() if k in EDITABLE}
        row = await self.repo_for(user_id).update(user_id, note_id, fields)
        return public(row) if row else None

    async def delete(self, user_id: str, note_id: str) -> bool:
        return await self.repo_for(user_id).delete(user_id, note_id)

    # ---- voice notes
    async def _segments(self, video_id: str) -> list[Any]:
        hit = self._seg_cache.get(video_id)
        if hit and time.monotonic() - hit[0] < self._ttl:
            return hit[1]
        if self._segments_fn is None:
            return []
        segs = await self._segments_fn(video_id)
        if segs:
            self._seg_cache[video_id] = (time.monotonic(), segs)
            while len(self._seg_cache) > 16:
                self._seg_cache.popitem(last=False)
        return segs

    async def summarize(self, note: dict[str, Any], *, spoken: str, language: str) -> str | None:
        """None when there's nothing to summarize (no transcript) or no LLM; raises LLMError on failure."""
        llm = self._llm() if callable(self._llm) else self._llm
        if llm is None or not llm.configured:
            return None
        context = transcript_before(await self._segments(note["video_id"]), float(note["at_s"]))
        if not context:
            return None
        text = await llm.stream(
            summary_messages(spoken, context, float(note["at_s"]), language),
            max_tokens=SUMMARY_MAX_TOKENS,
            temperature=0.2,
        )
        return clean_summary(text) or None

    def start_voice_note(
        self, note: dict[str, Any], *, spoken: str, language: str, send: Send | None = None
    ) -> asyncio.Task[Any]:
        task = asyncio.create_task(self.finish_voice_note(note, spoken=spoken, language=language, send=send))
        self._tasks.add(task)
        task.add_done_callback(self._tasks.discard)
        return task

    async def finish_voice_note(
        self, note: dict[str, Any], *, spoken: str, language: str, send: Send | None = None
    ) -> dict[str, Any]:
        """Background half of a voice note: persist, summarize, push `note.updated`. Never raises."""
        repo = self.repo_for(note["user_id"])
        saved = bool(VIDEO_ID.fullmatch(note["video_id"]))
        try:
            if saved:
                await repo.create(note)
        except Exception as exc:
            saved = False
            log.warning("note %s: could not save: %s", note["id"], exc)

        summary: str | None = None
        status = "skipped"
        try:
            summary = await self.summarize(note, spoken=spoken, language=language)
            status = "done" if summary else "skipped"
        except Exception as exc:
            status = "failed"
            log.warning("note %s: summary failed: %s", note["id"], exc)

        out = public(note)
        if summary:
            out["summary"] = summary
            if saved:
                try:
                    row = await repo.update(
                        note["user_id"], note["id"], {"summary": summary}, only_if_no_summary=True
                    )
                    if row is None:  # the user wrote their own text meanwhile: theirs wins
                        out["summary"], status = None, "kept"
                except Exception as exc:
                    log.warning("note %s: could not store the summary: %s", note["id"], exc)
        log.info("note %s at %s: saved=%s summary=%s", note["id"], L.fmt_clock(note["at_s"]), saved, status)
        if send is not None:
            try:
                await send({"type": "note.updated", "note": out, "summary_status": status, "saved": saved})
            except Exception:  # the socket closed meanwhile; the note is stored anyway
                pass
        return {"note": out, "summary_status": status, "saved": saved}


_service: NotesService | None = None


def get_notes_service(settings: Settings | None = None) -> NotesService:
    global _service
    if _service is None:
        from app.config import get_settings
        from app.services.ingest import get_ingest_service
        from app.services.llm import get_llm

        s = settings or get_settings()
        db = bool(s.supabase_url and s.supabase_service_key)
        repo: NotesRepo = SupabaseNotesRepo(s) if db else InMemoryNotesRepo()
        _service = NotesService(
            repo,
            segments=lambda vid: get_ingest_service().repo.get_segments(vid),
            llm=get_llm,
        )
    return _service


def set_notes_service(service: NotesService | None) -> None:
    global _service
    _service = service
