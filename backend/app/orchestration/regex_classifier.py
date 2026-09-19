"""Keyword/regex intent classifier — the Tier 0 stand-in behind CLASSIFIER=regex.

Same interface the fine-tuned DistilBERT/ONNX model will implement in Tier 1c:
    classify(normalized_text) -> (Intent, confidence)
It also stays as the rollback (roadmap Tier 1c) and as the regex BASELINE in the CO4 comparison table.
Input must already be `studyloop_nlp.normalize()`d (lowercase, Latin script, digits for numbers,
contractions expanded: "don't" → "do not").

Stages, in order (precision first: a wrong jump mid-lecture is worse than "didn't catch that"):
  1. whole-utterance intents: dismissals ("thanks", "bas"), help, "don't stop", negated commands
  2. polite frames are unwrapped and their inner command classified ("can you pause")
  3. questions → ASK, except replay idioms ("what did he say"), summary asks and "where…" (seek)
  4. ordered command rules (more specific first)
Scenario coverage lives in tests/voice_corpus.py.
"""

from __future__ import annotations

import re

from app.orchestration.intents import Intent

MATCH_CONFIDENCE = 0.95
NO_MATCH_CONFIDENCE = 0.30

_DUR = r"\d+(?:\.\d+)?\s*(?:seconds|minutes|hours)"
_SEEK_VERB = r"(?:go|jump|skip|seek|move|take me|head|navigate)"

# fmt: off
# ---------------------------------------------------------------- stage 0: politeness / fillers around the command
_LEAD = re.compile(
    r"^(?:(?:hey|hi|ok|okay|so|now|please|kindly|kripya|achha|haan|arre|arey|oye|yaar|bhai|zara|just|ji|sir|"
    r"ma am|studyloop|study loop|copilot|i want to|i wanna|i would like to|i need to|let me|we need to)\s+)+"
)
_TRAIL = re.compile(
    r"(?:\s+(?:please|now|right now|yaar|ji|na|bhai|abhi|zara|for me|thanks|thank you|quickly|immediately|"
    r"for a (?:moment|second|sec|bit|while|minute)))+$"
)

# ---------------------------------------------------------------- stage 1: whole-utterance intents
_DISMISS_ONE = (
    r"stop (?:talking|speaking|reading|answering|explaining|the voice|the answer)|no need|(?:koi )?zaroorat nahi|"
    r"be quiet|quiet|shh+|shut up|enough|that is enough|cancel|never ?mind|"
    r"forget (?:it|about it)|leave it|no thanks|no thank you|thanks|thank you(?: so much| very much)?|thankyou|"
    r"ok|okay|ok(?:ay)? thanks|got it|ok(?:ay)? got it|alright|all right|fine|cool|done|great|perfect|"
    r"that is (?:it|all|fine)|understood|i understand|i understood|i got it|makes sense|sounds good|"
    r"bas(?: karo| bas| ho gaya| rahne do)?|chup(?: karo| raho| ho jao| ho jaiye| rahiye)?|rahne do|chhodo|"
    r"chhod do|koi baat nahi|kuch nahi|theek hai(?: bas)?|achha(?: theek hai)?|samajh (?:gaya|gayi|gaye|aa gaya|aa gayi)|"
    r"samjha|shukriya|dhanyavaad|ho gaya"
)
_DISMISS = re.compile(rf"(?:{_DISMISS_ONE})(?: (?:{_DISMISS_ONE}))*")  # "theek hai samajh gaya"
_HELP = re.compile(
    r"help|help me|what can (?:i|you) (?:say|do)|what (?:commands|can i ask)|(?:list|show)(?: me)?(?: the)? commands|"
    r"commands|voice commands|kya (?:kya )?bol sakt[aei] (?:hoon|hu|hain|ho)|madad|madad karo|help karo"
)
_KEEP_PLAYING = re.compile(
    r"\b(?:do not|dont|never) (?:stop|pause)\b|\bmat (?:roko|ruko|rok|band karo|pause karo)\b|"
    r"\b(?:roko|ruko|rok|pause|band) mat\b|\bkeep (?:playing|going)\b"
)
_NEGATED = re.compile(
    r"\b(?:do not|dont|never)\b(?:\s+\w+){0,2}?\s+(?:play|skip|go|rewind|mute|unmute|replay|repeat|forward|"
    r"change|speed|seek|jump|move|restart)\b|"
    r"\bmat\b(?:\s+\w+)?\s+(?:skip|chalao|mute|badhao|jao|karo)\b|\b(?:skip|chalao|mute|jao|badhao) mat\b"
)
_POLITE_EN = re.compile(r"^(?:(?:can|could|would|will) (?:you|u|we|i)|would you mind)(?: please| kindly| just)? (?P<rest>.+)$")
_POLITE_HI = re.compile(r"^kya (?:aap|ap|tum)(?: please| zara)? (?P<rest>.+?) (?:sakte|sakti|sakta) (?:ho|hain|hai|hoon|hu)$")

# ---------------------------------------------------------------- stage 3: questions
_REPLAY_Q = re.compile(
    r"^(?:what|sorry|sorry what|huh|pardon|excuse me|what was that|come again)$|"
    r"\bwhat did (?:he|she|they|you|sir|the (?:professor|teacher|speaker)) (?:just )?say\b|"
    r"\bkya (?:bola|bole|kaha|kahaa|bol rah[aei]|keh rah[aei])\b"
)
_SUMMARY = re.compile(
    r"\b(?:summar\w*|recap|tldr|tl dr|saransh|sankshep|sum (?:it )?up|key points|main points|mukhy baaten|"
    r"what did i miss|what (?:have|has) (?:we|been) (?:covered|done|learned|learnt)|covered so far|in short|"
    r"short mein|ab tak (?:kya|kya kya|ka)|summary)\b"
)
_SUMMARY_Q = re.compile(
    r"\bwhat did i miss\b|\bwhat (?:have|has) (?:we|been) (?:covered|done|learned|learnt)\b|\bab tak (?:kya|kya kya)\b"
)
_WH = re.compile(  # "did not catch that" is a statement, not a question
    r"^(?:what|why|how|when|which|who|whom|whose|is|are|am|was|were|does|did|has|have|had|should|shall|may|might)\b"
    r"(?! not\b)"
)
_HI_Q = re.compile(
    r"\b(?:kyun|kaise|kab|kaun|kitna|kitne|kitni)\b|\bkya (?:hai|hota|hoti|hote|tha|thi|matlab|mean)\b|"
    r"\b(?:ka|ki|ke) matlab\b|\bmatlab kya\b|"
    r"\bkya\b.*\b(?:hai|tha|thi|the|hota|hoti|hote)$"  # "shuru mein kya bataya tha" asks, doesn't seek
)
_WHERE = re.compile(r"^where\b|\b(?:kahan|kidhar)\b")
_WHERE_STATUS = re.compile(r"^where (?:am i|are we|was i)\b")

# ---------------------------------------------------------------- stage 4: commands (order matters)
_NOTE = re.compile(
    r"\b(?:note|notes|likh|likho|likh lo|likhiye|write (?:this|that|it) down|write down|jot|bookmark|"
    r"save (?:this|that|it)|remember (?:this|that)|yaad rakh\w*|mark (?:this|that|it)|mark karo)\b"
)
_ASK = re.compile(
    r"\b(?:explain\w*|samjhao|samjha do|samjhaiye|elaborate|define|describe|clarify|tell me (?:about|more|what|why|how)|"
    r"give (?:me )?(?:an )?example|example (?:do|dijiye|batao|dikhao)|udaharan|meaning of|difference between|"
    r"matlab (?:batao|samjhao)|samajh nahi (?:aaya|aayi|aa raha|aa rahi)|help me understand|break (?:it|this|that) down|"
    r"(?:do|did) not (?:understand|get it|get this|get that)|confused|not clear|clear nahi)\b"
)
_WHERE_EXPLAINS = re.compile(rf"\b(?:where|jahan)\b.*\bexplain\w*|^{_SEEK_VERB}\b.*\bexplanation\b")
_VOLUME = re.compile(
    r"\b(?:mute|unmute|volume|awaaz|louder|quieter|softer|loud|silent|silence|no sound)\b|"
    r"\bsound (?:on|off|back)\b|\bturn (?:it |the volume |the sound )?(?:up|down)\b|\bturn (?:on|off) the sound\b|"
    r"\b(?:too|very|so) (?:quiet|soft|low)\b|\b(?:lower|raise|reduce|increase|decrease) (?:the )?(?:sound|audio)\b|"
    r"\bcan not hear\b|\bsunai nahi (?:de|deta)\b"  # "could not hear" is past → REPLAY
)
_SPEED = re.compile(
    r"\b(?:speed|faster|slower|slow|tez|dheere|dheema|dheeme|fastest|slowest|playback rate|\d+(?:\.\d+)?x|"
    r"rate (?:to )?\d+)\b|\bfast(?! forward)\b|\bjaldi (?:chalao|karo|kar do|bolo)\b|^normal(?: karo| kar do)?$"
)
_SKIP_THIS = re.compile(r"^skip (?:this|the current)(?: part| section| bit| portion| one)?$")
_ABSOLUTE = re.compile(
    r"\b\d{1,2}(?::\d{2}){1,2}\b|"                                                     # 12:30
    r"\b(?:undo|where (?:i|we) (?:was|were|left off)|previous position|wapas wahin|wahin wapas|"
    r"jahan (?:tha|the|thi) wahan|pehle wali jagah|pichhli jagah)\b|"                  # undo the last jump
    r"\b(?:restart|start over|from the top|from scratch|shuru se|shuruaat se|start se|zero se)\b|"
    r"\b(?:dobara|phir se) shuru\b|\bstart (?:\w+ ){1,2}over\b|"                      # "start the video over"
    r"\b(?:go|jump|skip|take me|back|move|head|start|play|rewind)\b.*\b(?:beginning|the start|starting)\b|"
    rf"\b{_SEEK_VERB}(?: straight| right)? to (?:the )?(?:very )?end\b|\bend (?:pe|par|mein|tak)\b|"
    r"\baakhir (?:mein|pe|par)\b|\blast (?:mein|pe|par)\b|\b\d+ (?:seconds|minutes|hours) mark\b|"
    r"\baakhri (?:part|hissa|hisse|bhaag)\b|\b(?:shuru|shuruaat|beginning) (?:mein|pe|par)\b|"
    rf"\b{_SEEK_VERB}\b.*\b(?:\d+ percent|middle|halfway|half way|midpoint)\b|\bhalfway\b|"
    r"\b(?:\d+ percent|beech|aadhe video|middle)\b.*\b(?:pe|par|mein|tak)\b.*\b(?:jao|chalo|le chalo)\b|"
    rf"\b(?:{_SEEK_VERB}|start|play|resume|chalo|jao)\b.*(?<!\d )\bminutes? \d+\b(?! (?:seconds|minutes|hours))|"  # minute 12
    rf"\b(?:{_SEEK_VERB}|start|play|resume)(?: back| straight| right| directly)? (?:to|at|from) \d|"
    rf"\b{_DUR}(?: \d+ (?:seconds|minutes))? (?:pe|par|tak|se)\b|\b\d+ percent (?:pe|par)\b"
)
_SEMANTIC = re.compile(
    r"\b(?:skip|jump|go|take me|le chalo|le jao|chalo|jao|move|dikhao|show me)\b.*"
    r"\b(?:part|section|portion|segment|topic|where|jahan|about|baare|wala|wali|wale|hissa|hisse|explain\w*)\b|"
    # "<topic> wala part dikhao" — but "ye wala hissa phir se" is THIS part (replay), not a topic
    r"(?<!\bye )(?<!\byeh )(?<!\bis )(?<!\bwo )(?<!\bwoh )(?<!\bisi )"
    r"\b(?:wala|wali|wale)\s+(?:part|section|hissa|hisse|portion|topic|bhaag)\b|"
    r"\bjahan\b.*\b(?:jao|chalo|le chalo|dikhao)\b|"                                # "jahan X samjhaya hai wahan jao"
    rf"^{_SEEK_VERB}(?: back| straight| directly| right)? to (?:the )?(?!\d)\w|"      # "jump to backpropagation"
    r"\b(?:find|search|look for|locate|dhundo|dhoondo|khojo)\b|"
    r"\bskip the (?:intro|introduction|ads?|sponsor\w*|recap|review|boring part|theory|proof|derivation)\b|"
    r"^(?!.*\d)(?!.*\b(?:shuru|end|beech|aakhir|wahin|aadhe|peeche|aage)\b).+ (?:pe|par) (?:jao|chalo|le chalo|le jao)$"
)
_REPLAY = re.compile(
    r"\b(?:again|repeat|replay|phir se|dobara|once more|one more time|ek baar (?:aur|phir)|ek aur baar|"
    r"come again|pardon|rewind and play|go back and play|missed (?:that|it)|i missed|"
    r"(?:did|could) not (?:hear|catch)|sunai nahi (?:diya|di|aaya|aayi))\b"
)
_PLAY_SPECIAL = re.compile(
    r"^(?:i am|we are|main|hum) (?:back|aa gaya|aa gayi|aa gaye|wapas aa gaya)$|"
    r"^(?:go ahead|start again|start it again|let us (?:go|continue|start|resume)|aage (?:chalao|chalaiye|chalne do))$"
)
_BACK = re.compile(
    r"\b(?:go back|back up|jump back|skip back|move back|step back|rewind|reverse|backwards?|peeche|"
    r"wapas (?:jao|jaiye|le jao|le chalo|karo)|back (?:by )?\d+|back karo|way back|take (?:me|it) back)\b|"
    rf"\b{_DUR} (?:back|pehle)\b|^back$|^wapas$"
)
_FORWARD = re.compile(r"\b(?:forward|ahead|aage|skip|next \d+|agle \d+)\b")
_PAUSE = re.compile(
    r"\b(?:pause|pausing|stop|hold on|hold it|hold up|hang on|wait|freeze|halt|ruko|ruk|rukiye|rukein|roko|rok|rokiye|"
    r"rokein|rok do|thehro|thehriye|band karo|band kar do|take a break|break (?:lo|le|lete))\b|"
    r"^(?:1|one|ek) (?:seconds|minutes)$|^give me 1 (?:seconds|minutes)$"
)
_PLAY = re.compile(
    r"\b(?:play|playing|resume|continue|chalao|chala|chalaiye|chalu|chalne do|start|shuru|go on|carry on|"
    r"unpause|jaari rakho|jaari rakhiye|keep it (?:going|playing|running)|let it (?:play|run))\b"
)
# fmt: on

_COMMANDS: list[tuple[Intent, re.Pattern[str]]] = [
    (Intent.TAKE_NOTE, _NOTE),
    (Intent.SUMMARIZE, _SUMMARY),
    (Intent.SEMANTIC_SEEK, _WHERE_EXPLAINS),  # "go to where he explains X" is a seek, not a question
    (Intent.ASK, _ASK),  # before REPLAY: "phir se samjhao" is explain-again, not replay
    (Intent.VOLUME, _VOLUME),
    (Intent.SPEED, _SPEED),
    (Intent.SEEK_FORWARD, _SKIP_THIS),  # before SEMANTIC_SEEK: "skip this part" has no topic
    (Intent.SEEK_ABSOLUTE, _ABSOLUTE),
    (Intent.SEMANTIC_SEEK, _SEMANTIC),
    (Intent.PLAY, _PLAY_SPECIAL),  # "I'm back", "go ahead", "start again" — before BACK/FORWARD/REPLAY
    (Intent.REPLAY, _REPLAY),
    (Intent.SEEK_BACK, _BACK),
    (Intent.SEEK_FORWARD, _FORWARD),
    (Intent.PAUSE, _PAUSE),
    (Intent.PLAY, _PLAY),
]


def _core(t: str) -> str:
    """Strip politeness / fillers around the command: "okay please pause the video now" → "pause the video"."""
    core = _TRAIL.sub("", _LEAD.sub("", t)).strip()
    return core or t


def _command(t: str) -> Intent | None:
    for intent, pattern in _COMMANDS:
        if pattern.search(t):
            return intent
    return None


def _question(t: str) -> Intent | None:
    if _REPLAY_Q.search(t):
        return Intent.REPLAY
    if _SUMMARY_Q.search(t):
        return Intent.SUMMARIZE
    if _WHERE.search(t) and not _WHERE_STATUS.search(t):
        return Intent.SEMANTIC_SEEK  # "where does he talk about X", "X kahan explain kiya hai"
    if _WH.search(t) or _HI_Q.search(t) or "?" in t:
        return Intent.ASK
    return None


def is_help(text: str) -> bool:
    """ "help", "what can I say", "kya bol sakta hoon" — answered with the command list."""
    return bool(text.strip()) and bool(_HELP.fullmatch(_core(text.strip())))


def classify(text: str) -> tuple[Intent, float]:
    t = (text or "").strip()
    if not t:
        return Intent.OOS, 0.0
    core = _core(t)
    if _DISMISS.fullmatch(core):
        return Intent.STOP_SPEAKING, MATCH_CONFIDENCE
    if _HELP.fullmatch(core):
        return Intent.OOS, NO_MATCH_CONFIDENCE  # llm_router answers with the command list
    if m := (_POLITE_EN.match(core) or _POLITE_HI.match(core)):  # "can you pause", "kya aap rok sakte hai"
        if _DISMISS.fullmatch(m["rest"]):  # "will you stop talking"
            return Intent.STOP_SPEAKING, MATCH_CONFIDENCE
        return (_command(m["rest"]) or Intent.ASK), MATCH_CONFIDENCE
    if q := _question(core):  # before command cues: "why does he keep going back?" is a question
        return q, MATCH_CONFIDENCE
    if _KEEP_PLAYING.search(core):
        return Intent.PLAY, MATCH_CONFIDENCE
    if _NEGATED.search(core):
        return Intent.OOS, NO_MATCH_CONFIDENCE
    intent = _command(core)
    return (intent, MATCH_CONFIDENCE) if intent else (Intent.OOS, NO_MATCH_CONFIDENCE)
