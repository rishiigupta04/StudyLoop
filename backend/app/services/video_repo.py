"""`videos` / `transcript_segments` / `transcript_chunks` storage (schema v2, roadmap §4).

The `videos` row is the shared, cross-user cache: once a video is `ready`, nobody fetches it from
TranscriptAPI again. Writes go through PostgREST with the service key (bypasses RLS; users can only
read these tables). `InMemoryVideoRepo` backs tests and a local demo without Supabase.

Status machine (Tier 1a):
  pending → fetching → [transcribing] → embedding → ready
                    ↘ unavailable (permanent: private / live / removed / no speech)
                    ↘ failed      (transient or config: retry allowed after a cooldown, or on demand)
A run starts only by *claiming* the row (a conditional update), so two server instances or two tabs
never ingest the same video twice. A row stuck mid-ingest (crashed worker) becomes claimable again
after STALE_AFTER.
"""

from __future__ import annotations

import asyncio
import copy
import json
import logging
from collections.abc import Sequence
from datetime import datetime, timedelta, timezone
from typing import Any, Protocol

import httpx

from app.config import Settings
from app.services.chunker import Chunk
from app.services.transcripts import Segment

log = logging.getLogger("studyloop.videos")

IN_PROGRESS = ("fetching", "transcribing", "embedding")
FINAL = ("ready", "unavailable", "failed")
FAILED_COOLDOWN = timedelta(minutes=2)  # automatic re-attempt of a failed ingest (retry=True skips it)
UNAVAILABLE_RECHECK = timedelta(days=1)  # a live stream becomes a normal video eventually
STALE_AFTER = timedelta(minutes=10)

VIDEO_COLUMNS = (
    "video_id,title,channel,thumbnail_url,duration_s,transcript_lang,transcript_source,has_transcript,"
    "ingest_status,fail_reason,embed_model,embed_dim,updated_at"
)


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def _parse_ts(v: Any) -> datetime:
    if isinstance(v, datetime):
        return v
    try:
        return datetime.fromisoformat(str(v).replace("Z", "+00:00"))
    except ValueError:
        return datetime.fromtimestamp(0, timezone.utc)


def claimable(row: dict[str, Any], *, now: datetime, force: bool) -> bool:
    status = row.get("ingest_status") or "pending"
    age = now - _parse_ts(row.get("updated_at") or now)
    if status == "pending":
        return True
    if status == "failed":
        return force or age >= FAILED_COOLDOWN
    if status == "unavailable":
        return age >= UNAVAILABLE_RECHECK
    if status in IN_PROGRESS:
        return age >= STALE_AFTER
    return False  # ready


class VideoRepo(Protocol):
    async def get(self, video_id: str) -> dict[str, Any] | None: ...
    async def ensure_row(self, video_id: str) -> None: ...
    async def claim(self, video_id: str, *, force: bool = False) -> bool: ...
    async def update(self, video_id: str, fields: dict[str, Any]) -> None: ...
    async def get_segments(self, video_id: str) -> list[Segment]: ...
    async def replace_segments(self, video_id: str, segments: Sequence[Segment]) -> None: ...
    async def replace_chunks(
        self, video_id: str, chunks: Sequence[Chunk], vectors: Sequence[Sequence[float]] | None
    ) -> None: ...
    async def get_chunks(self, video_id: str) -> list[dict[str, Any]]:
        """[{idx, start_s, end_s, text, embedding: list[float] | None}] ordered by idx."""
        ...


# ------------------------------------------------------------------ in-memory
class InMemoryVideoRepo:
    def __init__(self) -> None:
        self.videos: dict[str, dict[str, Any]] = {}
        self.segments: dict[str, list[Segment]] = {}
        self.chunks: dict[str, list[dict[str, Any]]] = {}
        self._lock = asyncio.Lock()

    async def get(self, video_id: str) -> dict[str, Any] | None:
        row = self.videos.get(video_id)
        return copy.deepcopy(row) if row else None

    async def ensure_row(self, video_id: str) -> None:
        self.videos.setdefault(
            video_id,
            {
                "video_id": video_id,
                "ingest_status": "pending",
                "has_transcript": False,
                "updated_at": now_utc(),
            },
        )

    async def claim(self, video_id: str, *, force: bool = False) -> bool:
        async with self._lock:
            row = self.videos.get(video_id)
            if row is None or not claimable(row, now=now_utc(), force=force):
                return False
            row.update(ingest_status="fetching", updated_at=now_utc())
            return True

    async def update(self, video_id: str, fields: dict[str, Any]) -> None:
        self.videos.setdefault(video_id, {"video_id": video_id}).update(fields, updated_at=now_utc())

    async def get_segments(self, video_id: str) -> list[Segment]:
        return list(self.segments.get(video_id, []))

    async def replace_segments(self, video_id: str, segments: Sequence[Segment]) -> None:
        self.segments[video_id] = list(segments)

    async def replace_chunks(
        self, video_id: str, chunks: Sequence[Chunk], vectors: Sequence[Sequence[float]] | None
    ) -> None:
        self.chunks[video_id] = [
            {**c.__dict__, "embedding": list(vectors[i]) if vectors else None} for i, c in enumerate(chunks)
        ]

    async def get_chunks(self, video_id: str) -> list[dict[str, Any]]:
        return copy.deepcopy(self.chunks.get(video_id, []))


# ------------------------------------------------------------------ Supabase (PostgREST)
def _vector_literal(v: Sequence[float]) -> str:
    # pgvector's text input format; PostgREST casts the string into the vector column
    return "[" + ",".join(f"{x:.7g}" for x in v) + "]"


class SupabaseVideoRepo:
    PAGE = 1000  # PostgREST's default max-rows on Supabase

    def __init__(self, settings: Settings, client: httpx.AsyncClient | None = None):
        self._base = f"{settings.supabase_url.rstrip('/')}/rest/v1"
        key = settings.supabase_service_key
        # new-style sb_secret_ keys go in `apikey` only; a legacy service_role JWT also as the bearer
        self._headers = {"apikey": key, "Content-Type": "application/json"}
        if key.startswith("eyJ"):
            self._headers["Authorization"] = f"Bearer {key}"
        self._client = client or httpx.AsyncClient(timeout=15.0)

    async def _req(self, method: str, table: str, *, prefer: str | None = None, **kw: Any) -> httpx.Response:
        headers = {**self._headers, **({"Prefer": prefer} if prefer else {})}
        r = await self._client.request(method, f"{self._base}/{table}", headers=headers, **kw)
        r.raise_for_status()
        return r

    async def get(self, video_id: str) -> dict[str, Any] | None:
        r = await self._req("GET", "videos", params={"video_id": f"eq.{video_id}", "select": VIDEO_COLUMNS})
        rows = r.json()
        return rows[0] if rows else None

    async def ensure_row(self, video_id: str) -> None:
        await self._req(
            "POST",
            "videos",
            params={"on_conflict": "video_id"},
            json=[{"video_id": video_id}],
            prefer="resolution=ignore-duplicates,return=minimal",
        )

    async def claim(self, video_id: str, *, force: bool = False) -> bool:
        now = now_utc()

        def before(d: timedelta) -> str:
            # quoted: `.`, `:` and `,` are reserved inside PostgREST logic trees
            return f'updated_at.lt."{(now - d).isoformat()}"'

        failed = (
            "ingest_status.eq.failed" if force else f"and(ingest_status.eq.failed,{before(FAILED_COOLDOWN)})"
        )
        cond = (
            f"(ingest_status.eq.pending,{failed},"
            f"and(ingest_status.eq.unavailable,{before(UNAVAILABLE_RECHECK)}),"
            f"and(ingest_status.in.({','.join(IN_PROGRESS)}),{before(STALE_AFTER)}))"
        )  # same rules as `claimable`
        # one conditional UPDATE: only the caller whose filter still matches gets a row back
        r = await self._req(
            "PATCH",
            "videos",
            params={"video_id": f"eq.{video_id}", "or": cond},
            json={"ingest_status": "fetching", "updated_at": now.isoformat()},
            prefer="return=representation",
        )
        return bool(r.json())

    async def update(self, video_id: str, fields: dict[str, Any]) -> None:
        await self._req(
            "PATCH",
            "videos",
            params={"video_id": f"eq.{video_id}"},
            json={**fields, "updated_at": now_utc().isoformat()},
            prefer="return=minimal",
        )

    async def get_segments(self, video_id: str) -> list[Segment]:
        out: list[Segment] = []
        while True:
            r = await self._req(
                "GET",
                "transcript_segments",
                params={
                    "video_id": f"eq.{video_id}",
                    "select": "idx,start_s,duration_s,text",
                    "order": "idx.asc",
                    "limit": str(self.PAGE),
                    "offset": str(len(out)),
                },
            )
            rows = r.json()
            out.extend(Segment(text=x["text"], start=x["start_s"], duration=x["duration_s"]) for x in rows)
            if len(rows) < self.PAGE:
                return out

    async def replace_segments(self, video_id: str, segments: Sequence[Segment]) -> None:
        await self._req("DELETE", "transcript_segments", params={"video_id": f"eq.{video_id}"})
        rows = [
            {"video_id": video_id, "idx": i, "start_s": s.start, "duration_s": s.duration, "text": s.text}
            for i, s in enumerate(segments)
        ]
        for i in range(0, len(rows), 500):
            await self._req("POST", "transcript_segments", json=rows[i : i + 500], prefer="return=minimal")

    async def replace_chunks(
        self, video_id: str, chunks: Sequence[Chunk], vectors: Sequence[Sequence[float]] | None
    ) -> None:
        await self._req("DELETE", "transcript_chunks", params={"video_id": f"eq.{video_id}"})
        rows = [
            {
                "video_id": video_id,
                "idx": c.idx,
                "start_s": c.start_s,
                "end_s": c.end_s,
                "text": c.text,
                "embedding": _vector_literal(vectors[i]) if vectors else None,
            }
            for i, c in enumerate(chunks)
        ]
        for i in range(0, len(rows), 50):  # ~10 KB per row with a 1024-d vector
            await self._req("POST", "transcript_chunks", json=rows[i : i + 50], prefer="return=minimal")

    async def get_chunks(self, video_id: str) -> list[dict[str, Any]]:
        out: list[dict[str, Any]] = []
        while True:
            r = await self._req(
                "GET",
                "transcript_chunks",
                params={
                    "video_id": f"eq.{video_id}",
                    "select": "idx,start_s,end_s,text,embedding",
                    "order": "idx.asc",
                    "limit": str(self.PAGE),
                    "offset": str(len(out)),
                },
            )
            rows = r.json()
            for row in rows:
                emb = row.get("embedding")
                # pgvector comes back in its text form "[0.1,0.2,…]", which is valid JSON
                row["embedding"] = json.loads(emb) if isinstance(emb, str) else emb
            out.extend(rows)
            if len(rows) < self.PAGE:
                return out
