"""Intent taxonomy v1 (roadmap §3). Frozen before classifier data collection — changing it means relabelling."""

from enum import Enum


class Intent(str, Enum):
    PLAY = "PLAY"
    PAUSE = "PAUSE"
    SEEK_BACK = "SEEK_BACK"
    SEEK_FORWARD = "SEEK_FORWARD"
    SEEK_ABSOLUTE = "SEEK_ABSOLUTE"
    REPLAY = "REPLAY"
    SPEED = "SPEED"
    VOLUME = "VOLUME"
    SEMANTIC_SEEK = "SEMANTIC_SEEK"
    ASK = "ASK"
    SUMMARIZE = "SUMMARIZE"
    TAKE_NOTE = "TAKE_NOTE"
    STOP_SPEAKING = "STOP_SPEAKING"
    OOS = "OOS"


# Executed by action_executor directly — never touch an LLM (the <150 ms fast path).
PLAYER_INTENTS = frozenset(
    {
        Intent.PLAY,
        Intent.PAUSE,
        Intent.SEEK_BACK,
        Intent.SEEK_FORWARD,
        Intent.SEEK_ABSOLUTE,
        Intent.REPLAY,
        Intent.SPEED,
        Intent.VOLUME,
        Intent.STOP_SPEAKING,
    }
)
