"""Hosted speech (D14): the STT provider chain, Sarvam / Groq request shapes (MockTransport; never the real
services), hallucination + Urdu-script handling, and the /api/stt + /api/tts endpoints."""

import httpx
import pytest
from fastapi.testclient import TestClient

from app.config import Settings, get_settings
from app.main import create_app
from app.services import speech

AUDIO = b"\x1aE\xdf\xa3" + b"\x00" * 4000  # a WebM-ish blob above MIN_AUDIO_BYTES


def settings(**kw) -> Settings:
    return Settings(_env_file=None, **kw)


def mock_client(monkeypatch, handler):
    client = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    monkeypatch.setattr(speech, "shared_client", lambda: client)
    return client


# ------------------------------------------------------------------ providers
async def test_sarvam_request_shape(monkeypatch):
    seen: list[httpx.Request] = []

    def handler(req):
        seen.append(req)
        return httpx.Response(200, json={"transcript": "30 second आगे जाओ", "language_code": "hi-IN"})

    mock_client(monkeypatch, handler)
    s = settings(sarvam_api_key="sk_test")
    r = await speech.transcribe(s, AUDIO, "audio/webm;codecs=opus", "en")
    assert (r.text, r.language, r.provider) == ("30 second आगे जाओ", "hi-IN", "sarvam")
    req = seen[0]
    assert str(req.url) == "https://api.sarvam.ai/speech-to-text"
    assert req.headers["api-subscription-key"] == "sk_test"
    body = req.content.decode(errors="replace")
    for field, value in (("model", "saaras:v3"), ("mode", "codemix"), ("language_code", "unknown")):
        assert f'name="{field}"\r\n\r\n{value}' in body
    assert 'filename="speech.webm"' in body


async def test_groq_whisper_prompt_and_urdu_retry(monkeypatch):
    calls: list[str] = []

    def handler(req):
        body = req.content.decode(errors="replace")
        calls.append(body)
        pinned = 'name="language"\r\n\r\nhi' in body
        return httpx.Response(200, json={"text": "तीस सेकंड आगे जाओ" if pinned else "تیس سیکنڈ آگے جاؤ"})

    mock_client(monkeypatch, handler)
    r = await speech.transcribe(settings(groq_api_key="gk"), AUDIO, "audio/webm", "en")
    assert r.provider == "groq" and r.text == "तीस सेकंड आगे जाओ" and r.language == "hi-IN"
    assert len(calls) == 2 and 'name="language"' not in calls[0]  # auto-detect first, Hindi only on retry
    assert "tees second aage jao" in calls[0]  # the Hinglish style prompt


async def test_chain_falls_back_and_reports_all_errors(monkeypatch):
    def handler(req):
        if "sarvam" in req.url.host:
            return httpx.Response(429, json={"error": "rate limited"})
        return httpx.Response(200, json={"text": "pause karo"})

    mock_client(monkeypatch, handler)
    r = await speech.transcribe(settings(sarvam_api_key="s", groq_api_key="g"), AUDIO, "audio/webm")
    assert r.provider == "groq" and r.text == "pause karo"

    mock_client(monkeypatch, lambda req: httpx.Response(500, text="down"))
    with pytest.raises(speech.SttError, match="sarvam.*groq"):
        await speech.transcribe(settings(sarvam_api_key="s", groq_api_key="g"), AUDIO, "audio/webm")


async def test_no_provider_tiny_audio_and_hallucinations(monkeypatch):
    with pytest.raises(speech.SttUnavailable):
        await speech.transcribe(settings(), AUDIO, "audio/webm")
    r = await speech.transcribe(settings(groq_api_key="g"), b"x" * 10, "audio/webm")
    assert r.text == "" and r.provider == "none"  # a tap of the key: no network call at all
    mock_client(monkeypatch, lambda req: httpx.Response(200, json={"text": " Thank you. "}))
    assert (await speech.transcribe(settings(groq_api_key="g"), AUDIO, "audio/webm")).text == ""


def test_provider_order_follows_config():
    s = settings(sarvam_api_key="s", groq_api_key="g", stt_providers="groq,sarvam")
    assert [p.name for p in speech.stt_providers(s)] == ["groq", "sarvam"]
    assert [p.name for p in speech.stt_providers(settings(groq_api_key="g"))] == ["groq"]


# ------------------------------------------------------------------ the top-bar Sarvam | Groq switch
def recording_client(monkeypatch, fail: str = ""):
    """Answers as whichever provider is asked, and records the order they were asked in."""
    hosts: list[str] = []

    def handler(req):
        name = "sarvam" if "sarvam" in req.url.host else "groq"
        hosts.append(name)
        if name == fail:
            return httpx.Response(500, text="down")
        return httpx.Response(200, json={"transcript": f"via {name}", "text": f"via {name}"})

    mock_client(monkeypatch, handler)
    return hosts


async def test_the_preferred_provider_serves_first(monkeypatch):
    both = settings(sarvam_api_key="s", groq_api_key="g")  # config order: sarvam, groq
    hosts = recording_client(monkeypatch)
    assert (await speech.transcribe(both, AUDIO, "audio/webm", prefer="groq")).provider == "groq"
    assert hosts == ["groq"]  # Sarvam is never called, so no credit is spent

    flipped = settings(sarvam_api_key="s", groq_api_key="g", stt_providers="groq,sarvam")
    assert (await speech.transcribe(flipped, AUDIO, "audio/webm", prefer="sarvam")).provider == "sarvam"


async def test_the_other_provider_stays_as_the_fallback(monkeypatch):
    hosts = recording_client(monkeypatch, fail="groq")
    r = await speech.transcribe(
        settings(sarvam_api_key="s", groq_api_key="g"), AUDIO, "audio/webm", prefer="groq"
    )
    assert r.provider == "sarvam" and hosts == ["groq", "sarvam"]  # a failed turn is worse than a credit


async def test_a_preference_cannot_enable_what_the_server_disallows(monkeypatch):
    """STT_PROVIDERS stays the kill switch: no key or not listed means the switch can't reach it."""
    recording_client(monkeypatch)
    only_groq = settings(sarvam_api_key="s", groq_api_key="g", stt_providers="groq")
    assert (await speech.transcribe(only_groq, AUDIO, "audio/webm", prefer="sarvam")).provider == "groq"
    no_key = settings(groq_api_key="g")
    assert (await speech.transcribe(no_key, AUDIO, "audio/webm", prefer="sarvam")).provider == "groq"
    both = settings(sarvam_api_key="s", groq_api_key="g")
    assert (await speech.transcribe(both, AUDIO, "audio/webm", prefer="whisper")).provider == "sarvam"


# ------------------------------------------------------------------ WAV uploads (Sarvam rejects WebM)
@pytest.mark.parametrize(
    "ctype,name",
    [
        ("audio/wav", "speech.wav"),
        ("audio/x-wav", "speech.wav"),
        ("audio/webm;codecs=opus", "speech.webm"),
        ("audio/mpeg", "speech.mp3"),
        ("", "speech.webm"),
    ],
)
def test_upload_filename_follows_the_content_type(ctype, name):
    assert speech._filename(ctype) == name


async def test_wav_has_its_own_silence_floor(monkeypatch):
    """800 bytes is a fifth of a second of Opus but only 25 ms of PCM: a stray tap must stay free."""
    hosts = recording_client(monkeypatch)
    tap = b"RIFF" + b"\x00" * (speech.MIN_WAV_BYTES - 10)
    r = await speech.transcribe(settings(groq_api_key="g"), tap, "audio/wav")
    assert r.provider == "none" and hosts == []
    same_size_opus = await speech.transcribe(settings(groq_api_key="g"), tap, "audio/webm")
    assert same_size_opus.provider == "groq"  # the Opus floor is lower, so this one is real speech


# ------------------------------------------------------------------ endpoints
def client(s: Settings) -> TestClient:
    app = create_app()
    app.dependency_overrides[get_settings] = lambda: s
    return TestClient(app)


def test_stt_endpoint(monkeypatch):
    preferred: list[str | None] = []

    async def fake(settings_, audio, ctype, lang, prefer=None):
        assert audio == AUDIO and lang == "hi" and ctype.startswith("audio/webm")
        preferred.append(prefer)
        return speech.SttResult(text="volume 10 percent karo", language="hi-IN", provider="sarvam", ms=412.0)

    monkeypatch.setattr(speech, "transcribe", fake)
    c = client(settings(sarvam_api_key="s"))
    r = c.post("/api/stt", files={"file": ("a.webm", AUDIO, "audio/webm")}, data={"language": "hi"})
    assert r.status_code == 200
    assert r.json() == {
        "text": "volume 10 percent karo",
        "language": "hi-IN",
        "provider": "sarvam",
        "ms": 412.0,
    }
    files = {"file": ("a.webm", AUDIO, "audio/webm")}
    c.post("/api/stt", files=files, data={"language": "hi", "prefer": "groq"})
    assert preferred == [None, "groq"]  # no field = STT_PROVIDERS order; the switch's choice passes through


def test_stt_endpoint_errors(monkeypatch):
    c = client(settings())
    assert c.post("/api/stt", files={"file": ("a.webm", AUDIO, "audio/webm")}).status_code == 503
    big = b"0" * (speech.MAX_AUDIO_BYTES + 10)
    assert (
        client(settings(groq_api_key="g"))
        .post("/api/stt", files={"file": ("a.webm", big, "audio/webm")})
        .status_code
        == 413
    )

    async def boom(*a, **k):
        raise speech.SttError("groq: HTTP 500")

    monkeypatch.setattr(speech, "transcribe", boom)
    r = client(settings(groq_api_key="g")).post("/api/stt", files={"file": ("a.webm", AUDIO, "audio/webm")})
    assert r.status_code == 502


def test_stt_requires_auth_when_required():
    c = client(settings(groq_api_key="g", supabase_jwt_secret="x" * 40, require_auth=True))
    assert c.post("/api/stt", files={"file": ("a.webm", AUDIO, "audio/webm")}).status_code == 401


def test_tts_endpoint_streams_mp3(monkeypatch):
    seen: list[httpx.Request] = []

    def handler(req):
        seen.append(req)
        return httpx.Response(200, content=b"ID3" + b"\xff" * 2000, headers={"Content-Type": "audio/mpeg"})

    mock_client(monkeypatch, handler)
    c = client(settings(sarvam_api_key="sk"))
    r = c.post("/api/tts", json={"text": "पीक हमेशा मौजूद होता है।", "language": "hi"})
    assert r.status_code == 200 and r.headers["content-type"] == "audio/mpeg" and r.content.startswith(b"ID3")
    import json

    body = json.loads(seen[0].content)
    assert str(seen[0].url) == "https://api.sarvam.ai/text-to-speech/stream"
    assert (
        body["language_code"] == "hi-IN"
        and body["model"] == "bulbul:v3"
        and body["output_audio_codec"] == "mp3"
    )


def test_tts_endpoint_errors(monkeypatch):
    assert client(settings()).post("/api/tts", json={"text": "hi"}).status_code == 503
    mock_client(monkeypatch, lambda req: httpx.Response(403, json={"error": "bad key"}))
    c = client(settings(sarvam_api_key="sk"))
    assert c.post("/api/tts", json={"text": "hello"}).status_code == 502
    assert c.post("/api/tts", json={"text": ""}).status_code == 422
    assert c.post("/api/tts", json={"text": "x" * (speech.MAX_TTS_CHARS + 1)}).status_code == 422


def test_health_reports_speech():
    j = client(settings(groq_api_key="g")).get("/health").json()["configured"]
    assert j["stt"] is True and j["tts"] is False
