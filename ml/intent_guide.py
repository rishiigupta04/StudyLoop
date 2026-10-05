"""The labeling guide as prompt text: shared by the paraphrase generator and the blind judge.

Mirrors the rules at the top of backend/tests/voice_corpus.py and ml/bases.py; if those change, change this.
"""

from __future__ import annotations

DEFINITIONS: dict[str, str] = {
    "PLAY": "resume or start playing the lecture video (also 'don't stop' / 'mat roko')",
    "PAUSE": "pause the video (a bare 'stop', 'wait', 'ruko', 'hold on')",
    "SEEK_BACK": "jump backwards by a relative amount ('go back 10 seconds', 'thoda peeche'); no topic named",
    "SEEK_FORWARD": "jump forwards by a relative amount ('skip 30 seconds', 'aage karo', 'skip this part'); no topic named",
    "SEEK_ABSOLUTE": "jump to a position: a timestamp ('go to 12:30'), the start/restart, the end, the middle, N percent, "
    "or undo the last jump ('back to where I was')",
    "REPLAY": "hear the last bit again: 'say that again', 'what did he say', 'I didn't catch/hear that', 'I missed that', "
    "'replay the last 30 seconds' (no topic named)",
    "SPEED": "change the playback rate: faster, slower, 1.5x, normal speed; complaints 'too fast' mean slower",
    "VOLUME": "change loudness: louder, quieter, mute, unmute, set to N; 'I can't hear' means louder, 'too loud' quieter",
    "SEMANTIC_SEEK": "jump to the part of the lecture about a named topic ('take me to where he explains recursion', "
    "'binary search wala part', 'skip the intro', 'I missed the bit where he defined a peak', 'where does he talk about X')",
    "ASK": "a question about the lecture's content or asking for an explanation ('why is X', 'I didn't understand', "
    "'explain X', 'what did he say about X', 'the professor's name was what')",
    "SUMMARIZE": "a summary / recap of what has been covered ('summarize so far', 'what did I miss', 'what is this lecture about')",
    "TAKE_NOTE": "save a note or bookmark, optionally with its content ('note that merge sort is stable', 'bookmark this')",
    "STOP_SPEAKING": "stop the assistant's spoken answer, or an acknowledgement that ends the exchange "
    "('stop talking', 'enough', 'thanks, got it', 'theek hai', 'bas')",
    "OOS": "not a command for the video app and not a question about the lecture: greetings, small talk, off-topic "
    "questions (weather, time, food), talk aimed at someone else in the room, muttering, half sentences, false starts, "
    "asking what the app can do ('help'), and negated commands ('don't skip', 'speed mat badlo')",
}

RULES = """\
- "I didn't hear / catch that" is REPLAY; "I didn't understand / get it" is ASK.
- "I can't hear" (ongoing) is VOLUME up; "sunai nahi diya" (just now) is REPLAY.
- Complaints invert the adjective: "it's too fast" is SPEED down; "too loud" is VOLUME down.
- "dheere karo" alone is SPEED down; "awaaz dheere karo" is VOLUME down.
- Undo / "go back to where I was", restart, go to the end / middle / N% are SEEK_ABSOLUTE.
- A question that merely contains command words ("why did he go back?", "what is the volume of a sphere") is ASK.
- "What did he say about X" asks about X: ASK. "What did he just say" (no topic): REPLAY.
- A topic named means SEMANTIC_SEEK ("I missed the bit where he defined X"); no topic means REPLAY ("I missed that").
- A bare "stop" is PAUSE; "stop talking" / "stop explaining" is STOP_SPEAKING.
- Acknowledgements that end an exchange ("thanks", "got it", "okay", "theek hai", "samajh gaya") are STOP_SPEAKING.
- "Don't stop" / "mat roko" is PLAY; any other negated command ("don't skip", "don't mute") is OOS.
- "help" / "what can I say" / "what can you do" is OOS."""

# which intents each one is most often confused with (data plan §4) — the generator is told not to drift into them
NEIGHBOURS: dict[str, list[str]] = {
    "PLAY": ["SEEK_ABSOLUTE", "REPLAY", "OOS"],
    "PAUSE": ["STOP_SPEAKING", "OOS"],
    "SEEK_BACK": ["REPLAY", "SEEK_ABSOLUTE", "SEMANTIC_SEEK"],
    "SEEK_FORWARD": ["SEEK_ABSOLUTE", "SEMANTIC_SEEK"],
    "SEEK_ABSOLUTE": ["SEEK_FORWARD", "SEEK_BACK", "SEMANTIC_SEEK"],
    "REPLAY": ["ASK", "SEEK_BACK", "SEMANTIC_SEEK"],
    "SPEED": ["VOLUME"],
    "VOLUME": ["SPEED", "REPLAY"],
    "SEMANTIC_SEEK": ["ASK", "REPLAY", "SEEK_FORWARD"],
    "ASK": ["SEMANTIC_SEEK", "SUMMARIZE", "REPLAY", "TAKE_NOTE"],
    "SUMMARIZE": ["ASK"],
    "TAKE_NOTE": ["ASK"],
    "STOP_SPEAKING": ["PAUSE", "OOS"],
    "OOS": ["ASK", "STOP_SPEAKING", "PAUSE"],
}

# phrasings that belong to a neighbour: the generator is told to stay clear of them (seen in the first test batches)
PITFALLS: dict[str, str] = {
    "PLAY": "'phir se / dobara / again chalao' means replay (REPLAY); 'shuru se / from the start / restart' is "
    "SEEK_ABSOLUTE; 'aage badhao / aage karo' is SEEK_FORWARD. Say resume/continue/chalu/chalne do instead.",
    "PAUSE": "'stop talking / bolna band karo / chup' is STOP_SPEAKING; a bare 'bas' is STOP_SPEAKING.",
    "SEEK_BACK": "'again / phir se / dobara / repeat' makes it REPLAY; naming a topic makes it SEMANTIC_SEEK; "
    "'back to where I was' is SEEK_ABSOLUTE.",
    "SEEK_FORWARD": "a clock time or 'N minute pe/par' is SEEK_ABSOLUTE; naming a topic makes it SEMANTIC_SEEK.",
    "SEEK_ABSOLUTE": "'N minute aage / peeche' or 'skip N minutes' is relative (SEEK_FORWARD / SEEK_BACK).",
    "REPLAY": "'samajh nahi aaya / didn't understand / explain again' is ASK; naming what it was about ('what he "
    "said about X', 'the part where he defined X') is ASK or SEMANTIC_SEEK; 'go back N seconds' with no "
    "'again' is SEEK_BACK.",
    "SPEED": "anything about awaaz / sound / loud is VOLUME.",
    "VOLUME": "a bare 'dheere karo / slow' is SPEED; 'sunai nahi diya' (just now) is REPLAY.",
    "SEMANTIC_SEEK": "it must name the topic or section to jump to; 'X kya hai / what is X / explain X' is ASK.",
    "ASK": "'le chalo / go to / take me to X' is SEMANTIC_SEEK; 'summary / recap' is SUMMARIZE; 'say that again' "
    "is REPLAY; 'note this' is TAKE_NOTE.",
    "SUMMARIZE": "a question about one specific concept is ASK.",
    "TAKE_NOTE": "a question ('is it important to note...?') is ASK.",
    "STOP_SPEAKING": "'pause / ruko / stop the video / roko' is PAUSE.",
    "OOS": "any real player command or any question about the lecture content is NOT OOS.",
}

STYLES = {
    "en": "English as an Indian student speaks it (fillers like 'okay so', 'uh', 'like' are fine).",
    "hinglish": "Hindi or Hindi-English mix written in Latin letters, the way Whisper romanizes Hindi speech "
    "('thoda peeche karo', 'video ko pause kar do'); numbers as digits or romanized Hindi words (das, tees).",
    "hi": "Hindi in Devanagari the way Sarvam's code-mix speech-to-text writes it: Hindi words in Devanagari, English "
    "words the student says in English (video, pause, speed, volume, skip, note, summary, topic names such as "
    "binary search) in Latin letters, numbers as digits. Examples: 'video को 10 seconds पीछे करो', "
    "'जहाँ उसने binary search समझाया वहाँ ले चलो'.",
    "hi_pure": "Everything in Devanagari, English loanwords spelled in Devanagari (वीडियो, पॉज़, स्पीड, बाइनरी सर्च), "
    "numbers as Hindi words (दस, तीस) or digits.",
}


def taxonomy_block() -> str:
    return "\n".join(f"- {k}: {v}" for k, v in DEFINITIONS.items())
