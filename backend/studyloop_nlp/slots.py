"""Deterministic slot extraction on *normalized* text (graph node `parse_slots`, roadmap D4).

The classifier says WHAT (SEEK_BACK); this says HOW MUCH (30 s). Pure regex, <1 ms.
If an intent's required slot is missing, the graph falls back to `llm_router`.
"""

from __future__ import annotations

import re
from dataclasses import asdict, dataclass

_NUM = r"\d+(?:\.\d+)?"
_UNIT_S = {"seconds": 1, "minutes": 60, "hours": 3600}

# intent → slots that must be present for the fast path to act (SEEK_ABSOLUTE / SPEED: see missing_slots)
REQUIRED: dict[str, tuple[str, ...]] = {
    "SEEK_ABSOLUTE": ("timestamp_s",),
    "SEMANTIC_SEEK": ("topic",),
    "SPEED": ("rate",),
    "VOLUME": ("volume",),
}
# defaults applied by action_executor when the user was vague ("thoda peeche")
DEFAULT_SEEK_S = 10.0
BIG_SEEK_S = 30.0  # "go back a lot", "bahut aage", "skip this part"
DEFAULT_REPLAY_S = 15.0
END_OFFSET_S = 30.0  # "go to the end" lands 30 s before the end, not on the final frame
SPEED_STEP = 0.25


@dataclass
class Slots:
    duration_s: float | None = None  # relative seek amount
    timestamp_s: float | None = None  # absolute seek target
    anchor: str | None = None  # named position: "start" | "end" | "previous" (undo the last jump)
    fraction: float | None = None  # 0..1 of the video: "the middle", "75 percent"
    rate: float | None = None  # explicit playback rate
    rate_direction: str | None = None  # "up" | "down" | "reset"
    volume: str | None = None  # "mute" | "unmute" | "up" | "down" | "set"
    volume_level: int | None = None  # 0..100 when volume == "set"
    then: str | None = None  # "PLAY" | "PAUSE" after a seek: "go back 10 seconds and play"
    topic: str | None = None  # semantic seek query

    def to_dict(self) -> dict:
        return {k: v for k, v in asdict(self).items() if v is not None}


def _parse_clock(s: str) -> float | None:
    parts = s.split(":")
    if not all(p.isdigit() for p in parts) or not 2 <= len(parts) <= 3:
        return None
    nums = [int(p) for p in parts]
    if any(n >= 60 for n in nums[1:]):
        return None
    total = 0
    for n in nums:
        total = total * 60 + n
    return float(total)


def _durations(text: str) -> float | None:
    hits = re.findall(rf"({_NUM})\s*(seconds|minutes|hours)\b", text)
    if not hits:
        return None
    return float(sum(float(n) * _UNIT_S[u] for n, u in hits))


# fmt: off
_PREVIOUS = re.compile(
    r"\b(undo|where (i|we) (was|were|left off)|previous position|last position|wapas wahin|wahin wapas|"
    r"jahan (tha|the|thi) wahan|pehle wali jagah|pichhli jagah)\b"
)
_START = re.compile(
    r"\b(restart|start over|beginning|the start|the top|from the top|scratch|starting|shuru se|shuru mein|"
    r"shuruaat|start se|zero se)\b|\b(dobara|phir se) shuru\b|\bstart (\w+ ){1,2}over\b"
)
_START_PLAYS = re.compile(
    r"\b(restart|start over|from the top|shuru se|shuruaat se|start se|zero se)\b|\b(dobara|phir se) shuru\b|"
    r"\bstart (\w+ ){1,2}over\b|"
    r"^(play|start|resume)\b"
)
_END = re.compile(
    r"\b(the end|the very end|to end|end (pe|par|mein|tak)|ending|aakhir|aakhri|last part|last (mein|pe|par))\b"
)
_MIDDLE = re.compile(r"\b(middle|halfway|half way|midpoint|mid point|beech|aadhe video|aadha video)\b")
_THEN_PLAY = re.compile(
    r"\b(and|then|aur|phir)\s+(play|resume|continue|chalao|chala do|chalu karo|start playing)\b|"
    r"^(play|start|resume) (from|at)\b|\b(se|from) (chalao|chalaiye|play karo|shuru karo|dikhao)\b"
)
_THEN_PAUSE = re.compile(
    r"\b(and|then|aur|phir)\s+(pause|stop|roko|ruko|rok do|pause karo)\b|^(pause|stop|ruko|roko)( it)? (and|then|aur|phir)\b"
)
_BIG = re.compile(r"\b(a lot|way back|far back|bahut|kaafi|much)\b|\bskip (this|the current)( part| section| bit| portion| one)?$")
_LAST_UNIT = re.compile(r"\b(last|previous|past|pichhle|pichla|pichhli)\s+(seconds|minutes)\b")
_BARE_MINUTE = re.compile(r"\b(to|at|from)\s+(\d{1,3})$")  # "go to 12" → minute 12

_SEEK_TRIGGERS = re.compile(
    r"\b(skip|jump|go|take me|le chalo|le jao|chalo|jao|move|seek|navigate|fast forward|rewind|find|search|"
    r"look|for|dhundo|dhoondo|khojo|"
    r"to|till|tak|pe|par|on|the|a|an|part|portion|section|segment|hissa|hisse|wala|wali|wale|"
    r"where|jahan|wahan|he|she|they|explains?|explained|talks?|talking|discuss(?:es|ed)?|covers?|mentions?|"
    r"about|baare|mein|ke|ki|ka|se|me|video|lecture|please|can|you|us|show|dikhao|batao|lagao|karo|do|"
    r"kahan|kiya|hai|samjhaya|bataya|back)\b"
)
# fmt: on


def _rate(t: str, intent: str | None) -> tuple[float | None, str | None]:
    m = (
        re.search(rf"\b({_NUM})x\b", t)
        or re.search(rf"\bspeed\s+(?:to\s+|ko\s+|at\s+)?({_NUM})\b", t)
        or re.search(rf"\b({_NUM})\s+(?:speed|guna|times)\b", t)
        or re.search(rf"\b(?:playback rate|playback speed|rate)\s+(?:to\s+)?({_NUM})\b", t)
    )
    if m and 0.25 <= float(m.group(1)) <= 2:
        return float(m.group(1)), None
    if re.search(r"\b(normal|regular|default|reset|original)\b", t) and intent in (None, "SPEED"):
        return 1.0, "reset"
    if re.search(r"\b(max|maximum|top|full|highest) speed\b|\bfastest\b", t):
        return 2.0, None
    if re.search(r"\b(min|minimum|lowest) speed\b|\bslowest\b", t):
        return 0.25, None
    if re.search(r"\b(double|twice|dugna|dugni|doguna)\b", t):
        return 2.0, None
    if re.search(r"\b(half|aadhi|aadha) speed\b", t):
        return 0.5, None
    # complaints invert the adjective: "it is too fast" → slow down
    if re.search(r"\b(too|very|bahut|kaafi|zyada|itna|so) (fast|tez|jaldi|quick)\b", t):
        return None, "down"
    if re.search(r"\b(too|very|bahut|kaafi|itna|so) (slow|dheere|dheema)\b", t):
        return None, "up"
    # subject + direction anywhere: "speed thodi badhao", "speed it up", "increase playback speed"
    if re.search(r"\b(speed|playback|rate)\b", t):
        if re.search(r"\b(badhao|badha|badhaiye|increase|raise|boost|up|zyada|tez|faster)\b", t):
            return None, "up"
        if re.search(r"\b(kam|ghatao|ghata|decrease|reduce|lower|down|dheere|dheema|slow|slower)\b", t):
            return None, "down"
    if re.search(
        r"\b(faster|fast|tez|speed up|speed badhao|speed badha|increase (the )?speed|jaldi|quicker)\b", t
    ):
        return None, "up"
    if re.search(
        r"\b(slower|slow|dheere|dheema|dheemi|dheeme|decrease (the )?speed|reduce (the )?speed|"
        r"speed kam|speed ghatao|aaram se)\b",
        t,
    ):
        return None, "down"
    return None, None


def _volume(t: str) -> tuple[str | None, int | None]:
    m = re.search(r"\b(?:volume|awaaz)\s+(?:to\s+|ko\s+|at\s+)?(\d{1,3})\b", t) or re.search(
        r"\b(\d{1,3}) percent (?:volume|awaaz)\b", t
    )
    if m and 0 <= int(m.group(1)) <= 100:
        level = int(m.group(1))
        return ("mute", None) if level == 0 else ("set", level)
    if re.search(
        r"\b(full|max|maximum|poori|poora) (volume|awaaz)\b|\b(volume|awaaz) (full|max|maximum|poori|poora)\b",
        t,
    ):
        return "set", 100
    if re.search(r"\b(half|aadhi|aadha) (volume|awaaz)\b|\b(volume|awaaz) (half|aadhi|aadha)\b", t):
        return "set", 50
    if re.search(r"\bcan not hear\b|\bno sound\b|\bsunai nahi (de|deta)\b|\bawaaz nahi aa\b", t):
        return "up", None  # VOLUME_STEP up also unmutes
    if re.search(
        r"\bunmute\b|\bsound (on|back)\b|\bsound back on\b|\bturn (on|back on) the sound\b|"
        r"\bawaaz (on|wapas|chalu)\b",
        t,
    ):
        return "unmute", None
    if re.search(r"\bmute\b|\bawaaz band\b|\bsound off\b|\bturn off the sound\b|\bsilent\b|\bsilence\b", t):
        return "mute", None
    if re.search(
        r"\b(too|very|so) (quiet|soft|low)\b|\b(awaaz|volume|sound) (bahut |kaafi |thodi )?"
        r"(kam|dheemi|low|halki) (hai|aa rahi|lag rahi)\b",
        t,
    ):
        return "up", None
    if re.search(
        r"\b(too|very|bahut|kaafi|so) loud\b|\b(awaaz|volume|sound) (bahut |kaafi )?(tez|zyada|loud) "
        r"(hai|aa rahi)\b",
        t,
    ):
        return "down", None
    # subject + direction anywhere: "awaaz thodi badhao", "turn the volume down a bit"
    if re.search(r"\b(volume|awaaz|sound|audio)\b", t):
        if re.search(r"\b(badhao|badha|badhaiye|increase|raise|boost|up|zyada|tez|louder)\b", t):
            return "up", None
        if re.search(
            r"\b(kam|ghatao|ghata|decrease|reduce|lower|down|dheere|dheemi|halki|softer|quieter)\b", t
        ):
            return "down", None
    if re.search(
        r"\b(louder|volume up|increase (the )?volume|turn (it |the volume |the sound )?up|"
        r"raise (the )?volume|(awaaz|volume) (badhao|badha|tez|zyada|up)|zyada awaaz)\b",
        t,
    ):
        return "up", None
    if re.search(
        r"\b(quieter|softer|volume down|decrease (the )?volume|lower (the )?volume|"
        r"turn (it |the volume |the sound )?down|reduce (the )?volume|"
        r"(awaaz|volume) (kam|ghatao|dheere|dheemi|down|halki))\b",
        t,
    ):
        return "down", None
    return None, None


def parse_slots(text: str, intent: str | None = None) -> Slots:
    """`text` must already be normalize()d."""
    t = text.strip()
    slots = Slots()

    # absolute position: "12:30", "minute 12", "5 minutes pe jao", "go to 12", start/end/middle/N%/undo
    clock = re.search(r"\b(\d{1,2}(?::\d{2}){1,2})\b", t)
    if clock:
        slots.timestamp_s = _parse_clock(clock.group(1))
    elif intent == "SEEK_ABSOLUTE":
        pct = re.search(rf"\b({_NUM}) percent\b", t)
        if _PREVIOUS.search(t):
            slots.anchor = "previous"
        elif _START.search(t):
            slots.anchor = "start"
            slots.timestamp_s = 0.0
        elif _END.search(t):
            slots.anchor = "end"
        elif pct and 0 <= float(pct.group(1)) <= 100:
            slots.fraction = float(pct.group(1)) / 100
        elif _MIDDLE.search(t):
            slots.fraction = 0.5
        elif m := re.search(
            rf"(?<!\d )\bminutes?\s+({_NUM})\b(?! (?:seconds|minutes|hours))", t
        ):  # "minute 12"
            slots.timestamp_s = float(m.group(1)) * 60
        elif (d := _durations(t)) is not None:
            slots.timestamp_s = d
        elif m := _BARE_MINUTE.search(t):  # lecture timestamps are minutes: "go to 45" → 45:00
            slots.timestamp_s = float(m.group(2)) * 60

    # relative amount
    if intent != "SEEK_ABSOLUTE" or (
        slots.timestamp_s is None and slots.anchor is None and slots.fraction is None
    ):
        slots.duration_s = _durations(t)
        if slots.duration_s is None and (m := _LAST_UNIT.search(t)):  # "replay the last minute"
            slots.duration_s = float(_UNIT_S[m.group(2)])
        if slots.duration_s is None and intent in ("SEEK_BACK", "SEEK_FORWARD") and _BIG.search(t):
            slots.duration_s = BIG_SEEK_S

    # what to do after a seek
    if intent in ("SEEK_BACK", "SEEK_FORWARD", "SEEK_ABSOLUTE"):
        if _THEN_PAUSE.search(t):
            slots.then = "PAUSE"
        elif _THEN_PLAY.search(t) or (slots.anchor == "start" and _START_PLAYS.search(t)):
            slots.then = "PLAY"

    slots.rate, slots.rate_direction = _rate(t, intent)
    slots.volume, slots.volume_level = _volume(t)

    # topic for semantic seek: strip trigger / filler words, keep content words.
    # NB: transliterated English terms get mangled ("gredient disent"); seek_resolver should embed
    # the RAW utterance too — BGE-M3 is cross-lingual — and use this cleaned topic as a second query.
    if intent == "SEMANTIC_SEEK":
        topic = _SEEK_TRIGGERS.sub(" ", f" {t} ")
        topic = re.sub(r"\s+", " ", topic).strip()
        slots.topic = topic or None

    return slots


def missing_slots(intent: str, slots: Slots) -> list[str]:
    if intent == "SPEED":
        return [] if (slots.rate is not None or slots.rate_direction) else ["rate"]
    if intent == "SEEK_ABSOLUTE":
        found = slots.timestamp_s is not None or slots.anchor or slots.fraction is not None
        return [] if found else ["timestamp_s"]
    return [name for name in REQUIRED.get(intent, ()) if getattr(slots, name) is None]
