"""Server-side TranscriptAPI client (roadmap D1, D10b).

TranscriptAPI can return transcripts even when the uploader disabled captions, so a missing
transcript is a *failure* with a concrete reason — never a silent fallback. We deliberately do
NOT pre-gate on /youtube/info (its caption-track list is empty for those videos).
"""

from __future__ import annotations

import re
import time
from collections import OrderedDict
from dataclasses import dataclass, field
from enum import Enum
from typing import Any

import httpx

from app.config import Settings

_VIDEO_ID_RE = re.compile(r"^[A-Za-z0-9_-]{11}$")
_URL_ID_RE = re.compile(
    r"(?:youtu\.be/|youtube\.com/(?:embed/|v/|shorts/|live/|watch\?(?:.*&)?v=))([A-Za-z0-9_-]{11})"
)


class FailReason(str, Enum):
    INVALID_VIDEO = "invalid_video"  # not a parseable YouTube id/url
    UNAVAILABLE = "unavailable"  # private / removed / live / members-only / no track
    NO_SPEECH = "no_speech"  # fetched OK but empty
    RATE_LIMITED = "rate_limited"  # 429 — transient
    CREDITS_EXHAUSTED = "credits_exhausted"  # 402 — needs top-up
    NO_PLAN = "no_plan"  # 402 reason=no_active_paid_plan — needs a subscription
    PROVIDER_AUTH = "provider_auth"  # 401/403 — our key is wrong (config error)
    PROVIDER_ERROR = "provider_error"  # 5xx / malformed — transient
    TIMEOUT = "timeout"  # transient
    NOT_CONFIGURED = "not_configured"  # TRANSCRIPT_API_KEY missing
    # ingestion-side (Tier 1a): the transcript itself may be fine
    EMBED_ERROR = "embed_error"  # embedding provider failed — transcript is stored, retry re-embeds only
    INTERNAL = "internal"  # unexpected error / storage failure

    @property
    def retryable(self) -> bool:
        return self in {
            FailReason.RATE_LIMITED,
            FailReason.PROVIDER_ERROR,
            FailReason.TIMEOUT,
            FailReason.EMBED_ERROR,
            FailReason.INTERNAL,
        }

    @property
    def permanent(self) -> bool:
        """A fact about the video (→ `unavailable`), not about our providers or config (→ `failed`)."""
        return self in {FailReason.UNAVAILABLE, FailReason.NO_SPEECH, FailReason.INVALID_VIDEO}


class TranscriptSource(str, Enum):
    CREATOR = "creator"
    YOUTUBE_ASR = "youtube_asr"
    API_GENERATED = "api_generated"


@dataclass
class Segment:
    text: str
    start: float
    duration: float


@dataclass
class TranscriptResult:
    video_id: str
    ok: bool
    language: str | None = None
    source: TranscriptSource | None = None
    segments: list[Segment] = field(default_factory=list)
    metadata: dict[str, Any] | None = None
    length_seconds: float | None = None
    fail_reason: FailReason | None = None
    detail: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "video_id": self.video_id,
            "has_transcript": self.ok,
            "language": self.language,
            "source": self.source.value if self.source else None,
            "segments": [s.__dict__ for s in self.segments],
            "metadata": self.metadata,
            "length_seconds": self.length_seconds,
            "fail_reason": self.fail_reason.value if self.fail_reason else None,
            "retryable": self.fail_reason.retryable if self.fail_reason else False,
            "detail": self.detail,
        }


def extract_video_id(url_or_id: str) -> str | None:
    s = (url_or_id or "").strip()
    if _VIDEO_ID_RE.match(s):
        return s
    m = _URL_ID_RE.search(s)
    return m.group(1) if m else None


def classify_source(language: str | None, body: dict[str, Any]) -> TranscriptSource:
    """Best-effort provenance. Explicit provider hints win; `asr-*` codes mean YouTube auto-captions."""
    hint = str(body.get("source") or body.get("transcript_source") or "").lower()
    if any(k in hint for k in ("generat", "whisper", "transcrib", "ai")):
        return TranscriptSource.API_GENERATED
    if language and language.startswith("asr"):
        return TranscriptSource.YOUTUBE_ASR
    if language:
        return TranscriptSource.CREATOR
    return TranscriptSource.API_GENERATED


class TranscriptClient:
    def __init__(self, settings: Settings, http: httpx.AsyncClient | None = None, cache_size: int = 256):
        self._s = settings
        self._http = http
        # Per-process guard only; the durable cache is the `videos` table (services/ingest.py).
        self._cache: OrderedDict[str, tuple[float, TranscriptResult]] = OrderedDict()
        self._cache_size = cache_size

    def _cache_get(self, vid: str) -> TranscriptResult | None:
        hit = self._cache.get(vid)
        if not hit:
            return None
        expires, result = hit
        if expires < time.monotonic():
            self._cache.pop(vid, None)
            return None
        self._cache.move_to_end(vid)
        return result

    def _cache_put(self, vid: str, result: TranscriptResult) -> None:
        if not result.ok and result.fail_reason not in {FailReason.UNAVAILABLE, FailReason.NO_SPEECH}:
            return  # only cache facts about the video — never transient or account/config failures
        ttl = 7 * 86400 if result.ok else 3600
        self._cache[vid] = (time.monotonic() + ttl, result)
        self._cache.move_to_end(vid)
        while len(self._cache) > self._cache_size:
            self._cache.popitem(last=False)

    async def fetch(self, url_or_id: str) -> TranscriptResult:
        vid = extract_video_id(url_or_id)
        if not vid:
            return TranscriptResult(video_id=url_or_id, ok=False, fail_reason=FailReason.INVALID_VIDEO)
        if cached := self._cache_get(vid):
            return cached
        if not self._s.transcript_api_key:
            return TranscriptResult(video_id=vid, ok=False, fail_reason=FailReason.NOT_CONFIGURED)

        result = await self._fetch_remote(vid)
        self._cache_put(vid, result)
        return result

    async def _fetch_remote(self, vid: str) -> TranscriptResult:
        params = {
            "video_url": vid,
            "language": self._s.transcript_languages,
            "send_metadata": "true",
            "include_timestamp": "true",
            "format": "json",
        }
        headers = {"Authorization": f"Bearer {self._s.transcript_api_key}"}
        url = f"{self._s.transcript_api_base}/youtube/transcript"
        try:
            if self._http is not None:
                resp = await self._http.get(
                    url, params=params, headers=headers, timeout=self._s.transcript_timeout_s
                )
            else:
                async with httpx.AsyncClient() as http:
                    resp = await http.get(
                        url, params=params, headers=headers, timeout=self._s.transcript_timeout_s
                    )
        except httpx.TimeoutException:
            return TranscriptResult(video_id=vid, ok=False, fail_reason=FailReason.TIMEOUT)
        except httpx.HTTPError as exc:
            return TranscriptResult(
                video_id=vid, ok=False, fail_reason=FailReason.PROVIDER_ERROR, detail=str(exc)
            )

        return self._parse(vid, resp)

    @staticmethod
    def _parse(vid: str, resp: httpx.Response) -> TranscriptResult:
        code = resp.status_code
        if code != 200:
            reason = {
                401: FailReason.PROVIDER_AUTH,
                403: FailReason.PROVIDER_AUTH,
                402: FailReason.CREDITS_EXHAUSTED,
                404: FailReason.UNAVAILABLE,
                422: FailReason.INVALID_VIDEO,
                429: FailReason.RATE_LIMITED,
            }.get(code, FailReason.PROVIDER_ERROR)
            if reason == FailReason.CREDITS_EXHAUSTED and "no_active_paid_plan" in resp.text:
                reason = FailReason.NO_PLAN
            return TranscriptResult(video_id=vid, ok=False, fail_reason=reason, detail=resp.text[:500])

        try:
            body = resp.json()
        except ValueError:
            return TranscriptResult(
                video_id=vid, ok=False, fail_reason=FailReason.PROVIDER_ERROR, detail="bad json"
            )

        segments = [
            Segment(
                text=" ".join(str(s.get("text", "")).split()),  # creator captions carry line breaks
                start=float(s.get("start", 0)),
                duration=float(s.get("duration", 0)),
            )
            for s in body.get("transcript") or []
            if str(s.get("text", "")).strip()
        ]
        language = body.get("language")
        if not segments:
            return TranscriptResult(
                video_id=vid, ok=False, language=language, fail_reason=FailReason.NO_SPEECH
            )
        return TranscriptResult(
            video_id=body.get("video_id") or vid,
            ok=True,
            language=language,
            source=classify_source(language, body),
            segments=segments,
            metadata=body.get("metadata"),
            length_seconds=body.get("length_seconds"),
        )
