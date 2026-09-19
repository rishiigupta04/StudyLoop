from __future__ import annotations

from typing import Annotated, Any, Literal, TypedDict

MAX_HISTORY = 20


def keep_recent(existing: list[dict] | None, new: list[dict] | None) -> list[dict]:
    """Reducer: append this turn's messages, keep the last MAX_HISTORY (conversation memory via checkpointer)."""
    return ((existing or []) + (new or []))[-MAX_HISTORY:]


class StudyState(TypedDict, total=False):
    # session (set once per turn from the WS session; `language` comes only from the UI toggle)
    session_id: str
    user_id: str
    video_id: str
    language: Literal["en", "hi"]
    playback_s: float
    max_watched_s: float
    turn_id: str
    # per-turn pipeline fields (reset on every turn — see graph.new_turn_input)
    raw_text: str
    normalized_text: str
    intent: str
    confidence: float
    slots: dict[str, Any]
    route: str
    action: dict[str, Any] | None
    answer_key: str | None
    answer_text: str | None
    response_text: str | None
    timings: dict[str, float]
    error: str | None
    # multi-turn memory
    history: Annotated[list[dict], keep_recent]
