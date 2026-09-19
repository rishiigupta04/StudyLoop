"""Bilingual template strings for everything that is NOT LLM-generated (roadmap D5).

LLM agents write directly in the target language; this table covers confirmations, errors and
"not yet available" messages so the fast path never needs a translation call.
"""

from __future__ import annotations

from typing import Any

Lang = str  # "en" | "hi"

STRINGS: dict[str, dict[Lang, str]] = {
    "PLAY": {"en": "Playing", "hi": "चला रहे हैं"},
    "PAUSE": {"en": "Paused", "hi": "रोक दिया"},
    "SEEK_BACK": {"en": "Back {seconds}s", "hi": "{seconds} सेकंड पीछे"},
    "SEEK_FORWARD": {"en": "Forward {seconds}s", "hi": "{seconds} सेकंड आगे"},
    "SEEK_ABSOLUTE": {"en": "Jumped to {clock}", "hi": "{clock} पर पहुँच गए"},
    "SEEK_START": {"en": "Back to the start", "hi": "शुरुआत पर पहुँच गए"},
    "RESTART": {"en": "Playing from the start", "hi": "शुरू से चला रहे हैं"},
    "SEEK_END": {"en": "Near the end", "hi": "आख़िर के पास"},
    "SEEK_FRACTION": {"en": "Jumped to {percent}%", "hi": "{percent}% पर पहुँच गए"},
    "SEEK_PREVIOUS": {"en": "Back to where you were", "hi": "वापस वहीं"},
    "THEN_PLAY": {"en": "{msg}, playing", "hi": "{msg}, चला रहे हैं"},
    "THEN_PAUSE": {"en": "{msg}, paused", "hi": "{msg}, रोक दिया"},
    "REPLAY": {"en": "Replaying the last {seconds}s", "hi": "पिछले {seconds} सेकंड फिर से"},
    "SPEED_SET": {"en": "Speed {rate}x", "hi": "स्पीड {rate}x"},
    "SPEED_UP": {"en": "Faster", "hi": "तेज़ कर दिया"},
    "SPEED_DOWN": {"en": "Slower", "hi": "धीमा कर दिया"},
    "VOLUME_mute": {"en": "Muted", "hi": "आवाज़ बंद"},
    "VOLUME_unmute": {"en": "Unmuted", "hi": "आवाज़ चालू"},
    "VOLUME_up": {"en": "Louder", "hi": "आवाज़ बढ़ा दी"},
    "VOLUME_down": {"en": "Quieter", "hi": "आवाज़ कम कर दी"},
    "VOLUME_set": {"en": "Volume {level}%", "hi": "आवाज़ {level}%"},
    "STOP_SPEAKING": {"en": "Okay", "hi": "ठीक है"},
    # not built yet — honest placeholders until their tier lands
    "SOON_SEMANTIC_SEEK": {
        "en": "Jumping to a topic arrives with transcript search (Tier 1b). You can say a time, like 'go to 12:30'.",
        "hi": "Topic पर jump करना transcript search के साथ आएगा। अभी आप समय बोल सकते हैं, जैसे '12:30 पर जाओ'।",
    },
    "SOON_ASK": {
        "en": "Answering questions about the video arrives with transcript Q&A (Tier 1b).",
        "hi": "वीडियो के बारे में सवालों के जवाब transcript Q&A के साथ आएँगे।",
    },
    "SOON_SUMMARIZE": {
        "en": "Summaries arrive with transcript Q&A (Tier 1b).",
        "hi": "Summary transcript Q&A के साथ आएगी।",
    },
    "SOON_TAKE_NOTE": {
        "en": "Voice notes arrive in Tier 1e. For now, use the Notes tab.",
        "hi": "Voice notes जल्द आएँगे। अभी Notes tab इस्तेमाल करें।",
    },
    "NOT_UNDERSTOOD": {
        "en": "Sorry, I didn't catch that. Try 'pause', 'go back 10 seconds' or 'speed 1.5', or say 'help'.",
        "hi": "माफ़ कीजिए, समझ नहीं आया। 'रुको', '10 सेकंड पीछे' या 'स्पीड 1.5' बोलकर देखें, या 'help' बोलें।",
    },
    "HELP": {
        "en": "Hold the tilde key and say things like: pause, play, go back 10 seconds, skip a minute, "
        "go to 12:30, restart, speed 1.5, louder, mute, say that again, or undo.",
        "hi": "टिल्ड की दबाकर बोलें, जैसे: रुको, चलाओ, 10 सेकंड पीछे, एक मिनट आगे, 12:30 पर जाओ, "
        "शुरू से चलाओ, स्पीड 1.5, आवाज़ बढ़ाओ, फिर से दिखाओ, या वापस वहीं जाओ।",
    },
    "MISSING_TIME": {
        "en": "Which time should I jump to? Say something like 'go to 12:30'.",
        "hi": "किस समय पर जाना है? जैसे '12:30 पर जाओ' बोलें।",
    },
}


def t(key: str, lang: Lang = "en", **kw: Any) -> str:
    entry = STRINGS.get(key)
    if not entry:
        return key
    text = entry.get(lang) or entry["en"]
    return text.format(**kw) if kw else text


def fmt_clock(seconds: float) -> str:
    s = int(round(seconds))
    h, rem = divmod(s, 3600)
    m, sec = divmod(rem, 60)
    return f"{h}:{m:02d}:{sec:02d}" if h else f"{m}:{sec:02d}"


def fmt_num(x: float) -> str:
    return str(int(x)) if float(x).is_integer() else f"{x:g}"
