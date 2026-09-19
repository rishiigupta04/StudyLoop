import httpx
import pytest

from app.config import Settings
from app.services.transcripts import FailReason, TranscriptClient, TranscriptSource, extract_video_id

VID = "aircAruvnKk"


def client_with(handler, **kw):
    settings = Settings(_env_file=None, transcript_api_key="test-key", env="test", **kw)
    return TranscriptClient(settings, http=httpx.AsyncClient(transport=httpx.MockTransport(handler)))


def ok_body(language="en", **extra):
    return {
        "video_id": VID,
        "language": language,
        "transcript": [
            {"text": "hello", "start": 0.0, "duration": 2.0},
            {"text": " ", "start": 2, "duration": 1},
        ],
        "metadata": {"title": "t"},
        "length_seconds": 100,
        **extra,
    }


@pytest.mark.parametrize(
    "inp",
    [
        VID,
        f"https://www.youtube.com/watch?v={VID}",
        f"https://youtu.be/{VID}?t=10",
        f"https://www.youtube.com/watch?list=x&v={VID}",
        f"https://youtube.com/shorts/{VID}",
    ],
)
def test_extract_video_id(inp):
    assert extract_video_id(inp) == VID


async def test_success_and_cache():
    calls = []

    def handler(req: httpx.Request):
        calls.append(req)
        assert req.headers["authorization"] == "Bearer test-key"
        assert req.url.params["language"] == "en,hi,asr-hi"
        return httpx.Response(200, json=ok_body())

    c = client_with(handler)
    r1 = await c.fetch(VID)
    r2 = await c.fetch(f"https://youtu.be/{VID}")
    assert r1.ok and r1.source == TranscriptSource.CREATOR
    assert len(r1.segments) == 1  # blank segment dropped
    assert r2 is r1 and len(calls) == 1  # second request served from cache — no credit spent


async def test_never_pregates_on_info_endpoint():
    """Captions-disabled videos must still be attempted (roadmap D10b)."""
    seen = []

    def handler(req):
        seen.append(req.url.path)
        return httpx.Response(200, json=ok_body("asr-en"))

    r = await client_with(handler).fetch(VID)
    assert seen == ["/api/v2/youtube/transcript"]
    assert r.source == TranscriptSource.YOUTUBE_ASR


async def test_generated_source_hint():
    r = await client_with(lambda req: httpx.Response(200, json=ok_body("en", source="ai_generated"))).fetch(
        VID
    )
    assert r.source == TranscriptSource.API_GENERATED


@pytest.mark.parametrize(
    "status,reason,retryable",
    [
        (404, FailReason.UNAVAILABLE, False),
        (429, FailReason.RATE_LIMITED, True),
        (401, FailReason.PROVIDER_AUTH, False),
        (402, FailReason.CREDITS_EXHAUSTED, False),
        (503, FailReason.PROVIDER_ERROR, True),
    ],
)
async def test_failures_are_explained(status, reason, retryable):
    r = await client_with(lambda req: httpx.Response(status, text="x")).fetch(VID)
    assert not r.ok and r.fail_reason == reason and r.to_dict()["retryable"] is retryable


async def test_transient_failures_not_cached():
    n = {"calls": 0}

    def handler(req):
        n["calls"] += 1
        return httpx.Response(503) if n["calls"] == 1 else httpx.Response(200, json=ok_body())

    c = client_with(handler)
    assert not (await c.fetch(VID)).ok
    assert (await c.fetch(VID)).ok


async def test_empty_transcript_is_no_speech():
    body = ok_body()
    body["transcript"] = []
    r = await client_with(lambda req: httpx.Response(200, json=body)).fetch(VID)
    assert r.fail_reason == FailReason.NO_SPEECH


async def test_timeout():
    def handler(req):
        raise httpx.ReadTimeout("slow")

    r = await client_with(handler).fetch(VID)
    assert r.fail_reason == FailReason.TIMEOUT and r.to_dict()["retryable"]


async def test_invalid_and_unconfigured():
    c = TranscriptClient(Settings(_env_file=None, transcript_api_key="", env="test"))
    assert (await c.fetch("not a url")).fail_reason == FailReason.INVALID_VIDEO
    assert (await c.fetch(VID)).fail_reason == FailReason.NOT_CONFIGURED


async def test_no_paid_plan_is_distinguished():
    body = {"detail": {"message": "You don't have an active paid plan yet.", "reason": "no_active_paid_plan"}}
    r = await client_with(lambda req: httpx.Response(402, json=body)).fetch(VID)
    assert r.fail_reason == FailReason.NO_PLAN and not r.to_dict()["retryable"]


async def test_account_failures_not_cached():
    n = {"calls": 0}

    def handler(req):
        n["calls"] += 1
        return (
            httpx.Response(402, json={"detail": {"reason": "no_active_paid_plan"}})
            if n["calls"] == 1
            else httpx.Response(200, json=ok_body())
        )

    c = client_with(handler)
    assert (await c.fetch(VID)).fail_reason == FailReason.NO_PLAN
    assert (await c.fetch(VID)).ok  # works right after the plan is activated, no restart needed
