"""Base utterances: the voice corpus (train-only) and the hand-written bases (split by base)."""

from __future__ import annotations

import hashlib
import re

from common import INTENTS

_DEVANAGARI = re.compile("[ऀ-ॿ]")
_LATIN = re.compile("[A-Za-z]")
# romanized-Hindi function words: enough to tell "chalao" / "peeche karo" from English
_HINGLISH_WORDS = set(
    """
    karo kar karna kariye kijiye do dijiye jao jaiye chalo chalao chala chalu ruko roko rok ruk peeche piche pichhe
    aage aagey hai hain tha thi kya kyun kaise kahan ye yeh wo woh ko ka ki ke mein se pe par aur bhi nahi nahin
    mat bas thoda thodi zara yaar bhai ji na haan achha theek samajh samjhao samjha batao bolo sunao dikhao
    phir fir dobara wapas awaaz awaz dheere tez badhao kam wala wali wale hissa baare usne maine mujhe abhi ab
    jahan wahan kuch kaun kitne liya diya gaya hoon raha rahi lo lijiye rakho rakhna likh likho likhna yaad
    """.split()
)


def detect_style(text: str) -> str:
    if _DEVANAGARI.search(text):
        return "hi"
    words = re.findall(r"[a-z]+", text.lower())
    return "hinglish" if any(w in _HINGLISH_WORDS for w in words) else "en"


def base_id(source: str, text: str) -> str:
    return f"{source}-{hashlib.sha1(text.encode()).hexdigest()[:10]}"


def load_bases() -> list[dict]:
    """Every base utterance with a stable id. `source` = "vc" (backend/tests/voice_corpus.py, which the regex
    classifier was tuned on: train only) or "hw" (ml/bases.py: split by base)."""
    from bases import BASES
    from tests.voice_corpus import GROUPS

    rows: list[dict] = []
    for group, cases in GROUPS.items():
        for text, intent, _action in cases:
            style = {"en": "en", "hinglish": "hinglish", "hindi": "hi"}.get(group) or detect_style(text)
            rows.append(
                {
                    "base_id": base_id("vc", text),
                    "text": text,
                    "intent": intent,
                    "style": style,
                    "source": "vc",
                    "group": group,
                }
            )
    for intent in INTENTS:
        for style, texts in BASES[intent].items():
            for text in texts:
                rows.append(
                    {
                        "base_id": base_id("hw", text),
                        "text": text,
                        "intent": intent,
                        "style": style,
                        "source": "hw",
                        "group": "handwritten",
                    }
                )
    ids = [r["base_id"] for r in rows]
    assert len(ids) == len(set(ids)), "duplicate base text"
    unknown = {r["intent"] for r in rows} - set(INTENTS)
    assert not unknown, unknown
    return rows
