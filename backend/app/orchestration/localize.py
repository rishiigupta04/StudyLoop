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
    # semantic seek + Q&A (Tier 1b)
    "SEEK_TOPIC": {"en": "Jumped to {clock}", "hi": "{clock} पर पहुँच गए"},
    "SEEK_TOPIC_ALT": {
        "en": "Jumped to {clock}. It also comes up at {alt}.",
        "hi": "{clock} पर पहुँच गए। यह {alt} पर भी आता है।",
    },
    "TOPIC_NOT_FOUND": {
        "en": "I couldn't find that topic in this video. Try other words, or say a time like 'go to 12:30'.",
        "hi": "यह topic इस वीडियो में नहीं मिला। दूसरे शब्दों में बोलें, या समय बोलें, जैसे '12:30 पर जाओ'।",
    },
    "NOT_COVERED_YET": {
        "en": "The lecture hasn't covered that yet. Keep watching, or say 'skip to' the topic to jump ahead.",
        "hi": "Lecture में यह अभी तक नहीं आया है। देखते रहिए, या 'उस topic पर जाओ' बोलकर आगे जाइए।",
    },
    "NOTHING_WATCHED": {
        "en": "There's nothing to summarize yet. Watch a bit first.",
        "hi": "अभी summary के लिए कुछ नहीं है। पहले थोड़ा देख लीजिए।",
    },
    "LLM_NOT_CONFIGURED": {
        "en": "Q&A isn't set up on this server yet. Playback commands and topic jumps still work.",
        "hi": "इस server पर अभी Q&A set नहीं है। Playback commands और topic jump चलते रहेंगे।",
    },
    "LLM_NOT_CONFIGURED_AT": {
        "en": "Q&A isn't set up on this server yet, but the most relevant part you've watched is at {clock}.",
        "hi": "इस server पर अभी Q&A set नहीं है, पर आपके देखे हिस्से में सबसे relevant हिस्सा {clock} पर है।",
    },
    "LLM_UNAVAILABLE": {
        "en": "The answer service is busy right now. Please ask again in a moment.",
        "hi": "Answer service अभी busy है। थोड़ी देर में फिर पूछिए।",
    },
    "LLM_UNAVAILABLE_AT": {
        "en": "The answer service is busy right now, but the most relevant part you've watched is at {clock}.",
        "hi": "Answer service अभी busy है, पर आपके देखे हिस्से में सबसे relevant हिस्सा {clock} पर है।",
    },
    # voice notes (Tier 1e): the ack; the summary follows as note.updated
    "NOTE_SAVED": {"en": "Noted at {clock}.", "hi": "{clock} पर note कर लिया।"},
    "NOTE_BOOKMARKED": {"en": "Bookmarked {clock}.", "hi": "{clock} bookmark कर लिया।"},
    # transcript-dependent intents when the transcript isn't usable (Tier 1a) — player commands still work
    "TRANSCRIPT_PREPARING": {
        "en": "I'm still preparing this video's transcript. Playback commands work meanwhile.",
        "hi": "इस वीडियो का transcript अभी तैयार हो रहा है। तब तक playback commands चलते रहेंगे।",
    },
    "NO_TRANSCRIPT_unavailable": {
        "en": "This video is private, live, removed or restricted, so I can't read its transcript. "
        "Playback commands still work.",
        "hi": "यह वीडियो private, live, हटाया गया या restricted है, इसलिए transcript नहीं मिल सका। "
        "Playback commands चलते रहेंगे।",
    },
    "NO_TRANSCRIPT_no_speech": {
        "en": "I found no speech in this video, so there's nothing to search. Playback commands still work.",
        "hi": "इस वीडियो में बोली गई बात नहीं मिली, इसलिए search नहीं हो सकता। Playback commands चलते रहेंगे।",
    },
    "NO_TRANSCRIPT_invalid_video": {
        "en": "That isn't a YouTube video I can read. Playback commands still work.",
        "hi": "यह ऐसा YouTube वीडियो नहीं है जिसे मैं पढ़ सकूँ। Playback commands चलते रहेंगे।",
    },
    "NO_TRANSCRIPT_failed": {
        "en": "I couldn't load this video's transcript. Try Retry in the Transcript tab; playback commands still work.",
        "hi": "इस वीडियो का transcript load नहीं हो सका। Transcript tab में Retry दबाएँ; playback commands चलते रहेंगे।",
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
