"""Tier 2 chapters + structured summary: map → reduce over stored chunks, validated, bilingual, generated in
the background after `ready`, backfilled for old videos without a TranscriptAPI call."""

import json
from datetime import timedelta
from urllib.parse import parse_qs, urlsplit

import httpx
import pytest

from app.config import Settings
from app.services import ingest as I
from app.services import outline as O
from app.services.chunker import Chunk
from app.services.transcripts import Segment
from app.services.video_repo import InMemoryVideoRepo, SupabaseVideoRepo, now_utc, outline_claimable

from .test_ingest import FakeEmbedder, FakeTranscripts, ok

VID = "aircAruvnKk"


def chunks(n=30, step=50.0):
    return [
        {"idx": i, "start_s": i * step, "end_s": i * step + 60, "text": f"topic words {i}"} for i in range(n)
    ]


def map_reply(*times):
    return json.dumps({"topics": [{"t": t, "title": f"Topic {t}", "points": ["a", "b"]} for t in times]})


def reduce_reply(lang="en", chapter_times=("0:00", "10:00", "20:00")):
    word = "अध्याय" if lang == "hi" else "Chapter"
    return json.dumps(
        {
            "overview": f"{word} overview.",
            "chapters": [{"t": t, "title": f"{word} {t}", "summary": "s"} for t in chapter_times],
            "parts": [
                {"title": "Part A", "sections": [{"t": "0:00", "title": "Intro", "bullets": ["x", "y"]}]},
                {"title": "Part B", "sections": [{"t": "15:00", "title": "Core", "bullets": ["z"]}]},
            ],
        }
    )


class FakeComplete:
    """Answers map requests (fast=True) and reduce requests per language; records every call."""

    def __init__(self, *, hi_fails=False, map_fails=False, rate_limited=0):
        self.calls: list[dict] = []
        self.hi_fails, self.map_fails, self.rate_limited = hi_fails, map_fails, rate_limited

    async def __call__(self, messages, *, max_tokens, fast=False):
        self.calls.append({"fast": fast, "system": messages[0]["content"], "user": messages[1]["content"]})
        if self.rate_limited:
            self.rate_limited -= 1
            raise RuntimeError("groq HTTP 429: rate limit")
        if fast:
            if self.map_fails:
                return "sorry, no JSON"
            times = [
                line[1 : line.index("]")]
                for line in messages[1]["content"].splitlines()
                if line.startswith("[")
            ]
            return map_reply(times[0], times[len(times) // 2])
        if "Devanagari" in messages[0]["content"]:
            if self.hi_fails:
                return "not json"
            return reduce_reply("hi")
        return reduce_reply("en")


# ------------------------------------------------------------------ pure helpers
def test_parse_clock_and_snap():
    assert O.parse_clock("12:30") == 750 and O.parse_clock("1:02:03") == 3723 and O.parse_clock(90) == 90
    assert O.parse_clock("【16:38】") == 998  # gpt-oss brackets
    assert O.parse_clock("soon") is None and O.parse_clock(-3) is None
    anchors = [0.0, 50.0, 100.0]
    assert O.snap(75, anchors) == 50 and O.snap(100, anchors) == 100 and O.snap(999, anchors) == 100


def test_parse_json_tolerates_fences_and_rejects_garbage():
    assert O.parse_json('```json\n{"a": 1}\n```') == {"a": 1}
    with pytest.raises(O.OutlineError):
        O.parse_json("no json here")
    with pytest.raises(O.OutlineError):
        O.parse_json("{broken")


def test_windows_split_by_time_and_chars():
    ws = O.windows(chunks(30))  # 30 × 50 s = 25 min → 10-minute windows
    assert [len(w) for w in ws] == [12, 12, 6]
    big = [{"start_s": i, "end_s": i + 1, "text": "x" * 5000} for i in range(3)]
    assert [len(w) for w in O.windows(big)] == [1, 1, 1]


def test_build_lang_snaps_sorts_dedupes_and_fills_ends():
    anchors = [0.0, 50.0, 100.0, 600.0, 610.0, 1200.0]
    reply = json.dumps(
        {
            "overview": "  An **overview**  ",
            "chapters": [
                {"t": "20:05", "title": "Third", "summary": "c"},
                {"t": "0:40", "title": "First", "summary": "a"},
                {"t": "10:00", "title": "Second", "summary": "b"},
                {"t": "10:10", "title": "Dup of second", "summary": "x"},  # 10 s later: dropped
                {"t": "99:00", "title": "Past the end"},  # beyond the duration: dropped
                {"t": "nope", "title": "No time"},
                "junk",
            ],
            "parts": [
                {"title": "Late", "sections": [{"t": "20:00", "title": "S", "bullets": ["b1"]}]},
                {"title": "Early", "sections": [{"t": "0:00", "title": "S0", "bullets": ["b0"]}]},
                {"title": "Empty", "sections": [{"t": "1:00", "title": "no bullets", "bullets": []}]},
            ],
        }
    )
    out = O.build_lang(reply, anchors, 1500)
    assert out["overview"] == "An overview"
    assert [(c["title"], c["start_s"], c["end_s"]) for c in out["chapters"]] == [
        ("First", 0.0, 600.0),  # snapped to 0:00 (first chapter owns the intro)
        ("Second", 600.0, 1200.0),
        ("Third", 1200.0, 1500.0),
    ]
    assert [p["title"] for p in out["parts"]] == ["Early", "Late"]
    assert out["parts"][0]["end_s"] == 1200.0 and out["parts"][1]["end_s"] == 1500.0


def test_build_lang_without_chapters_fails():
    with pytest.raises(O.OutlineError):
        O.build_lang('{"chapters": []}', [0.0], 100)


def test_prompts_are_bilingual_and_watch_the_markers():
    msgs = O.map_messages(chunks(3), "Lecture 1")
    assert "[0:50] topic words 1" in msgs[1]["content"] and "Lecture 1" in msgs[1]["content"]
    hi = O.reduce_messages(
        [{"start_s": 0, "title": "t", "points": []}], duration_s=3000, lang="hi", title=None
    )
    assert "Devanagari" in hi[0]["content"] and "never transliterated" in hi[0]["content"]
    en = O.reduce_messages(
        [{"start_s": 0, "title": "t", "points": ["p"]}], duration_s=3000, lang="en", title=None
    )
    assert "Write in English" in en[0]["content"] and "about 7 chapters" in en[0]["content"]
    assert "[0:00] t — p" in en[1]["content"]


# ------------------------------------------------------------------ generate
async def test_generate_maps_with_the_fast_model_then_reduces_per_language():
    fc = FakeComplete()
    out = await O.generate(chunks(30), fc, duration_s=1500, title="L1")
    maps = [c for c in fc.calls if c["fast"]]
    reduces = [c for c in fc.calls if not c["fast"]]
    assert len(maps) == 3 and len(reduces) == 2
    assert set(out["langs"]) == {"en", "hi"}
    assert out["langs"]["hi"]["chapters"][0]["title"].startswith("अध्याय")
    # every chapter seeks to a real chunk start
    starts = {c["start_s"] for c in chunks(30)}
    assert all(ch["start_s"] in starts for lang in out["langs"].values() for ch in lang["chapters"])


async def test_generate_keeps_english_when_hindi_fails():
    out = await O.generate(chunks(12), FakeComplete(hi_fails=True), duration_s=600)
    assert set(out["langs"]) == {"en"}


async def test_generate_fails_when_no_window_maps(monkeypatch):
    with pytest.raises(O.OutlineError):
        await O.generate(chunks(12), FakeComplete(map_fails=True))
    with pytest.raises(O.OutlineError):
        await O.generate([], FakeComplete())


async def test_generate_waits_out_rate_limits(monkeypatch):
    monkeypatch.setattr(O, "RATE_LIMIT_WAITS_S", (0.0, 0.0, 0.0))
    fc = FakeComplete(rate_limited=2)
    out = await O.generate(chunks(6), fc, duration_s=300)
    assert "en" in out["langs"]


# ------------------------------------------------------------------ claim rules
def ready_row(**kw):
    return {"ingest_status": "ready", "has_transcript": True, **kw}


def test_outline_claimable_rules():
    now = now_utc()
    iso = lambda d: (now - d).strftime("%Y-%m-%dT%H:%M:%S.%fZ")  # noqa: E731
    assert outline_claimable(ready_row(), now=now, force=False)
    assert not outline_claimable({"ingest_status": "embedding", "has_transcript": True}, now=now, force=False)
    v = O.VERSION
    assert not outline_claimable(ready_row(chapters={"status": "ready", "v": v}), now=now, force=True)
    assert outline_claimable(ready_row(chapters={"status": "ready", "v": v - 1}), now=now, force=False)
    failed_recent = ready_row(chapters={"status": "failed", "v": v, "at": iso(timedelta(minutes=1))})
    assert not outline_claimable(failed_recent, now=now, force=False)
    assert outline_claimable(failed_recent, now=now, force=True)
    assert outline_claimable(
        ready_row(chapters={"status": "failed", "v": v, "at": iso(timedelta(hours=1))}), now=now, force=False
    )
    assert not outline_claimable(
        ready_row(chapters={"status": "generating", "v": v, "at": iso(timedelta(minutes=2))}),
        now=now,
        force=True,
    )
    assert outline_claimable(
        ready_row(chapters={"status": "generating", "v": v, "at": iso(timedelta(hours=1))}),
        now=now,
        force=False,
    )


async def test_supabase_claim_outline_is_one_conditional_update():
    seen = []

    def handler(req):
        seen.append(req)
        return httpx.Response(200, json=[{"video_id": VID}])

    s = Settings(_env_file=None, env="test", supabase_url="https://p.supabase.co", supabase_service_key="k")
    repo = SupabaseVideoRepo(s, client=httpx.AsyncClient(transport=httpx.MockTransport(handler)))
    assert await repo.claim_outline(VID) is True
    (req,) = seen
    params = {k: v[0] for k, v in parse_qs(urlsplit(str(req.url)).query).items()}
    assert (
        req.method == "PATCH"
        and params["ingest_status"] == "eq.ready"
        and params["has_transcript"] == "is.true"
    )
    assert params["or"].startswith("(chapters.is.null,chapters->>status.is.null,chapters->>v.is.null,")
    assert f"chapters->>v.neq.{O.VERSION},and(chapters->>status.eq.failed," in params["or"]
    assert "chapters->>status.eq.generating" in params["or"]
    assert json.loads(req.content)["chapters"]["status"] == "generating"


async def test_supabase_chunk_texts_skip_vectors():
    seen = []
    s = Settings(_env_file=None, env="test", supabase_url="https://p.supabase.co", supabase_service_key="k")
    repo = SupabaseVideoRepo(
        s,
        client=httpx.AsyncClient(
            transport=httpx.MockTransport(lambda r: seen.append(r) or httpx.Response(200, json=[]))
        ),
    )
    assert await repo.get_chunk_texts(VID) == []
    assert "embedding" not in parse_qs(urlsplit(str(seen[0].url)).query)["select"][0]


# ------------------------------------------------------------------ ingest integration
class FakeLLM:
    configured = True

    def __init__(self, **kw):
        self.fc = FakeComplete(**kw)

    async def stream(self, messages, *, max_tokens, temperature, fast=False):
        return await self.fc(messages, max_tokens=max_tokens, fast=fast)


def svc_with(llm, transcripts=None, repo=None):
    return I.IngestService(
        repo or InMemoryVideoRepo(),
        transcripts or FakeTranscripts(ok(n=400)),
        [FakeEmbedder()],
        transcribing_after_s=5,
        retry_backoff_s=0,
        llm=llm,
    )


async def test_outline_follows_ingestion_and_rides_video_status():
    llm = FakeLLM()
    svc = svc_with(llm)
    q = svc.subscribe(VID)
    await svc.ensure(VID)
    await svc.wait(VID)
    await svc.wait_outline(VID)
    snap = await svc.status(VID)
    assert snap["outline_status"] == "ready" and set(snap["outline"]) == {"en", "hi"}
    pushed = [q.get_nowait() for _ in range(q.qsize())]
    assert [p["outline_status"] for p in pushed][-2:] == ["generating", "ready"]
    row = await svc.repo.get(VID)
    assert row["summary"] == "Chapter overview." and row["chapters"]["model"] is None
    # ready + outline ready: a later ensure starts nothing
    await svc.ensure(VID)
    assert not svc.outline_running(VID)


async def test_backfill_reuses_stored_chunks_and_never_refetches():
    repo = InMemoryVideoRepo()
    repo.videos[VID] = {
        "video_id": VID,
        "ingest_status": "ready",
        "has_transcript": True,
        "duration_s": 900.0,
        "updated_at": now_utc(),
    }
    repo.segments[VID] = [Segment("x", 0, 1)]
    await repo.replace_chunks(VID, [Chunk(i, i * 50.0, i * 50.0 + 60, f"t{i}") for i in range(18)], None)
    t = FakeTranscripts(ok())
    svc = svc_with(FakeLLM(), transcripts=t, repo=repo)
    first = await svc.ensure(VID)
    assert first["outline_status"] == "generating"
    await svc.wait_outline(VID)
    assert (await svc.status(VID))["outline_status"] == "ready"
    assert t.calls == 0  # no TranscriptAPI call, no credit


async def test_outline_failure_is_recorded_and_retry_needs_force():
    repo = InMemoryVideoRepo()
    repo.videos[VID] = {
        "video_id": VID,
        "ingest_status": "ready",
        "has_transcript": True,
        "updated_at": now_utc(),
    }
    await repo.replace_chunks(VID, [Chunk(i, i * 50.0, i * 50.0 + 60, f"t{i}") for i in range(6)], None)
    svc = svc_with(FakeLLM(map_fails=True), repo=repo)
    await svc.ensure(VID)
    await svc.wait_outline(VID)
    snap = await svc.status(VID)
    assert snap["outline_status"] == "failed" and snap["outline"] is None
    assert "no topics" in repo.videos[VID]["chapters"]["error"]
    assert (await svc.ensure_outline(VID))["outline_status"] == "failed"  # cooldown
    svc._llm = FakeLLM()
    assert (await svc.ensure_outline(VID, force=True))["outline_status"] == "generating"
    await svc.wait_outline(VID)
    assert (await svc.status(VID))["outline_status"] == "ready"


async def test_no_llm_means_no_outline_run():
    svc = svc_with(None)
    await svc.ensure(VID)
    await svc.wait(VID)
    snap = await svc.status(VID)
    assert snap["status"] == "ready" and snap["outline_status"] is None and not svc.outline_running(VID)


def test_outline_endpoint(client_factory=None):
    from fastapi.testclient import TestClient

    from app.main import app

    repo = InMemoryVideoRepo()
    repo.videos[VID] = {
        "video_id": VID,
        "ingest_status": "ready",
        "has_transcript": True,
        "updated_at": now_utc(),
    }
    I.set_ingest_service(svc_with(None, repo=repo))
    with TestClient(app) as c:
        r = c.post(f"/api/videos/{VID}/outline", json={"retry": True})
        assert r.status_code == 202 and r.json()["outline_status"] is None  # no LLM configured: honest none
        assert c.post("/api/videos/not a video!/outline").json()["fail_reason"] == "invalid_video"


async def test_lopsided_chapters_get_one_more_try_and_the_better_split_wins():
    replies = [
        reduce_reply("en", ("0:00", "2:00")),  # 2:00 → 50:00 is one giant chapter
        reduce_reply("en", ("0:00", "12:00", "24:00", "36:00")),
    ]

    async def complete(messages, *, max_tokens, fast=False):
        return map_reply("0:00", "25:00") if fast else replies.pop(0)

    out = await O.generate(chunks(60), complete, duration_s=3000, langs=("en",))
    assert [c["start_s"] for c in out["langs"]["en"]["chapters"]] == [0, 700, 1400, 2150]
    assert O.longest_chapter_s(out["langs"]["en"]) <= O.max_chapter_s(3000)


async def test_bad_map_json_is_retried_once():
    replies = ["{broken", map_reply("0:00")]

    async def complete(messages, *, max_tokens, fast=False):
        return replies.pop(0) if fast else reduce_reply("en", ("0:00",))

    out = await O.generate(chunks(5), complete, duration_s=300, langs=("en",))
    assert out["topics"] == 1 and not replies


def test_a_closing_chapter_of_seconds_is_merged():
    reply = reduce_reply("en", ("0:00", "10:00", "24:40"))
    out = O.build_lang(reply, [0.0, 600.0, 1480.0], 1500)
    assert [(c["start_s"], c["end_s"]) for c in out["chapters"]] == [(0.0, 600.0), (600.0, 1500.0)]
