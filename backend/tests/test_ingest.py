"""Tier 1a done-when, at the service level: ingests once, second request is a cache hit (no TranscriptAPI
call), captions-disabled (slow, generated) videos go through `transcribing`, failures carry a reason."""

import asyncio
from datetime import timedelta

import pytest

from app.services import ingest as I
from app.services.embedder import EmbedError
from app.services.transcripts import FailReason, Segment, TranscriptResult, TranscriptSource
from app.services.video_repo import InMemoryVideoRepo

VID = "aircAruvnKk"


def ok(vid=VID, n=40, source=TranscriptSource.CREATOR, language="en"):
    return TranscriptResult(
        video_id=vid,
        ok=True,
        language=language,
        source=source,
        segments=[Segment(f"word{i}", i * 4.0, 4.0) for i in range(n)],
        metadata={"title": "Neural nets", "author_name": "3b1b", "thumbnail_url": "http://t"},
        length_seconds=n * 4.0,
    )


def fail(reason, vid=VID):
    return TranscriptResult(video_id=vid, ok=False, fail_reason=reason)


class FakeTranscripts:
    def __init__(self, *results, delay=0.0):
        self.results = list(results)
        self.calls = 0
        self.delay = delay

    async def fetch(self, vid):
        self.calls += 1
        if self.delay:
            await asyncio.sleep(self.delay)
        return self.results.pop(0) if len(self.results) > 1 else self.results[0]


class FakeEmbedder:
    model, dim = "fake-bge", 1024

    def __init__(self, fail=False):
        self.fail, self.calls = fail, 0

    async def embed(self, texts, *, kind):
        self.calls += 1
        assert kind == "passage"
        if self.fail:
            raise EmbedError("hf down")
        return [[0.5] * 1024 for _ in texts]


def service(transcripts, embedders=None, **kw):
    kw.setdefault("transcribing_after_s", 5)
    kw.setdefault("retry_backoff_s", 0)
    return I.IngestService(
        InMemoryVideoRepo(), transcripts, [FakeEmbedder()] if embedders is None else embedders, **kw
    )


async def run(svc, vid=VID, **kw):
    snap = await svc.ensure(vid, **kw)
    await svc.wait(snap["video_id"])
    return snap, await svc.status(snap["video_id"])


async def test_new_video_ingests_once_then_cache_hit(caplog):
    t = FakeTranscripts(ok())
    svc = service(t)
    first, final = await run(svc, f"https://youtu.be/{VID}")
    assert first["status"] == "fetching"
    assert final["status"] == "ready" and final["has_transcript"] and final["fail_reason"] is None
    assert (
        final["title"] == "Neural nets"
        and final["source"] == "creator"
        and final["embed_model"] == "fake-bge"
    )
    repo = svc.repo
    assert len(repo.segments[VID]) == 40 and repo.chunks[VID] and repo.chunks[VID][0]["embedding"]
    assert all(c["end_s"] >= c["start_s"] for c in repo.chunks[VID])

    again, final2 = await run(svc)
    assert again["status"] == "ready" and final2 == final
    assert t.calls == 1  # no second TranscriptAPI credit

    body = await svc.transcript(VID)
    assert len(body["segments"]) == 40 and body["segments"][1] == {
        "text": "word1",
        "start": 4.0,
        "duration": 4.0,
    }
    assert body["has_transcript"] and body["metadata"] == {"title": "Neural nets"} and t.calls == 1


async def test_concurrent_requests_share_one_run():
    t = FakeTranscripts(ok(), delay=0.05)
    svc = service(t)
    snaps = await asyncio.gather(*(svc.ensure(VID) for _ in range(5)))
    await svc.wait(VID)
    assert t.calls == 1 and {s["status"] for s in snaps} == {"fetching"}


async def test_slow_generated_transcript_goes_through_transcribing():
    t = FakeTranscripts(ok(source=TranscriptSource.API_GENERATED, language=None), delay=0.05)
    svc = service(t, transcribing_after_s=0.01)
    q = svc.subscribe(VID)
    _, final = await run(svc)
    seen = []
    while not q.empty():
        seen.append(q.get_nowait()["status"])
    assert seen[0] == "fetching" and "transcribing" in seen and seen[-1] == "ready"
    assert seen.index("transcribing") < seen.index("embedding") < seen.index("ready")
    assert final["source"] == "api_generated"


async def test_timeout_retried_once():
    t = FakeTranscripts(fail(FailReason.TIMEOUT), ok())
    _, final = await run(service(t))
    assert t.calls == 2 and final["status"] == "ready"

    t = FakeTranscripts(fail(FailReason.TIMEOUT))
    _, final = await run(service(t))
    assert t.calls == 2  # only one retry
    assert final["status"] == "failed" and final["fail_reason"] == "timeout" and final["retryable"]


@pytest.mark.parametrize("reason", [FailReason.UNAVAILABLE, FailReason.NO_SPEECH])
async def test_permanent_failure_is_unavailable_and_not_retried(reason):
    t = FakeTranscripts(fail(reason))
    svc = service(t)
    _, final = await run(svc)
    assert final["status"] == "unavailable" and final["fail_reason"] == reason.value
    assert not final["retryable"] and not final["has_transcript"] and t.calls == 1
    _, again = await run(svc, force=True)  # even a forced retry doesn't re-check a private/live video today
    assert again == final and t.calls == 1


async def test_failed_waits_for_cooldown_unless_forced():
    t = FakeTranscripts(fail(FailReason.NO_PLAN), ok())
    svc = service(t)
    _, final = await run(svc)
    assert final["status"] == "failed" and final["fail_reason"] == "no_plan" and not final["retryable"]
    _, same = await run(svc)
    assert same["status"] == "failed" and t.calls == 1  # within cooldown: no hammering the provider
    _, fixed = await run(svc, force=True)
    assert fixed["status"] == "ready" and t.calls == 2


async def test_failed_reclaimed_after_cooldown():
    t = FakeTranscripts(fail(FailReason.RATE_LIMITED), ok())
    svc = service(t)
    await run(svc)
    svc.repo.videos[VID]["updated_at"] -= timedelta(minutes=5)
    _, final = await run(svc)
    assert final["status"] == "ready" and t.calls == 2


async def test_embed_failure_keeps_transcript_and_retry_skips_fetch():
    t = FakeTranscripts(ok())
    emb = FakeEmbedder(fail=True)
    svc = service(t, [emb])
    _, final = await run(svc)
    assert final["status"] == "failed" and final["fail_reason"] == "embed_error" and final["retryable"]
    assert final["has_transcript"]  # transcript tab still works
    assert svc.repo.chunks[VID][0]["embedding"] is None  # chunks stored for full-text search
    emb.fail = False
    _, fixed = await run(svc, force=True)
    assert fixed["status"] == "ready" and t.calls == 1  # re-embedded from stored segments, no new credit


async def test_no_embedder_still_ready_full_text_only():
    svc = service(FakeTranscripts(ok()), embedders=[])
    _, final = await run(svc)
    assert final["status"] == "ready" and final["embed_model"] is None
    assert svc.repo.chunks[VID][0]["embedding"] is None


async def test_stuck_in_progress_is_reclaimed():
    t = FakeTranscripts(ok())
    svc = service(t)
    await svc.repo.ensure_row(VID)
    await svc.repo.update(VID, {"ingest_status": "transcribing"})
    _, same = await run(svc)
    assert same["status"] == "transcribing" and t.calls == 0  # someone else is on it
    svc.repo.videos[VID]["updated_at"] -= timedelta(minutes=11)
    _, final = await run(svc)
    assert final["status"] == "ready" and t.calls == 1


async def test_invalid_video_never_touches_storage():
    svc = service(FakeTranscripts(ok()))
    snap = await svc.ensure("not a video")
    assert snap["status"] == "unavailable" and snap["fail_reason"] == "invalid_video"
    assert svc.repo.videos == {}


async def test_crash_is_recorded_as_internal():
    class Boom(FakeTranscripts):
        async def fetch(self, vid):
            raise RuntimeError("bug")

    _, final = await run(service(Boom(ok())))
    assert final["status"] == "failed" and final["fail_reason"] == "internal" and final["retryable"]


async def test_storage_down_returns_explained_snapshot():
    class DownRepo(InMemoryVideoRepo):
        async def ensure_row(self, video_id):
            raise ConnectionError("supabase down")

    svc = I.IngestService(DownRepo(), FakeTranscripts(ok()), [])
    snap = await svc.ensure(VID)
    assert snap["status"] == "failed" and snap["fail_reason"] == "internal" and snap["retryable"]


async def test_unsubscribe_cleans_up():
    svc = service(FakeTranscripts(ok()))
    q = svc.subscribe(VID)
    svc.unsubscribe(VID, q)
    assert svc._subs == {}


async def test_cache_hit_is_logged(caplog):
    svc = service(FakeTranscripts(ok()))
    await run(svc)
    with caplog.at_level("INFO", logger="studyloop.ingest"):
        await svc.ensure(VID)
    assert "served from the videos cache, no TranscriptAPI call" in caplog.text
