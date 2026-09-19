"""Chapters + structured summary (roadmap Tier 2): one LLM map → reduce pass over the stored chunks.

Runs in the background once ingestion reaches `ready` (and as a backfill for videos ingested before this
existed): it only reads `transcript_chunks`, so TranscriptAPI is never called again.

- map    : the transcript in ~10-minute windows of chunks, each marked with its start time → the topics
           the lecturer covers, with times taken from those markers (small, fast model).
- reduce : all topics → chapters + a structured summary, once per UI language (EN, HI), written directly
           in that language (roadmap D5). Every time is snapped to a real chunk start, so a chapter
           always seeks somewhere the lecture actually says it.

Stored on the shared `videos` row, no schema change: `videos.chapters` (jsonb) holds the whole outline
document below, `videos.summary` the English overview (Library cards).

  {"v": 2, "status": "generating"|"ready"|"failed", "at": iso, "error": str|None, "model": str,
   "langs": {"en": {"overview": str,
                    "chapters": [{"start_s", "end_s", "title", "summary"}],
                    "parts": [{"title", "start_s", "end_s",
                               "sections": [{"title", "start_s", "bullets": [str]}]}]},
             "hi": {...}}}

The outline covers the whole lecture (it's a shared cache). The watched-only rule (D7) is applied where it
is shown: with the spoiler guard on, the client reveals summary sections and chapter blurbs only up to
the learner's high-water mark. Chapter titles stay visible, since they're navigation (seeking is exempt).
"""

from __future__ import annotations

import asyncio
import json
import logging
import re
from collections.abc import Awaitable, Callable, Sequence
from datetime import datetime, timezone
from typing import Any

from app.orchestration.localize import fmt_clock
from app.services.video_repo import OUTLINE_VERSION

log = logging.getLogger("studyloop.outline")

VERSION = OUTLINE_VERSION
LANGS = ("en", "hi")
WINDOW_S = 600.0  # map window: ~10 minutes of lecture
WINDOW_MAX_CHARS = 9000
MAP_MAX_TOKENS = 700
REDUCE_MAX_TOKENS = 2600  # Devanagari costs ~3x the tokens of the same English
RATE_LIMIT_WAITS_S = (8.0, 20.0, 40.0)  # a free-tier LLM key hits tokens-per-minute limits on long lectures

Complete = Callable[..., Awaitable[str]]


class OutlineError(RuntimeError):
    pass


def now_iso() -> str:
    # fixed width so ISO strings compare correctly as text (the claim filter compares them in PostgREST)
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%fZ")


# ------------------------------------------------------------------ helpers
_CLOCK = re.compile(r"(\d{1,2}):(\d{2})(?::(\d{2}))?")


def parse_clock(v: Any) -> float | None:
    """'12:30' | '1:02:03' | 750 → seconds; None if unusable."""
    if isinstance(v, int | float) and not isinstance(v, bool):
        return float(v) if v >= 0 else None
    m = _CLOCK.search(str(v or ""))
    if not m:
        return None
    a, b, c = m.groups()
    return float(int(a) * 3600 + int(b) * 60 + int(c)) if c is not None else float(int(a) * 60 + int(b))


def snap(t: float, anchors: Sequence[float]) -> float:
    """The anchor (a real chunk start) at or just before t; the first anchor if t is before all of them."""
    best = anchors[0]
    for a in anchors:
        if a <= t + 1e-6:
            best = a
        else:
            break
    return best


def parse_json(text: str) -> dict[str, Any]:
    """The first JSON object in a model reply (tolerates code fences and chatter around it)."""
    text = text.strip()
    start, end = text.find("{"), text.rfind("}")
    if start < 0 or end <= start:
        raise OutlineError("no JSON object in the reply")
    try:
        out = json.loads(text[start : end + 1])
    except ValueError as exc:
        raise OutlineError(f"bad JSON: {exc}") from exc
    if not isinstance(out, dict):
        raise OutlineError("JSON is not an object")
    return out


def _clean(s: Any, limit: int) -> str:
    s = " ".join(str(s or "").replace("**", "").split()).strip().strip('"').strip()
    return s[:limit]


def windows(chunks: Sequence[dict[str, Any]], *, window_s: float = WINDOW_S) -> list[list[dict[str, Any]]]:
    """Consecutive chunks grouped into ~window_s spans (and a char cap, so one window fits one request)."""
    out: list[list[dict[str, Any]]] = []
    cur: list[dict[str, Any]] = []
    chars = 0
    for c in chunks:
        text = str(c.get("text") or "")
        if cur and (
            float(c["start_s"]) - float(cur[0]["start_s"]) >= window_s or chars + len(text) > WINDOW_MAX_CHARS
        ):
            out.append(cur)
            cur, chars = [], 0
        cur.append(c)
        chars += len(text)
    if cur:
        out.append(cur)
    return out


# ------------------------------------------------------------------ prompts
def map_messages(window: Sequence[dict[str, Any]], title: str | None) -> list[dict[str, str]]:
    system = (
        "You read one part of a lecture transcript and list the topics the lecturer covers in it, in order. "
        "Each transcript passage starts with its time in [m:ss] or [h:mm:ss]. For every distinct topic give "
        "the time of the passage where it starts (copy one of the given times exactly), a short title, and "
        "2-3 key points (facts, definitions, results, examples). 1-4 topics. Ignore small talk. English only. "
        'Reply with JSON only: {"topics": [{"t": "m:ss", "title": "...", "points": ["...", "..."]}]}'
    )
    lines = [
        f"[{fmt_clock(float(c['start_s']))}] {' '.join(str(c.get('text') or '').split())}" for c in window
    ]
    user = (f"Lecture: {title}\n\n" if title else "") + "Transcript:\n" + "\n".join(lines)
    return [{"role": "system", "content": system}, {"role": "user", "content": user}]


def reduce_messages(
    topics: Sequence[dict[str, Any]], *, duration_s: float, lang: str, title: str | None
) -> list[dict[str, str]]:
    minutes = max(1, round(duration_s / 60))
    n_ch = target_chapters(duration_s)
    language = (
        "Hindi. Every title, summary and bullet is a Hindi phrase or sentence in Devanagari script; only the "
        "technical terms inside it stay in English in Latin letters exactly as the lecturer says them (e.g. "
        "'divide and conquer', 'array', 'peak', 'O(log n)'), never transliterated. Example title: "
        "'1D peak finding का divide and conquer तरीका', not 'Divide and Conquer for 1D Peaks'"
        if lang == "hi"
        else "English"
    )
    system = (
        f"You turn the topic list of a {minutes}-minute lecture into study material. Write in {language}.\n"
        f"1. chapters: about {n_ch} chapters that split the lecture into its main stages, in order. Each has "
        "the start time of the topic it begins with (copy a given time exactly), a title of at most 8 words, "
        "and a one-sentence summary. The first chapter starts at the first topic. Cover the whole lecture "
        f"evenly: chapters of roughly {max(1, round(minutes / n_ch))} minutes, none longer than "
        f"{max_chapter_s(duration_s) / 60:.0f} minutes, and the last one starts in the final "
        f"{max(2, round(minutes / 4))} minutes.\n"
        "2. parts: the same lecture as 2-4 parts, each with a title and 1-3 sections; each section has a "
        "start time (a given time), a title, and 2-4 bullets with the concrete content (definitions, "
        "algorithms, results, complexities).\n"
        "3. overview: 2 sentences on what the lecture covers.\n"
        "Use only the topic list. Plain text inside the strings: no markdown, no timestamps.\n"
        'Reply with JSON only: {"overview": "...", "chapters": [{"t": "m:ss", "title": "...", "summary": '
        '"..."}], "parts": [{"title": "...", "sections": [{"t": "m:ss", "title": "...", "bullets": ["..."]}]}]}'
    )
    lines = [
        f"[{fmt_clock(t['start_s'])}] {t['title']}" + (f" — {'; '.join(t['points'])}" if t["points"] else "")
        for t in topics
    ]
    user = (f"Lecture: {title}\n\n" if title else "") + "Topics:\n" + "\n".join(lines)
    return [{"role": "system", "content": system}, {"role": "user", "content": user}]


# ------------------------------------------------------------------ validation
def target_chapters(duration_s: float) -> int:
    return max(3, min(12, round(duration_s / 60 / 7)))


def max_chapter_s(duration_s: float) -> float:
    """Longest acceptable chapter: 2.5x the average, at least 8 minutes."""
    return max(480.0, 2.5 * duration_s / target_chapters(duration_s))


def longest_chapter_s(lang_doc: dict[str, Any]) -> float:
    return max((c["end_s"] - c["start_s"] for c in lang_doc["chapters"]), default=0.0)


def parse_topics(reply: str, anchors: Sequence[float]) -> list[dict[str, Any]]:
    data = parse_json(reply)
    out: list[dict[str, Any]] = []
    for t in data.get("topics") or []:
        if not isinstance(t, dict):
            continue
        at = parse_clock(t.get("t"))
        title = _clean(t.get("title"), 120)
        if at is None or not title:
            continue
        points = [_clean(p, 240) for p in (t.get("points") or []) if isinstance(p, str) and p.strip()][:3]
        out.append({"start_s": snap(at, anchors), "title": title, "points": points})
    return out


def build_lang(reply: str, anchors: Sequence[float], duration_s: float) -> dict[str, Any]:
    """Model reply → validated {overview, chapters, parts}: times snapped to chunk starts, sorted, deduped,
    end times filled in. Raises OutlineError if nothing usable is left."""
    data = parse_json(reply)

    chapters: list[dict[str, Any]] = []
    for c in data.get("chapters") or []:
        if not isinstance(c, dict):
            continue
        at = parse_clock(c.get("t"))
        title = _clean(c.get("title"), 90)
        if at is None or not title or at > duration_s + 1:
            continue
        chapters.append(
            {"start_s": snap(at, anchors), "title": title, "summary": _clean(c.get("summary"), 300)}
        )
    chapters.sort(key=lambda c: c["start_s"])
    deduped: list[dict[str, Any]] = []
    for c in chapters:
        if deduped and c["start_s"] - deduped[-1]["start_s"] < 30:  # two chapters on the same moment
            continue
        deduped.append(c)
    if not deduped:
        raise OutlineError("no usable chapters")
    if deduped[0]["start_s"] <= 180:
        deduped[0]["start_s"] = 0.0  # the first chapter owns the intro
    if len(deduped) > 1 and duration_s - deduped[-1]["start_s"] < 60:
        deduped.pop()  # a closing chapter of a few seconds: the previous one runs to the end
    for i, c in enumerate(deduped):
        c["end_s"] = deduped[i + 1]["start_s"] if i + 1 < len(deduped) else float(duration_s)

    parts: list[dict[str, Any]] = []
    for p in data.get("parts") or []:
        if not isinstance(p, dict):
            continue
        sections = []
        for s in p.get("sections") or []:
            if not isinstance(s, dict):
                continue
            at = parse_clock(s.get("t"))
            title = _clean(s.get("title"), 120)
            bullets = [_clean(b, 300) for b in (s.get("bullets") or []) if isinstance(b, str) and b.strip()][
                :5
            ]
            if at is None or not title or not bullets:
                continue
            sections.append({"start_s": snap(at, anchors), "title": title, "bullets": bullets})
        title = _clean(p.get("title"), 120)
        if title and sections:
            sections.sort(key=lambda s: s["start_s"])
            parts.append({"title": title, "start_s": sections[0]["start_s"], "sections": sections})
    parts.sort(key=lambda p: p["start_s"])
    for i, p in enumerate(parts):
        p["end_s"] = parts[i + 1]["start_s"] if i + 1 < len(parts) else float(duration_s)

    return {"overview": _clean(data.get("overview"), 600), "chapters": deduped, "parts": parts}


# ------------------------------------------------------------------ generation
async def _call(complete: Complete, messages: list[dict[str, str]], **kw: Any) -> str:
    """One LLM request, waiting out rate limits (this is a background job: slow beats failed)."""
    for i, wait in enumerate((*RATE_LIMIT_WAITS_S, None)):
        try:
            return await complete(messages, **kw)
        except Exception as exc:
            if wait is None or "429" not in str(exc):
                raise
            log.info("outline: rate limited, waiting %.0f s (attempt %d)", wait, i + 1)
            await asyncio.sleep(wait)
    raise AssertionError("unreachable")


async def generate(
    chunks: Sequence[dict[str, Any]],
    complete: Complete,
    *,
    duration_s: float | None = None,
    title: str | None = None,
    langs: Sequence[str] = LANGS,
) -> dict[str, Any]:
    """chunks ([{start_s, end_s, text}], ordered) → {"langs": {lang: {...}}}. Raises OutlineError when no
    language could be built. A language that fails is left out (the client falls back to the other)."""
    chunks = [c for c in chunks if str(c.get("text") or "").strip()]
    if not chunks:
        raise OutlineError("no transcript chunks")
    anchors = sorted({float(c["start_s"]) for c in chunks})
    duration = float(duration_s or 0) or max(float(c["end_s"]) for c in chunks)

    topics: list[dict[str, Any]] = []
    for w in windows(chunks):
        got: list[dict[str, Any]] = []
        for attempt in (1, 2):  # a reply with broken JSON usually parses on the second try
            try:
                reply = await _call(complete, map_messages(w, title), max_tokens=MAP_MAX_TOKENS, fast=True)
                got = parse_topics(reply, anchors)
                break
            except Exception as exc:  # one bad window must not sink the outline
                log.warning(
                    "outline: map window at %s attempt %d failed: %s",
                    fmt_clock(float(w[0]["start_s"])),
                    attempt,
                    exc,
                )
        # a window the model couldn't read still gets a placeholder topic, so chapters can't skip it
        topics.extend(got or [{"start_s": float(w[0]["start_s"]), "title": "(continued)", "points": []}])
    if all(t["title"] == "(continued)" for t in topics):
        raise OutlineError("map step produced no topics")

    out: dict[str, Any] = {}
    errors: list[str] = []
    limit = max_chapter_s(duration)
    for lang in langs:
        msgs = reduce_messages(topics, duration_s=duration, lang=lang, title=title)
        for attempt in (1, 2):
            try:
                doc = build_lang(await _call(complete, msgs, max_tokens=REDUCE_MAX_TOKENS), anchors, duration)
            except Exception as exc:
                log.warning("outline: reduce (%s) attempt %d failed: %s", lang, attempt, exc)
                if attempt == 2 and lang not in out:
                    errors.append(f"{lang}: {exc}")
                continue
            # a lopsided split (one chapter swallowing half the lecture) gets one more try; keep the better
            if lang not in out or longest_chapter_s(doc) < longest_chapter_s(out[lang]):
                out[lang] = doc
            if longest_chapter_s(out[lang]) <= limit:
                break
            log.info(
                "outline: %s chapters lopsided (longest %.0f min > %.0f), attempt %d",
                lang,
                longest_chapter_s(out[lang]) / 60,
                limit / 60,
                attempt,
            )
    if not out:
        raise OutlineError("; ".join(errors))
    return {"langs": out, "topics": len(topics)}


def llm_complete(llm: Any) -> Complete:
    """Adapter: LLMClient.stream (no deltas) as a plain completion."""

    async def complete(messages: list[dict[str, str]], *, max_tokens: int, fast: bool = False) -> str:
        return await llm.stream(messages, max_tokens=max_tokens, temperature=0.2, fast=fast)

    return complete


def public(doc: Any) -> dict[str, Any]:
    """`videos.chapters` → the `outline_status` / `outline` fields of a video snapshot."""
    if not isinstance(doc, dict):
        return {"outline_status": None, "outline": None}
    status = doc.get("status")
    return {
        "outline_status": status,
        "outline": doc.get("langs") if status == "ready" else None,
    }
