"""Transcript ingestion (roadmap D10 / Tier 1a): fetch → chunk → embed → store, as a background task.

Entry point is `IngestService.ensure(video_id)`: it returns the current status at once and starts a
run only if the row can be claimed (see `video_repo` for the status machine). Every status change is
written to `videos` and pushed to subscribers, which the WebSocket forwards as `video.status`.

Cache rule (no re-fetch = no credit): if `transcript_segments` already holds the video, TranscriptAPI
is never called again — a retry after an embedding failure only re-chunks and re-embeds.
"""

from __future__ import annotations

import asyncio
import logging
from typing import Any

from app.config import Settings, get_settings
from app.services.chunker import chunk_segments
from app.services.embedder import Embedder, EmbedError, build_embedders, embed_passages
from app.services.transcripts import FailReason, Segment, TranscriptClient, TranscriptResult, extract_video_id
from app.services.video_repo import InMemoryVideoRepo, SupabaseVideoRepo, VideoRepo

log = logging.getLogger("studyloop.ingest")

TRANSIENT_FETCH = {FailReason.TIMEOUT, FailReason.PROVIDER_ERROR}


def snapshot(row: dict[str, Any] | None, video_id: str) -> dict[str, Any]:
    """The public view of a `videos` row: REST responses and the `video.status` WS event."""
    row = row or {}
    reason = row.get("fail_reason")
    status = row.get("ingest_status") or "pending"
    try:
        retryable = status == "failed" and FailReason(reason).retryable
    except ValueError:
        retryable = status == "failed"
    return {
        "video_id": video_id,
        "status": status,
        "has_transcript": bool(row.get("has_transcript")),
        "fail_reason": reason if status in ("failed", "unavailable") else None,
        "retryable": retryable,
        "title": row.get("title"),
        "language": row.get("transcript_lang"),
        "source": row.get("transcript_source"),
        "duration_s": row.get("duration_s"),
        "embed_model": row.get("embed_model"),
    }


def _error_snapshot(video_id: str, reason: FailReason) -> dict[str, Any]:
    return snapshot({"ingest_status": "failed", "fail_reason": reason.value}, video_id) | (
        {"status": "unavailable", "retryable": False} if reason.permanent else {}
    )


class IngestService:
    def __init__(
        self,
        repo: VideoRepo,
        transcripts: TranscriptClient,
        embedders: list[Embedder],
        *,
        transcribing_after_s: float = 8.0,
        retry_backoff_s: float = 2.0,
    ):
        self.repo = repo
        self._transcripts = transcripts
        self._embedders = embedders
        self._transcribing_after_s = transcribing_after_s
        self._retry_backoff_s = retry_backoff_s
        self._tasks: dict[str, asyncio.Task[None]] = {}
        self._subs: dict[str, set[asyncio.Queue[dict[str, Any]]]] = {}

    # ---------------------------------------------------------------- public
    async def status(self, video_id: str) -> dict[str, Any]:
        return snapshot(await self.repo.get(video_id), video_id)

    async def ensure(self, url_or_id: str, *, force: bool = False) -> dict[str, Any]:
        """Current status; starts ingestion when the video is new, failed (after a cooldown, or at once
        with `force`), or stuck. Never raises: storage errors come back as a `failed` snapshot."""
        vid = extract_video_id(url_or_id)
        if not vid:
            return _error_snapshot(url_or_id, FailReason.INVALID_VIDEO)
        try:
            if not self.running(vid):
                await self.repo.ensure_row(vid)
                if await self.repo.claim(vid, force=force):
                    self._start(vid)
            snap = snapshot(await self.repo.get(vid), vid)
            if snap["status"] == "ready" and not self.running(vid):
                log.info("video %s: served from the videos cache, no TranscriptAPI call", vid)
            return snap
        except Exception:
            log.exception("video %s: could not read/claim the videos row", vid)
            return _error_snapshot(vid, FailReason.INTERNAL)

    async def transcript(self, url_or_id: str, *, force: bool = False) -> dict[str, Any]:
        """Status + stored segments (legacy `/transcript` shape kept for the client)."""
        snap = await self.ensure(url_or_id, force=force)
        segments: list[Segment] = []
        if snap["has_transcript"]:
            try:
                segments = await self.repo.get_segments(snap["video_id"])
            except Exception:
                log.exception("video %s: could not read segments", snap["video_id"])
        return {
            **snap,
            "segments": [{"text": s.text, "start": s.start, "duration": s.duration} for s in segments],
            "metadata": {"title": snap["title"]} if snap["title"] else None,
            "length_seconds": snap["duration_s"],
        }

    def running(self, video_id: str) -> bool:
        task = self._tasks.get(video_id)
        return task is not None and not task.done()

    def subscribe(self, video_id: str) -> asyncio.Queue[dict[str, Any]]:
        q: asyncio.Queue[dict[str, Any]] = asyncio.Queue()
        self._subs.setdefault(video_id, set()).add(q)
        return q

    def unsubscribe(self, video_id: str, q: asyncio.Queue[dict[str, Any]]) -> None:
        subs = self._subs.get(video_id)
        if subs:
            subs.discard(q)
            if not subs:
                self._subs.pop(video_id, None)

    async def wait(self, video_id: str) -> None:
        """Tests / scripts: block until the current run (if any) finishes."""
        task = self._tasks.get(video_id)
        if task:
            await asyncio.shield(task)

    # ---------------------------------------------------------------- pipeline
    def _start(self, vid: str) -> None:
        task = asyncio.create_task(self._run(vid), name=f"ingest:{vid}")
        self._tasks[vid] = task
        task.add_done_callback(lambda _t: self._tasks.pop(vid, None) if self._tasks.get(vid) is _t else None)

    async def _set(self, vid: str, **fields: Any) -> None:
        await self.repo.update(vid, fields)
        snap = snapshot(await self.repo.get(vid), vid)
        for q in list(self._subs.get(vid, ())):
            q.put_nowait(snap)

    async def _run(self, vid: str) -> None:
        await self._set(vid)  # announce `fetching` (set by the claim) to subscribers
        try:
            segments = await self.repo.get_segments(vid)
            if segments:
                log.info(
                    "video %s: transcript cache hit (%d segments), no TranscriptAPI call", vid, len(segments)
                )
                await self._set(vid, ingest_status="embedding", has_transcript=True, fail_reason=None)
            else:
                result = await self._fetch(vid)
                if not result.ok:
                    reason = result.fail_reason or FailReason.PROVIDER_ERROR
                    status = "unavailable" if reason.permanent else "failed"
                    log.info("video %s: %s (%s) %s", vid, status, reason.value, (result.detail or "")[:200])
                    await self._set(vid, ingest_status=status, has_transcript=False, fail_reason=reason.value)
                    return
                segments = result.segments
                await self.repo.replace_segments(vid, segments)
                meta = result.metadata or {}
                await self._set(
                    vid,
                    ingest_status="embedding",
                    has_transcript=True,
                    fail_reason=None,
                    transcript_lang=result.language,
                    transcript_source=result.source.value if result.source else None,
                    title=meta.get("title"),
                    channel=meta.get("author_name"),
                    thumbnail_url=meta.get("thumbnail_url"),
                    duration_s=result.length_seconds,
                )
                log.info(
                    "video %s: fetched %d segments (lang=%s, source=%s)",
                    vid,
                    len(segments),
                    result.language,
                    result.source.value if result.source else None,
                )

            chunks = chunk_segments(segments)
            model = dim = vectors = None
            if self._embedders:
                try:
                    model, dim, vectors = await embed_passages(self._embedders, [c.text for c in chunks])
                except EmbedError as exc:
                    await self.repo.replace_chunks(vid, chunks, None)  # full-text search still works
                    log.warning("video %s: embedding failed: %s", vid, exc)
                    await self._set(vid, ingest_status="failed", fail_reason=FailReason.EMBED_ERROR.value)
                    return
            await self.repo.replace_chunks(vid, chunks, vectors)
            await self._set(vid, ingest_status="ready", fail_reason=None, embed_model=model, embed_dim=dim)
            log.info("video %s: ready (%d chunks, embed_model=%s)", vid, len(chunks), model)
        except Exception:
            log.exception("video %s: ingestion crashed", vid)
            try:
                await self._set(vid, ingest_status="failed", fail_reason=FailReason.INTERNAL.value)
            except Exception:
                log.exception("video %s: could not record the failure", vid)

    async def _fetch(self, vid: str) -> TranscriptResult:
        """TranscriptAPI with the `transcribing` signal and one retry on a timeout / provider error.
        A slow response means the provider is generating the transcript (captions-disabled video)."""
        marked = False
        result: TranscriptResult | None = None
        for attempt in (1, 2):
            task = asyncio.create_task(self._transcripts.fetch(vid))
            done, _ = await asyncio.wait({task}, timeout=self._transcribing_after_s)
            if not done and not marked:
                marked = True
                await self._set(vid, ingest_status="transcribing")
            result = await task
            if result.ok or result.fail_reason not in TRANSIENT_FETCH or attempt == 2:
                break
            log.info("video %s: %s, retrying once", vid, result.fail_reason.value)
            await asyncio.sleep(self._retry_backoff_s)
        assert result is not None
        return result


_service: IngestService | None = None


def get_ingest_service(settings: Settings | None = None) -> IngestService:
    global _service
    if _service is None:
        s = settings or get_settings()
        db = bool(s.supabase_url and s.supabase_service_key)
        repo: VideoRepo = SupabaseVideoRepo(s) if db else InMemoryVideoRepo()
        _service = IngestService(repo, TranscriptClient(s), build_embedders(s))
        log.info(
            "ingest: repo=%s embedders=%s",
            type(repo).__name__,
            [e.model for e in _service._embedders] or "none (full-text only)",
        )
    return _service


def set_ingest_service(service: IngestService | None) -> None:
    """Tests: swap the process-wide service (None = rebuild from settings on next use)."""
    global _service
    _service = service
