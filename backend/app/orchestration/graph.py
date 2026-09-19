"""StudyLoop LangGraph — authoritative shape from STUDYLOOP_ROADMAP_V2.md §2.

START → normalize_input → classify_intent ─┬─ player intent ≥τ ─→ parse_slots ─(ok)→ action_executor → END
                                           │                          └─(missing slot)→ llm_router
                                           ├─ SEMANTIC_SEEK ≥τ ─→ seek_resolver ─→ action_executor
                                           ├─ ASK / SUMMARIZE ≥τ ─→ rag_agent ───┐
                                           ├─ TAKE_NOTE ≥τ ─→ notes_agent ───────┤
                                           └─ <τ / OOS ─→ llm_router ─→ …        ↓
                                                                        localize → respond → END

llm_router (low confidence / OOS / missing slot) makes one tool-calling request and then continues to
action_executor, seek_resolver, rag_agent or notes_agent — or answers directly (→ localize).

Tier 1b: seek_resolver = hybrid retrieval over the whole video (no LLM); rag_agent = retrieval limited to
what was already watched (`end_s <= max_watched_s`) + a streamed Groq answer in `language` with [mm:ss]
citations; llm_router = one Groq tool call. Tier 1e: notes_agent drafts the note in-process (no I/O); the
WebSocket sends `note.created` and summarizes it in the background (`app.services.notes`).

Nodes are sync (the WS runs the graph in a worker thread); their network I/O runs on the server's event
loop via `TurnDeps.loop`. Dependencies arrive in `config["configurable"]["deps"]` so tests inject fakes.
"""

from __future__ import annotations

import asyncio
import json
import logging
import re
import time
import uuid
from collections.abc import Awaitable, Callable, Coroutine
from dataclasses import dataclass
from datetime import datetime, timezone
from functools import wraps
from typing import Any

from langchain_core.runnables import RunnableConfig
from langgraph.checkpoint.memory import MemorySaver
from langgraph.graph import END, START, StateGraph

from app.config import get_settings
from app.orchestration import localize as L
from app.orchestration import regex_classifier
from app.orchestration.intents import PLAYER_INTENTS, Intent
from app.orchestration.state import StudyState
from app.services.retrieval import tokens
from studyloop_nlp import normalize, parse_slots
from studyloop_nlp.slots import DEFAULT_REPLAY_S, DEFAULT_SEEK_S, END_OFFSET_S, SPEED_STEP, missing_slots

log = logging.getLogger("studyloop.graph")

NodeFn = Callable[..., dict[str, Any]]


def timed(name: str) -> Callable[[NodeFn], NodeFn]:
    """Record per-node wall time (ms) into state.timings — returned to the client and logged (Tier 1f)."""

    def deco(fn: NodeFn) -> NodeFn:
        @wraps(fn)  # keeps fn's signature, so LangGraph still passes `config` to nodes that take it
        def wrapper(state: StudyState, *args: Any, **kwargs: Any) -> dict[str, Any]:
            t0 = time.perf_counter()
            out = fn(state, *args, **kwargs) or {}
            timings = dict(state.get("timings") or {})
            timings.update(out.pop("timings", {}) or {})
            timings[name] = round((time.perf_counter() - t0) * 1000, 3)
            out["timings"] = timings
            return out

        return wrapper

    return deco


# ------------------------------------------------------------------ dependencies
@dataclass
class TurnDeps:
    retriever: Any  # app.services.retrieval.Retriever
    llm: Any  # app.services.llm.LLMClient
    emit: Callable[[str], Awaitable[None]] | None = None  # → answer.delta
    is_cancelled: Callable[[], bool] | None = None  # barge-in / turn.cancel
    loop: asyncio.AbstractEventLoop | None = None  # the server loop that owns the HTTP clients


def default_deps() -> TurnDeps:
    from app.services.llm import get_llm
    from app.services.retrieval import get_retriever

    return TurnDeps(retriever=get_retriever(), llm=get_llm())


def _deps(config: RunnableConfig | None) -> TurnDeps:
    deps = ((config or {}).get("configurable") or {}).get("deps")
    return deps if deps is not None else default_deps()


def _run(deps: TurnDeps, coro: Coroutine[Any, Any, Any]) -> Any:
    """Run async I/O from a sync node (which runs in a worker thread)."""
    if deps.loop is not None and deps.loop.is_running():
        return asyncio.run_coroutine_threadsafe(coro, deps.loop).result()
    return asyncio.run(coro)  # scripts / sync tests: no server loop


# ------------------------------------------------------------------ nodes
@timed("normalize_input")
def normalize_input(state: StudyState) -> dict[str, Any]:
    return {"normalized_text": normalize(state.get("raw_text", ""))}


def _classifier() -> Callable[[str], tuple[Intent, float]]:
    # Tier 1c swaps in the ONNX DistilBERT model here when CLASSIFIER=onnx.
    return regex_classifier.classify


@timed("classify_intent")
def classify_intent(state: StudyState) -> dict[str, Any]:
    intent, conf = _classifier()(state.get("normalized_text", ""))
    return {"intent": intent.value, "confidence": conf}


@timed("parse_slots")
def parse_slots_node(state: StudyState) -> dict[str, Any]:
    intent = state.get("intent")
    slots = parse_slots(state.get("normalized_text", ""), intent)
    return {"slots": slots.to_dict(), "error": "missing_slot" if missing_slots(intent or "", slots) else None}


@timed("action_executor")
def action_executor(state: StudyState) -> dict[str, Any]:
    """Build the player action JSON the client executes against the YouTube IFrame API.
    Relative seeks are sent as deltas: the client applies them to its *live* currentTime."""
    intent = Intent(state["intent"])
    s = state.get("slots") or {}
    lang = state.get("language", "en")
    action: dict[str, Any]
    msg: str

    if intent == Intent.PLAY:
        action, msg = {"type": "PLAY"}, L.t("PLAY", lang)
    elif intent == Intent.PAUSE:
        action, msg = {"type": "PAUSE"}, L.t("PAUSE", lang)
    elif intent in (Intent.SEEK_BACK, Intent.SEEK_FORWARD):
        secs = float(s.get("duration_s") or DEFAULT_SEEK_S)
        delta = -secs if intent == Intent.SEEK_BACK else secs
        action, msg = (
            {"type": "SEEK_RELATIVE", "delta_s": delta},
            L.t(intent.value, lang, seconds=L.fmt_num(secs)),
        )
    elif intent == Intent.SEEK_ABSOLUTE and s.get("anchor") == "previous":
        action, msg = {"type": "SEEK_PREVIOUS"}, L.t("SEEK_PREVIOUS", lang)  # undo the last jump
    elif intent == Intent.SEEK_ABSOLUTE and s.get("anchor") == "end":
        action = {"type": "SEEK_FRACTION", "fraction": 1.0, "offset_s": -END_OFFSET_S}
        msg = L.t("SEEK_END", lang)
    elif intent == Intent.SEEK_ABSOLUTE and s.get("fraction") is not None:
        f = float(s["fraction"])
        action = {"type": "SEEK_FRACTION", "fraction": f}
        msg = L.t("SEEK_FRACTION", lang, percent=L.fmt_num(round(f * 100, 1)))
    elif intent == Intent.SEEK_ABSOLUTE and s.get("anchor") == "start":
        action = {"type": "SEEK_TO", "seconds": 0.0}
        msg = L.t("RESTART" if s.get("then") == "PLAY" else "SEEK_START", lang)
    elif intent == Intent.SEEK_ABSOLUTE:
        ts = float(s["timestamp_s"])
        action, msg = {"type": "SEEK_TO", "seconds": ts}, L.t("SEEK_ABSOLUTE", lang, clock=L.fmt_clock(ts))
    elif intent == Intent.SEMANTIC_SEEK and s.get("target_s") is not None:
        ts = float(s["target_s"])
        action = {"type": "SEEK_TO", "seconds": ts}
        if s.get("alt_s") is not None:  # "did you mean": a close second match elsewhere in the video
            action["alt_s"] = float(s["alt_s"])
            msg = L.t("SEEK_TOPIC_ALT", lang, clock=L.fmt_clock(ts), alt=L.fmt_clock(float(s["alt_s"])))
        else:
            msg = L.t("SEEK_TOPIC", lang, clock=L.fmt_clock(ts))
    elif intent == Intent.REPLAY:
        secs = float(s.get("duration_s") or DEFAULT_REPLAY_S)
        action = {"type": "SEEK_RELATIVE", "delta_s": -secs, "then": "PLAY"}
        msg = L.t("REPLAY", lang, seconds=L.fmt_num(secs))
    elif intent == Intent.SPEED:
        if s.get("rate") is not None:
            action, msg = (
                {"type": "SET_RATE", "rate": s["rate"]},
                L.t("SPEED_SET", lang, rate=L.fmt_num(s["rate"])),
            )
        elif s.get("rate_direction") == "down":
            action, msg = {"type": "RATE_STEP", "delta": -SPEED_STEP}, L.t("SPEED_DOWN", lang)
        else:
            action, msg = {"type": "RATE_STEP", "delta": SPEED_STEP}, L.t("SPEED_UP", lang)
    elif intent == Intent.VOLUME and s.get("volume") == "set":
        level = int(s["volume_level"])
        action, msg = {"type": "VOLUME_SET", "level": level}, L.t("VOLUME_set", lang, level=level)
    elif intent == Intent.VOLUME:
        v = s.get("volume", "mute")
        kind = {"mute": "MUTE", "unmute": "UNMUTE"}.get(v, "VOLUME_STEP")
        action = (
            {"type": kind} if kind != "VOLUME_STEP" else {"type": kind, "delta": 20 if v == "up" else -20}
        )
        msg = L.t(f"VOLUME_{v}", lang)
    elif intent == Intent.STOP_SPEAKING:
        action, msg = {"type": "STOP_SPEAKING"}, L.t("STOP_SPEAKING", lang)
    else:  # defensive: should be unreachable given routing
        return {"route": "llm_router", "answer_key": "NOT_UNDERSTOOD", "action": None}

    # "go back 10 seconds and play", "pause and go back": the client sets play state after the seek
    then = s.get("then")
    if then and action["type"].startswith("SEEK") and "then" not in action:
        action["then"] = then
        if s.get("anchor") != "start":  # RESTART already says "playing"
            msg = L.t(f"THEN_{then}", lang, msg=msg)

    return {"action": action, "response_text": msg, "route": state.get("route") or "fast"}


NO_TRANSCRIPT_REASONS = {"unavailable", "no_speech", "invalid_video"}


def transcript_gate(state: StudyState) -> str | None:
    """Template key explaining why a transcript-dependent intent can't run yet, or None if it can.
    Degrades gracefully (roadmap D10b): the reason is named, and player commands keep working."""
    status = state.get("transcript_status") or "pending"
    if status == "ready":
        return None
    if status == "unavailable":
        reason = state.get("transcript_fail_reason")
        return f"NO_TRANSCRIPT_{reason if reason in NO_TRANSCRIPT_REASONS else 'unavailable'}"
    if status == "failed":
        return "NO_TRANSCRIPT_failed"
    return "TRANSCRIPT_PREPARING"  # pending / fetching / transcribing / embedding


# retrieval thresholds (BGE-M3 cosine), calibrated on MIT 6.006 L1 (HtSuA80QTyo): relevant chunks score
# 0.58–0.65, an off-topic query ("quantum physics") tops out at 0.45 — see docs/TIER1B_SMOKE_TEST.md
SEEK_MIN_SIM = 0.5  # below this the best chunk isn't really about the topic
SEEK_ALT_MARGIN = 0.015  # a second match this close in similarity…
SEEK_ALT_MIN_LEX = 0.5  # …that also shares the topic words (≥ half the best BM25)…
SEEK_ALT_MIN_GAP_S = 120.0  # …somewhere else in the video → "did you mean"
SPOILER_MIN_SIM = 0.5  # a future chunk this relevant…
SPOILER_MARGIN = 0.05  # …clearly better than anything watched…
WATCHED_ENOUGH_SIM = 0.55  # …while nothing watched is a good match → "not covered yet". (At 26:00, "why log
# n" has a 0.59 watched match and a 0.64 future one: it was covered, so answer from what was watched.)
ASK_TOP_K = 5
SUMMARY_BUDGET_CHARS = 9000  # ≈2.3k tokens of transcript: keeps Groq free-tier TPM comfortable

_CITE = re.compile(r"\[(\d{1,2}:\d{2}(?::\d{2})?)\]")
# gpt-oss likes CJK lenticular brackets for citations (【16:38】); normalize to the [16:38] the client parses
_BRACKETS = str.maketrans({"【": "[", "】": "]", "〔": "[", "〕": "]"})


def _normalize_citations(text: str) -> str:
    return text.translate(_BRACKETS)


def _clock_to_s(clock: str) -> float:
    total = 0
    for part in clock.split(":"):
        total = total * 60 + int(part)
    return float(total)


@timed("seek_resolver")
def seek_resolver(state: StudyState, config: RunnableConfig) -> dict[str, Any]:
    """Semantic seek: search the WHOLE video (jumping ahead is the point — D7), no LLM."""
    if key := transcript_gate(state):
        return {"route": "seek", "answer_key": key}
    deps = _deps(config)
    slots = dict(state.get("slots") or {})
    topic = (
        slots.get("topic") or parse_slots(state.get("normalized_text", ""), Intent.SEMANTIC_SEEK.value).topic
    )
    # the raw utterance (BGE-M3 is cross-lingual, so Devanagari works) + the cleaned topic words
    queries = [state.get("raw_text", ""), topic or ""]
    hits = _run(deps, deps.retriever.rank(state["video_id"], queries))
    if not hits:
        return {"route": "seek", "answer_key": "TOPIC_NOT_FOUND"}
    best = hits[0]
    log.info(
        "seek %r: best %s sim=%s lex=%.2f | next %s",
        topic,
        L.fmt_clock(best.start_s),
        f"{best.sim:.3f}" if best.sim is not None else "-",
        best.lex,
        ", ".join(f"{L.fmt_clock(h.start_s)}={h.sim:.3f}" for h in hits[1:4] if h.sim is not None),
    )
    confident = best.sim >= SEEK_MIN_SIM if best.sim is not None else best.lex > 0
    if not confident:
        log.info("seek: best sim %.3f below threshold for %r", best.sim or 0.0, topic)
        return {"route": "seek", "answer_key": "TOPIC_NOT_FOUND"}

    def close(h: Any) -> bool:
        if best.lex > 0 and h.lex < SEEK_ALT_MIN_LEX * best.lex:
            return False  # similar embedding but not the same words: usually a different topic
        if best.sim is not None and h.sim is not None:
            return best.sim - h.sim <= SEEK_ALT_MARGIN
        return h.score >= 0.9 * best.score

    alt = next(
        (h for h in hits[1:4] if abs(h.start_s - best.start_s) >= SEEK_ALT_MIN_GAP_S and close(h)), None
    )
    slots.update(topic=topic, target_s=best.start_s, alt_s=alt.start_s if alt else None)
    return {"route": "seek", "slots": slots}


def _is_spoiler(watched: list[Any], future: list[Any]) -> bool:
    """The question is about a part the learner hasn't reached yet (D7: Q&A never reads ahead)."""
    if not future:
        return False
    f = future[0]
    if f.sim is not None:
        best_w = max((h.sim for h in watched if h.sim is not None), default=-1.0)
        return f.sim >= SPOILER_MIN_SIM and f.sim - best_w >= SPOILER_MARGIN and best_w < WATCHED_ENOUGH_SIM
    best_w = max((h.lex for h in watched), default=0.0)
    return f.lex > 0 and f.lex >= 1.5 * best_w


def _even_sample(chunks: list[Any], budget: int) -> list[Any]:
    """Whole-lecture coverage within a character budget: evenly spaced chunks, in time order."""
    total = sum(len(c.text) for c in chunks)
    if total <= budget:
        return chunks
    keep = max(1, int(len(chunks) * budget / total))
    step = len(chunks) / keep
    return [chunks[int(i * step)] for i in range(keep)]


def _system_prompt(lang: str, at_s: float, summarize: bool, spoiler_guard: bool = True) -> str:
    language = (
        "Hindi, written in Devanagari script (keep technical terms like 'algorithm' in English)"
        if lang == "hi"
        else "English"
    )
    if spoiler_guard:
        scope = f"The learner has watched the lecture up to {L.fmt_clock(at_s)}."
        task = (
            "Summarize what the lecture has covered so far in 3-5 short sentences."
            if summarize
            else "Answer the learner's question in 2-4 short sentences."
        )
        missing = (
            "If the excerpts don't cover the question, say it hasn't come up in what they've watched so far; you "
            "may then add a brief general explanation of the concept, clearly marked as not from this lecture. "
            "Never predict, hint at or guess what this lecture or course covers later. "
        )
    else:  # the learner turned the spoiler guard off: the whole lecture is fair game
        scope = (
            f"The learner is at {L.fmt_clock(at_s)} and has turned spoiler protection off, so excerpts may come "
            "from any part of the lecture, including parts they haven't watched yet."
        )
        task = (
            "Summarize the whole lecture in 4-6 short sentences, in order."
            if summarize
            else "Answer the learner's question in 2-4 short sentences."
        )
        missing = (
            "If the excerpts don't cover the question, say this lecture doesn't seem to cover it; you may then add "
            "a brief general explanation of the concept, clearly marked as not from this lecture. "
        )
    return (
        "You are StudyLoop, a voice study copilot inside a YouTube lecture player. "
        f"{scope} {task} Reply in {language}. "
        "Use only the transcript excerpts provided; each starts with its timestamp in square brackets. "
        "Cite the excerpts you rely on with that exact timestamp in plain ASCII square brackets, e.g. [12:30]. "
        f"{missing}Your reply is read aloud: plain sentences, no markdown, no lists."
    )


def _history_messages(state: StudyState, limit: int = 4) -> list[dict[str, str]]:
    """The last couple of exchanges, so follow-ups ("explain that again") have context."""
    out = []
    for h in (state.get("history") or [])[-limit:]:
        if h.get("text"):
            out.append(
                {"role": "user" if h.get("role") == "user" else "assistant", "content": str(h["text"])[:600]}
            )
    return out


@timed("rag_agent")
def rag_agent(state: StudyState, config: RunnableConfig) -> dict[str, Any]:
    """Q&A / summary grounded in the transcript the learner has ALREADY watched (D7), streamed (D8).
    With the spoiler guard off (a UI toggle, `spoiler_guard=False`), the whole lecture is used instead."""
    if key := transcript_gate(state):
        return {"route": "rag", "answer_key": key}
    deps = _deps(config)
    lang = state.get("language", "en")
    max_w = float(state.get("max_watched_s") or 0.0)
    guard = state.get("spoiler_guard", True) is not False
    summarize = state.get("intent") == Intent.SUMMARIZE.value
    question = state.get("raw_text", "")

    if summarize:
        chunks = _run(deps, deps.retriever.watched(state["video_id"], max_w if guard else float("inf")))
        if not chunks:
            return {"route": "rag", "answer_key": "NOTHING_WATCHED"}
        context = _even_sample(chunks, SUMMARY_BUDGET_CHARS)
        user = "Summarize the lecture so far." if guard else "Summarize the whole lecture."
    else:
        queries = [question, state.get("normalized_text", "")]
        if (
            len(tokens(question)) <= 2
        ):  # a follow-up ("say that more simply"): search with the last question too
            prev = next(
                (h["text"] for h in reversed(state.get("history") or []) if h.get("role") == "user"), ""
            )
            queries.append(prev)
        hits = _run(deps, deps.retriever.rank(state["video_id"], queries))
        if not guard:  # spoiler guard off: rank over the whole lecture, no "not covered yet"
            context = sorted(hits[:ASK_TOP_K], key=lambda h: h.start_s)
            return _answer(state, deps, context, question, lang, max_w, summarize, guard)
        watched = [h for h in hits if h.end_s <= max_w + 0.5]
        future = [h for h in hits if h.end_s > max_w + 0.5]
        log.info(
            "ask at %s: best watched %s, best future %s",
            L.fmt_clock(max_w),
            f"{watched[0].sim:.3f}@{L.fmt_clock(watched[0].start_s)}"
            if watched and watched[0].sim is not None
            else "-",
            f"{future[0].sim:.3f}@{L.fmt_clock(future[0].start_s)}"
            if future and future[0].sim is not None
            else "-",
        )
        if _is_spoiler(watched[:ASK_TOP_K], future):
            return {"route": "rag", "answer_key": "NOT_COVERED_YET"}
        context = sorted(watched[:ASK_TOP_K], key=lambda h: h.start_s)
        user = question
    return _answer(state, deps, context, user, lang, max_w, summarize, guard)


def _answer(
    state: StudyState,
    deps: TurnDeps,
    context: list[Any],
    user: str,
    lang: str,
    max_w: float,
    summarize: bool,
    guard: bool,
) -> dict[str, Any]:
    """Stream the grounded answer over `context` (already cut to what the spoiler guard allows)."""
    excerpts = "\n".join(f"[{L.fmt_clock(c.start_s)}] {c.text}" for c in context) or "(nothing relevant yet)"
    messages = [
        {"role": "system", "content": _system_prompt(lang, max_w, summarize, guard)},
        *_history_messages(state),
        {"role": "user", "content": f"Transcript excerpts:\n{excerpts}\n\nLearner: {user}"},
    ]
    # retrieval still helps when the LLM is down: point at the most relevant moment (watched, if guarded)
    top = None if summarize or not context else max(context, key=lambda c: c.score).start_s
    fallback: dict[str, Any] = {"route": "rag", "answer_key": "LLM_UNAVAILABLE"}
    if top is not None:
        fallback.update(
            answer_key="LLM_UNAVAILABLE_AT" if guard else "LLM_UNAVAILABLE_AT_ANY",
            answer_args={"clock": L.fmt_clock(top)},
            citations=[{"start_s": top}],
        )
    if not deps.llm.configured:
        return {**fallback, "answer_key": fallback["answer_key"].replace("UNAVAILABLE", "NOT_CONFIGURED")}
    from app.services.llm import LLMError

    async def on_delta(delta: str) -> None:
        if deps.emit is not None:
            await deps.emit(_normalize_citations(delta))

    try:
        text = _run(
            deps,
            deps.llm.stream(
                messages,
                on_delta=on_delta,
                is_cancelled=deps.is_cancelled,
                max_tokens=450 if summarize else 300,
            ),
        )
    except LLMError as exc:
        log.warning("rag answer failed: %s", exc)
        return fallback
    text = _normalize_citations(text).strip()
    if not text:
        return fallback
    return {"route": "rag", "answer_text": text, "citations": _citations(text, context)}


def _citations(text: str, context: list[Any]) -> list[dict[str, float]]:
    """[mm:ss] markers in the answer that point at an excerpt we actually gave the model (seekable chips)."""
    out: list[dict[str, float]] = []
    seen: set[float] = set()
    for m in _CITE.finditer(text):
        t = _clock_to_s(m.group(1))
        c = next((c for c in context if c.start_s - 1 <= t <= c.end_s), None)
        if c is not None and c.start_s not in seen:
            seen.add(c.start_s)
            out.append({"start_s": c.start_s})
    return out


_BOOKMARK = re.compile(r"\b(bookmark|bukmark|star)\b|बुकमार्क")


@timed("notes_agent")
def notes_agent(state: StudyState) -> dict[str, Any]:
    """Tier 1e: an optimistic note at playback_s, drafted with no I/O so the ack stays under 200 ms. The
    WebSocket stores it and adds the LLM summary in the background (never inside the turn)."""
    at = max(0.0, float(state.get("playback_s") or 0.0))
    said = f"{state.get('normalized_text', '')} {state.get('raw_text', '')}".lower()
    bookmark = bool(_BOOKMARK.search(said))
    note = {
        "id": str(uuid.uuid4()),
        "video_id": state.get("video_id", ""),
        "session_id": state.get("session_id"),
        "at_s": round(at, 2),
        "raw_text": state.get("raw_text", ""),
        "is_auto": True,
        "is_bookmarked": bookmark,
    }
    return {
        "route": "notes",
        "note": note,
        "answer_key": "NOTE_BOOKMARKED" if bookmark else "NOTE_SAVED",
        "answer_args": {"clock": L.fmt_clock(at)},
    }


def _fn_tool(
    name: str, description: str, properties: dict[str, Any], required: list[str] | None = None
) -> dict:
    params: dict[str, Any] = {"type": "object", "properties": properties}
    if required:
        params["required"] = required
    return {"type": "function", "function": {"name": name, "description": description, "parameters": params}}


ROUTER_TOOLS: list[dict[str, Any]] = [
    _fn_tool(
        "control_player",
        "Control video playback: play, pause, seek, replay, speed, volume, or stop speaking.",
        {
            "command": {"type": "string", "enum": sorted(i.value for i in PLAYER_INTENTS)},
            "seconds": {
                "type": "number",
                "description": "How far to seek back/forward or replay, in seconds",
            },
            "timestamp_s": {"type": "number", "description": "SEEK_ABSOLUTE target, seconds from the start"},
            "rate": {"type": "number", "description": "Playback rate between 0.25 and 2"},
            "rate_direction": {"type": "string", "enum": ["up", "down"]},
            "volume": {"type": "string", "enum": ["mute", "unmute", "up", "down", "set"]},
            "volume_level": {"type": "integer", "description": "0-100, with volume=set"},
        },
        ["command"],
    ),
    _fn_tool(
        "jump_to_topic",
        "Jump to the part of the lecture about a topic.",
        {"topic": {"type": "string"}},
        ["topic"],
    ),
    _fn_tool("answer_question", "The learner asks a question about the lecture's subject or content.", {}),
    _fn_tool("summarize", "Summarize the lecture so far.", {}),
    _fn_tool("take_note", "Save a note at the current moment.", {"text": {"type": "string"}}),
]

_ROUTER_SYSTEM = (
    "You route voice commands in StudyLoop, a YouTube lecture player. Speech may be English, Hindi or "
    "Hinglish, and speech recognition can garble words. Call exactly one tool when the utterance is a "
    "playback command, a request to jump to a topic, a question about the lecture, a summary request or a "
    "note. Only for small talk or a question about using StudyLoop, reply instead with one short plain "
    "sentence in {language}. If it is unintelligible, briefly ask what they meant, in {language}."
)


def _num(args: dict[str, Any], key: str) -> float | None:
    v = args.get(key)
    return float(v) if isinstance(v, int | float) and not isinstance(v, bool) else None


def _router_decision(msg: dict[str, Any]) -> dict[str, Any] | None:
    """The router's tool call → a state update that continues the graph, or None if unusable."""
    calls = msg.get("tool_calls") or []
    if not calls:
        return None
    fn = calls[0].get("function") or {}
    name = fn.get("name")
    try:
        args = json.loads(fn.get("arguments") or "{}") or {}
    except ValueError:
        args = {}
    if not isinstance(args, dict):
        args = {}
    if name == "jump_to_topic" and str(args.get("topic") or "").strip():
        topic = str(args["topic"]).strip()
        return {
            "intent": Intent.SEMANTIC_SEEK.value,
            "slots": {"topic": topic},
            "router_target": "seek_resolver",
        }
    if name in ("answer_question", "summarize", "take_note"):
        intent = {
            "answer_question": Intent.ASK,
            "summarize": Intent.SUMMARIZE,
            "take_note": Intent.TAKE_NOTE,
        }[name]
        target = "notes_agent" if intent == Intent.TAKE_NOTE else "rag_agent"
        return {"intent": intent.value, "router_target": target}
    if name != "control_player":
        return None
    try:
        intent = Intent(str(args.get("command")))
    except ValueError:
        return None
    if intent not in PLAYER_INTENTS:
        return None

    slots: dict[str, Any] = {}
    if intent in (Intent.SEEK_BACK, Intent.SEEK_FORWARD, Intent.REPLAY):
        v = _num(args, "seconds")
        if v is not None and 0 < v <= 36000:
            slots["duration_s"] = v
    elif intent == Intent.SEEK_ABSOLUTE:
        v = _num(args, "timestamp_s")
        if v is None or v < 0:
            return {"intent": intent.value, "answer_key": "MISSING_TIME", "router_target": "localize"}
        slots["timestamp_s"] = v
    elif intent == Intent.SPEED:
        v = _num(args, "rate")
        if v is not None and 0.25 <= v <= 2:
            slots["rate"] = v
        else:
            slots["rate_direction"] = "down" if args.get("rate_direction") == "down" else "up"
    elif intent == Intent.VOLUME:
        vol = args.get("volume") if args.get("volume") in ("mute", "unmute", "up", "down", "set") else "up"
        level = _num(args, "volume_level")
        if vol == "set" and (level is None or not 0 <= level <= 100):
            vol = "up"
        slots["volume"] = vol
        if vol == "set" and level is not None:
            slots["volume_level"] = int(level)
    return {"intent": intent.value, "slots": slots, "error": None, "router_target": "action_executor"}


@timed("llm_router")
def llm_router(state: StudyState, config: RunnableConfig) -> dict[str, Any]:
    """Fallback for low confidence / OOS / a missing slot: one tool-calling request (D3)."""
    text = state.get("normalized_text", "")
    if state.get("error") == "missing_slot" and state.get("intent") == "SEEK_ABSOLUTE":
        return {"route": "llm", "answer_key": "MISSING_TIME", "router_target": "localize"}
    if regex_classifier.is_help(text):
        return {"route": "llm", "answer_key": "HELP", "router_target": "localize"}  # the command list, no LLM
    deps = _deps(config)
    if not deps.llm.configured:
        return {"route": "llm", "answer_key": "NOT_UNDERSTOOD", "router_target": "localize"}
    lang = state.get("language", "en")
    system = _ROUTER_SYSTEM.format(language="Hindi (Devanagari script)" if lang == "hi" else "English")
    messages = [
        {"role": "system", "content": system},
        {"role": "user", "content": f"{state.get('raw_text', '')}\n(normalized: {text})"},
    ]
    from app.services.llm import LLMError

    try:
        msg = _run(deps, deps.llm.tools(messages, ROUTER_TOOLS))
    except LLMError as exc:
        log.warning("llm_router failed: %s", exc)
        return {"route": "llm", "answer_key": "NOT_UNDERSTOOD", "router_target": "localize"}
    decision = _router_decision(msg)
    if decision is not None:
        return {"route": "llm", **decision}
    content = str(msg.get("content") or "").strip()
    if content:
        return {"route": "llm", "answer_text": content[:500], "router_target": "localize"}
    return {"route": "llm", "answer_key": "NOT_UNDERSTOOD", "router_target": "localize"}


@timed("localize")
def localize_node(state: StudyState) -> dict[str, Any]:
    if state.get("answer_text"):  # LLM agents already wrote in the target language (roadmap D5)
        return {"response_text": state["answer_text"]}
    key = state.get("answer_key") or "NOT_UNDERSTOOD"
    return {"response_text": L.t(key, state.get("language", "en"), **(state.get("answer_args") or {}))}


def respond(state: StudyState) -> dict[str, Any]:
    at = datetime.now(timezone.utc).isoformat()  # chat history (Tier 2) reads these back per session
    return {
        "history": [
            {"role": "user", "text": state.get("raw_text", ""), "at_s": state.get("playback_s"), "at": at},
            {"role": "assistant", "text": state.get("response_text", ""), "route": state.get("route")},
        ]
    }


# ------------------------------------------------------------------ routing
def route_after_classify(state: StudyState) -> str:
    intent = state.get("intent", Intent.OOS.value)
    if state.get("confidence", 0.0) < get_settings().confidence_threshold or intent == Intent.OOS.value:
        return "llm_router"
    if Intent(intent) in PLAYER_INTENTS:
        return "parse_slots"
    if intent == Intent.SEMANTIC_SEEK.value:
        return "seek_resolver"
    if intent in (Intent.ASK.value, Intent.SUMMARIZE.value):
        return "rag_agent"
    if intent == Intent.TAKE_NOTE.value:
        return "notes_agent"
    return "llm_router"


def route_after_slots(state: StudyState) -> str:
    return "llm_router" if state.get("error") == "missing_slot" else "action_executor"


def route_after_router(state: StudyState) -> str:
    return state.get("router_target") or "localize"


def route_after_seek(state: StudyState) -> str:
    return "action_executor" if (state.get("slots") or {}).get("target_s") is not None else "localize"


def build_graph(checkpointer: Any | None = None):
    g = StateGraph(StudyState)
    g.add_node("normalize_input", normalize_input)
    g.add_node("classify_intent", classify_intent)
    g.add_node("parse_slots", parse_slots_node)
    g.add_node("action_executor", action_executor)
    g.add_node("seek_resolver", seek_resolver)
    g.add_node("rag_agent", rag_agent)
    g.add_node("notes_agent", notes_agent)
    g.add_node("llm_router", llm_router)
    g.add_node("localize", localize_node)
    g.add_node("respond", respond)

    g.add_edge(START, "normalize_input")
    g.add_edge("normalize_input", "classify_intent")
    g.add_conditional_edges(
        "classify_intent",
        route_after_classify,
        ["parse_slots", "seek_resolver", "rag_agent", "notes_agent", "llm_router"],
    )
    g.add_conditional_edges("parse_slots", route_after_slots, ["action_executor", "llm_router"])
    g.add_conditional_edges("seek_resolver", route_after_seek, ["action_executor", "localize"])
    g.add_edge("action_executor", "respond")  # fast path: no localize/LLM hop
    g.add_conditional_edges(
        "llm_router",
        route_after_router,
        ["action_executor", "seek_resolver", "rag_agent", "notes_agent", "localize"],
    )
    for n in ("rag_agent", "notes_agent"):
        g.add_edge(n, "localize")
    g.add_edge("localize", "respond")
    g.add_edge("respond", END)
    return g.compile(checkpointer=checkpointer)


PER_TURN_RESET: dict[str, Any] = {
    "normalized_text": "",
    "intent": "",
    "confidence": 0.0,
    "slots": {},
    "route": "",
    "action": None,
    "answer_key": None,
    "answer_text": None,
    "answer_args": None,
    "citations": [],
    "note": None,
    "router_target": None,
    "response_text": None,
    "timings": {},
    "error": None,
    "transcript_status": "pending",
    "transcript_fail_reason": None,
}


def new_turn_input(**fields: Any) -> dict[str, Any]:
    """Checkpointer state persists across turns, so every per-turn field is explicitly reset."""
    return {**PER_TURN_RESET, **fields}


_graph = None


def get_graph():
    """Process-wide compiled graph (checkpointer chosen by `init_checkpointer`, MemorySaver by default)."""
    global _graph
    if _graph is None:
        _graph = build_graph(checkpointer=MemorySaver())
    return _graph


def set_checkpointer(checkpointer: Any) -> None:
    """Startup: rebuild the process-wide graph around the configured checkpointer."""
    global _graph
    _graph = build_graph(checkpointer=checkpointer)
