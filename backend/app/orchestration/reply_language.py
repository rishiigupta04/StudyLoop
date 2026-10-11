"""Which language to answer in when the learner leaves the toggle on "Auto": the language they just used.

    English                         → ("en", False)  English answer
    Hindi in Devanagari             → ("hi", False)  Hindi answer (technical terms stay in English)
    Hinglish (romanized Hindi, or   → ("hi", True)   a code-mixed answer: Hindi sentences in Devanagari, English
    Devanagari mixed with English)                   terms and common English words kept in English

Plain rules over the RAW utterance (normalize() would transliterate the Devanagari away), <1 ms, no model. A
short command with nothing to go on ("pause", "12:30", "volume 50") keeps the previous turn's language, then the
STT provider's language hint, then English. Speech-to-text never decides alone: Groq romanizes Hindi speech and
Sarvam's code-mix model writes English terms in Latin, so the words themselves are the better signal.
"""

from __future__ import annotations

import re

Reply = tuple[str, bool]  # (language "en" | "hi", code_mix)

_DEVANAGARI_WORD = re.compile(r"[ऀ-ॿ]+")
_LATIN_WORD = re.compile(r"[a-z]+")

# Romanized Hindi words that are not also common English words. Left out on purpose: to, me, hi, do, the (Hindi
# "were"), us, so, main, par, mat, bus, ho, na, note: each is an everyday English word or too short to trust.
# fmt: off
_HINDI_WORDS = frozenset("""
kya kyaa hai hain haan nahi nahin kaise kaisa kaisi kyun kyon kyu kab kahan kidhar kaun kitna kitne kitni
batao bataiye bataao bata samjhao samjhaiye samjhaao samjha samjhi samjhe samajh mujhe mujhko humein hume
tumhe aapko aap yeh ye woh wo iska iski iske uska uski uske isko usko isme usme inka unka ka ki ke ko se aur
bhi toh sirf kuch sab abhi pehle baad wala wali wale waala waali raha rahi rahe tha thi hota hoti hote hua hui
kar karo kariye karna karta karti kiya diya gaya gayi chahiye sakte sakta sakti matlab thoda thodi zyada jyada
accha acha achha theek thik jao jaao chalo chalao dikhao suno bolo pichhle pichla pichhli pichle agla agle
agli wapas peeche piche aage ruko roko phir fir dobara apna apne apni yahan wahan jab tab lekin magar kyunki
isliye bilkul samjhaya bataya likho likh kijiye dijiye hoga hogi kaha kahaa vala vali yaar
""".split())
# fmt: on

# "explain that in Hindi" / "english mein batao" / "हिंदी में समझाओ": an explicit ask beats detection and the toggle
_ASK_HINDI = re.compile(r"\b(?:in hindi|hindi (?:mein|me|main|mai))\b|हिंदी में|हिन्दी में")
_ASK_ENGLISH = re.compile(r"\b(?:in english|english (?:mein|me|main|mai))\b|अंग्रेज़ी में|अंग्रेजी में|इंग्लिश में")

_HI_SHARE = 0.2  # this share of Hindi words (or two of them) makes a Latin utterance Hinglish
_AMBIGUOUS_MAX_WORDS = 2  # "pause", "volume up", "12:30": too short to tell English from a Hindi speaker


def requested_language(text: str) -> Reply | None:
    """The language the learner explicitly asked for ("explain that in Hindi"), or None. Hindi on request is the
    Hinglish style: technical terms stay in English, which is how a Hindi explanation of a lecture reads best."""
    t = (text or "").lower()
    if _ASK_ENGLISH.search(t):
        return ("en", False)
    if _ASK_HINDI.search(t):
        return ("hi", True)
    return None


def detect_reply_language(text: str, stt_language: str | None = None, previous: Reply | None = None) -> Reply:
    """The reply language for an "Auto" turn. `stt_language` is the STT provider's hint ("hi-IN" / "en-IN" /
    None), `previous` the last turn's resolved reply (the conversation's language so far)."""
    t = (text or "").lower()
    deva = len(_DEVANAGARI_WORD.findall(t))
    latin = _LATIN_WORD.findall(t)
    if deva:
        # Devanagari mostly → Hindi; Devanagari next to as many English words or more → Hinglish
        return ("hi", len(latin) >= max(2, deva))
    hindi = sum(1 for w in latin if w in _HINDI_WORDS)
    if hindi and (hindi >= 2 or hindi / len(latin) >= _HI_SHARE):
        return ("hi", True)
    if len(latin) <= _AMBIGUOUS_MAX_WORDS:
        if previous is not None:
            return previous
        if stt_language and stt_language.lower().startswith("hi"):
            return ("hi", True)
    return ("en", False)
