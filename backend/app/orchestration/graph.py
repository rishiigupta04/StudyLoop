"""StudyLoop LangGraph — authoritative shape from STUDYLOOP_ROADMAP_V2.md §2.

START → normalize_input → classify_intent ─┬─ player intent ≥τ ─→ parse_slots ─(ok)→ action_executor → END
                                           │                          └─(missing slot)→ llm_router
                                           ├─ SEMANTIC_SEEK ≥τ ─→ seek_resolver ─→ action_executor
                                           ├─ ASK / SUMMARIZE ≥τ ─→ rag_agent ───┐
                                           ├─ TAKE_NOTE ≥τ ─→ notes_agent ───────┤
                                           └─ <τ / OOS ─→ llm_router ─→ …        ↓
                                                                        localize → respond → END

Tier 0: classify_intent = regex stand-in; seek_resolver / rag_agent / notes_agent / llm_router are
honest stubs that return a localized "not yet" template. Later tiers fill node bodies only —
the shape and the WS contract stay fixed.
"""

from __future__ import annotations

import time
from collections.abc import Callable
from functools import wraps
from typing import Any

from langgraph.checkpoint.memory import MemorySaver
from langgraph.graph import END, START, StateGraph

from app.config import get_settings
from app.orchestration import localize as L
from app.orchestration import regex_classifier
from app.orchestration.intents import PLAYER_INTENTS, Intent
from app.orchestration.state import StudyState
from studyloop_nlp import normalize, parse_slots
from studyloop_nlp.slots import DEFAULT_REPLAY_S, DEFAULT_SEEK_S, END_OFFSET_S, SPEED_STEP, missing_slots

NodeFn = Callable[[StudyState], dict[str, Any]]


def timed(name: str) -> Callable[[NodeFn], NodeFn]:
    """Record per-node wall time (ms) into state.timings — returned to the client and logged (Tier 1f)."""

    def deco(fn: NodeFn) -> NodeFn:
        @wraps(fn)
        def wrapper(state: StudyState) -> dict[str, Any]:
            t0 = time.perf_counter()
            out = fn(state) or {}
            timings = dict(state.get("timings") or {})
            timings.update(out.pop("timings", {}) or {})
            timings[name] = round((time.perf_counter() - t0) * 1000, 3)
            out["timings"] = timings
            return out

        return wrapper

    return deco


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
        action, msg = {"type": "SEEK_TO", "seconds": ts}, L.t("SEEK_ABSOLUTE", lang, clock=L.fmt_clock(ts))
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


@timed("seek_resolver")
def seek_resolver(state: StudyState) -> dict[str, Any]:
    # Tier 1b: embed raw utterance + cleaned topic → match_chunks(max_end_s=None) → slots.target_s
    return {"route": "seek", "answer_key": "SOON_SEMANTIC_SEEK"}


@timed("rag_agent")
def rag_agent(state: StudyState) -> dict[str, Any]:
    # Tier 1b: hybrid retrieval filtered by end_s <= max_watched_s, streamed Groq answer in `language`
    key = "SOON_SUMMARIZE" if state.get("intent") == Intent.SUMMARIZE.value else "SOON_ASK"
    return {"route": "rag", "answer_key": key}


@timed("notes_agent")
def notes_agent(state: StudyState) -> dict[str, Any]:
    # Tier 1e: optimistic note at playback_s, async LLM summary
    return {"route": "notes", "answer_key": "SOON_TAKE_NOTE"}


@timed("llm_router")
def llm_router(state: StudyState) -> dict[str, Any]:
    # Tier 1b: one Groq tool-calling call → player action | route | direct answer
    if state.get("error") == "missing_slot" and state.get("intent") == "SEEK_ABSOLUTE":
        key = "MISSING_TIME"
    elif regex_classifier.is_help(state.get("normalized_text", "")):
        key = "HELP"  # "what can I say?" — answered with the command list, spoken aloud
    else:
        key = "NOT_UNDERSTOOD"
    return {"route": "llm", "answer_key": key}


@timed("localize")
def localize_node(state: StudyState) -> dict[str, Any]:
    if state.get("answer_text"):  # LLM agents already wrote in the target language (roadmap D5)
        return {"response_text": state["answer_text"]}
    return {"response_text": L.t(state.get("answer_key") or "NOT_UNDERSTOOD", state.get("language", "en"))}


def respond(state: StudyState) -> dict[str, Any]:
    return {
        "history": [
            {"role": "user", "text": state.get("raw_text", ""), "at_s": state.get("playback_s")},
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
    for n in ("rag_agent", "notes_agent", "llm_router"):
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
    "response_text": None,
    "timings": {},
    "error": None,
}


def new_turn_input(**fields: Any) -> dict[str, Any]:
    """Checkpointer state persists across turns, so every per-turn field is explicitly reset."""
    return {**PER_TURN_RESET, **fields}


_graph = None


def get_graph():
    """Process-wide compiled graph. MemorySaver for now; AsyncPostgresSaver once DATABASE_URL is wired (Tier 1b)."""
    global _graph
    if _graph is None:
        _graph = build_graph(checkpointer=MemorySaver())
    return _graph
