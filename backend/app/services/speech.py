"""Hosted speech (roadmap D14): speech-to-text for push-to-talk and text-to-speech for answers.

STT: the browser records the push-to-talk audio (WebM/Opus) and posts it to `/api/stt`. Providers are
tried in order (`STT_PROVIDERS`):
- **Sarvam Saaras v3**, `mode=codemix`: trained on Indian code-mixed speech; English words come back in
  Latin script, Hindi in Devanagari, numbers as digits ("30 second आगे जाओ") — exactly what `normalize()`
  handles. Language is auto-detected per utterance, so the UI toggle never forces a script.
- **Groq Whisper large-v3** (the key we already have): a Hinglish prompt biases it towards romanized /
  code-mixed output; an Urdu-script result is retried pinned to Hindi.
If none is configured or all fail, the client keeps the browser's own SpeechRecognition text.

TTS: `/api/tts` proxies **Sarvam Bulbul v3**'s HTTP stream (MP3), one sentence per request, so the first
sentence plays while the LLM is still writing the next. Without a key the client uses speechSynthesis.

Nothing here is on the fast path: STT runs before the turn, TTS after it.
"""

from __future__ import annotations

import logging
import re
import time
from collections.abc import AsyncIterator
from dataclasses import dataclass

import httpx

from app.config import Settings
from app.services.http import shared_client

log = logging.getLogger("studyloop.speech")

GROQ_BASE = "https://api.groq.com/openai/v1"
MAX_AUDIO_BYTES = 2_000_000  # ~2 min of Opus; REST STT caps at 30 s anyway
MIN_AUDIO_BYTES = 800  # a tap of the key: nothing was said
MAX_TTS_CHARS = 1200

# Whisper's context prompt: sets the style (Hinglish in Latin letters, digits, our command vocabulary)
WHISPER_PROMPT = (
    "StudyLoop voice commands, English and Hinglish: pause karo, play, tees second aage jao, "
    "go back 30 seconds, pandrah minute aage, 12:30 pe jao, volume 10 percent karo, speed 1.5 karo, "
    "ye note kar lo, skip to the part about recursion, what is gradient descent?"
)
# Whisper invents these on silence / breath
_HALLUCINATIONS = {
    "thank you.",
    "thank you",
    "thanks for watching!",
    "thanks for watching.",
    "you",
    "bye.",
    ".",
}
_ARABIC = re.compile(r"[؀-ۿ]")


@dataclass(frozen=True)
class SttResult:
    text: str
    language: str | None
    provider: str
    ms: float


class SttError(RuntimeError):
    pass


class SttUnavailable(SttError):
    """No provider configured: the client keeps its browser transcript."""


def _clean(text: str) -> str:
    text = " ".join((text or "").split())
    return "" if text.lower() in _HALLUCINATIONS else text


class SarvamStt:
    name = "sarvam"

    def __init__(self, settings: Settings):
        self._s = settings

    async def transcribe(self, audio: bytes, content_type: str, lang_hint: str) -> tuple[str, str | None]:
        r = await shared_client().post(
            f"{self._s.sarvam_base}/speech-to-text",
            headers={"api-subscription-key": self._s.sarvam_api_key},
            files={"file": ("speech.webm", audio, content_type)},
            data={
                "model": self._s.sarvam_stt_model,
                "mode": self._s.sarvam_stt_mode,
                "language_code": "unknown",  # auto-detect: people mix languages whatever the UI says
            },
            timeout=self._s.stt_timeout_s,
        )
        if r.status_code != 200:
            raise SttError(f"sarvam HTTP {r.status_code}: {r.text[:200]}")
        body = r.json()
        return _clean(body.get("transcript") or ""), body.get("language_code")


class GroqWhisperStt:
    name = "groq"

    def __init__(self, settings: Settings):
        self._s = settings

    async def _call(self, audio: bytes, content_type: str, language: str | None) -> str:
        data = {"model": self._s.groq_stt_model, "response_format": "json", "temperature": "0"}
        data["prompt"] = WHISPER_PROMPT
        if language:
            data["language"] = language
        r = await shared_client().post(
            f"{GROQ_BASE}/audio/transcriptions",
            headers={"Authorization": f"Bearer {self._s.groq_api_key}"},
            files={"file": ("speech.webm", audio, content_type)},
            data=data,
            timeout=self._s.stt_timeout_s,
        )
        if r.status_code != 200:
            raise SttError(f"groq HTTP {r.status_code}: {r.text[:200]}")
        return _clean(r.json().get("text") or "")

    async def transcribe(self, audio: bytes, content_type: str, lang_hint: str) -> tuple[str, str | None]:
        # auto-detect (the UI toggle is the ANSWER language; people speak English commands in Hindi mode
        # too) — the prompt steers Hinglish to Latin script
        text = await self._call(audio, content_type, None)
        if _ARABIC.search(text):  # Hindustani speech detected as Urdu → our normalizer can't read it
            text = await self._call(audio, content_type, "hi")
            return text, "hi-IN"
        return text, None


def stt_providers(settings: Settings) -> list[SarvamStt | GroqWhisperStt]:
    out: list[SarvamStt | GroqWhisperStt] = []
    for name in (p.strip() for p in settings.stt_providers.split(",")):
        if name == "sarvam" and settings.sarvam_api_key:
            out.append(SarvamStt(settings))
        elif name == "groq" and settings.groq_api_key:
            out.append(GroqWhisperStt(settings))
    return out


async def transcribe(
    settings: Settings, audio: bytes, content_type: str, lang_hint: str = "en", providers=None
) -> SttResult:
    providers = stt_providers(settings) if providers is None else providers
    if not providers:
        raise SttUnavailable("no STT provider configured")
    if len(audio) < MIN_AUDIO_BYTES:
        return SttResult(text="", language=None, provider="none", ms=0.0)
    errors: list[str] = []
    for p in providers:
        t0 = time.perf_counter()
        try:
            text, lang = await p.transcribe(audio, content_type, lang_hint)
        except (httpx.HTTPError, SttError, ValueError) as exc:
            errors.append(f"{p.name}: {exc or type(exc).__name__}")
            log.warning("stt %s failed: %s", p.name, errors[-1])
            continue
        ms = round((time.perf_counter() - t0) * 1000, 1)
        log.info("stt %s %.0fms lang=%s %r", p.name, ms, lang, text[:80])
        return SttResult(text=text, language=lang, provider=p.name, ms=ms)
    raise SttError("; ".join(errors))


# ------------------------------------------------------------------ TTS
class TtsError(RuntimeError):
    pass


def tts_configured(settings: Settings) -> bool:
    return bool(settings.sarvam_api_key)


async def open_tts_stream(
    settings: Settings, text: str, lang: str
) -> tuple[httpx.Response, AsyncIterator[bytes]]:
    """Start Bulbul's HTTP stream; raises TtsError before any byte is sent to our client if it fails."""
    client = shared_client()
    req = client.build_request(
        "POST",
        f"{settings.sarvam_base}/text-to-speech/stream",
        headers={"api-subscription-key": settings.sarvam_api_key, "Content-Type": "application/json"},
        json={
            "text": text[:MAX_TTS_CHARS],
            # the code drives Bulbul's text normalization; code-mixed text reads fine with hi-IN
            "language_code": "hi-IN" if lang == "hi" else "en-IN",
            "speaker": settings.sarvam_tts_speaker,
            "model": settings.sarvam_tts_model,
            "pace": settings.sarvam_tts_pace,
            "output_audio_codec": "mp3",
            "enable_preprocessing": True,
        },
        timeout=settings.tts_timeout_s,
    )
    try:
        resp = await client.send(req, stream=True)
    except httpx.HTTPError as exc:
        raise TtsError(type(exc).__name__) from exc
    if resp.status_code != 200:
        body = (await resp.aread()).decode(errors="replace")[:200]
        await resp.aclose()
        raise TtsError(f"sarvam HTTP {resp.status_code}: {body}")
    return resp, resp.aiter_bytes()
