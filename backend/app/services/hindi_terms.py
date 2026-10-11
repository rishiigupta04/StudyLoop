"""English words the LLM spelled in Devanagari, back in English letters: "इस लेक्चर में एल्गोरिद्म" → "इस lecture में
algorithm". Hindi answers keep Hindi sentences but English-only vocabulary (technical terms, lecture words) reads
better, and is what students say, in English. The prompt asks for this; models still slip, so this is the net.

A fixed dictionary of transliterations seen in lecture answers, matched as whole Devanagari words (plus a plural
"-्स" / "-ों"). Only words that are English loanwords with no everyday Hindi meaning are listed: "अरे" (hey), "रो"
(cry), "वेट" (wait/weight), "क्यू" are left out on purpose. Pure, <1 ms per answer.
"""

from __future__ import annotations

import re

# fmt: off
_WORDS: dict[str, tuple[str, ...]] = {
    # the lecture itself
    "lecture": ("लेक्चर",), "professor": ("प्रोफेसर", "प्रोफ़ेसर"), "course": ("कोर्स",), "video": ("वीडियो",),
    "slide": ("स्लाइड",), "section": ("सेक्शन",), "chapter": ("चैप्टर",), "topic": ("टॉपिक", "टोपिक"),
    "concept": ("कॉन्सेप्ट", "कांसेप्ट"), "theory": ("थ्योरी",), "example": ("एग्जांपल", "एग्ज़ाम्पल", "एग्जाम्पल", "एक्ज़ाम्पल"),
    "definition": ("डेफिनिशन", "डेफ़िनिशन"), "logistics": ("लॉजिस्टिक्स",), "syllabus": ("सिलेबस",),
    "assignment": ("असाइनमेंट",), "exam": ("एग्जाम", "एग्ज़ाम"), "question": ("क्वेश्चन",), "answer": ("आंसर",),
    "proof": ("प्रूफ", "प्रूफ़"), "formula": ("फॉर्मूला", "फ़ॉर्मूला", "फार्मूला"), "equation": ("इक्वेशन",),
    "notation": ("नोटेशन",), "condition": ("कंडीशन",), "step": ("स्टेप",), "case": ("केस",),
    "simple": ("सिंपल",), "basically": ("बेसिकली",), "actually": ("एक्चुअली",),
    # algorithms / CS
    "algorithm": ("एल्गोरिद्म", "एल्गोरिथम", "एल्गोरिथ्म", "अल्गोरिदम", "एल्गोरिदम", "अल्गोरिथम", "एल्गोरिथ्मस"),
    "algorithmic": ("एल्गोरिदमिक", "एल्गोरिद्मिक", "एल्गोरिथमिक"),
    "array": ("एरे", "ऐरे"), "element": ("एलिमेंट", "एलीमेंट"), "index": ("इंडेक्स",), "problem": ("प्रॉब्लम", "प्रोब्लम"),
    "complexity": ("कॉम्प्लेक्सिटी", "कॉम्पलेक्सिटी", "कम्प्लेक्सिटी", "कॉम्प्लेक्सिटि"),
    "input": ("इनपुट",), "output": ("आउटपुट",), "function": ("फंक्शन", "फ़ंक्शन"), "variable": ("वेरिएबल", "वैरिएबल"),
    "data": ("डेटा", "डाटा"), "dataset": ("डेटासेट",), "model": ("मॉडल",), "graph": ("ग्राफ", "ग्राफ़"), "node": ("नोड",),
    "loop": ("लूप",), "code": ("कोड",), "program": ("प्रोग्राम",), "programming": ("प्रोग्रामिंग",),
    "search": ("सर्च",), "binary": ("बाइनरी",), "matrix": ("मैट्रिक्स",), "recursion": ("रिकर्शन",),
    "recursive": ("रिकर्सिव",), "divide": ("डिवाइड",), "conquer": ("कॉन्कर", "कॉन्क्वर", "कॉन्क़र"), "peak": ("पीक",),
    "list": ("लिस्ट",), "sort": ("सॉर्ट",), "sorting": ("सॉर्टिंग",), "tree": ("ट्री",), "pointer": ("पॉइंटर",),
    "worst": ("वर्स्ट",), "best": ("बेस्ट",), "average": ("एवरेज",), "analysis": ("एनालिसिस",),
    "asymptotic": ("एसिम्प्टोटिक", "असिम्प्टोटिक", "एसिम्टोटिक"), "linear": ("लीनियर", "लिनियर"),
    "logarithmic": ("लॉगरिदमिक",), "efficient": ("एफिशिएंट",), "efficiency": ("एफिशिएंसी",),
    "scalability": ("स्केलेबिलिटी",), "operation": ("ऑपरेशन",), "memory": ("मेमोरी",), "hash": ("हैश",),
    "table": ("टेबल",), "stack": ("स्टैक",), "string": ("स्ट्रिंग",), "integer": ("इंटीजर",), "column": ("कॉलम",),
    "dimension": ("डायमेंशन",), "dimensional": ("डायमेंशनल",), "neighbor": ("नेबर",),
    "implementation": ("इम्प्लीमेंटेशन", "इंप्लीमेंटेशन"), "implement": ("इम्प्लीमेंट", "इंप्लीमेंट"),
    "structure": ("स्ट्रक्चर",), "module": ("मॉड्यूल", "मोड्यूल"), "finding": ("फाइंडिंग", "फ़ाइंडिंग"),
    "approach": ("अप्रोच", "एप्रोच"), "method": ("मेथड",), "solution": ("सॉल्यूशन", "सोल्यूशन"),
    "performance": ("परफॉर्मेंस", "परफ़ॉर्मेंस"), "result": ("रिजल्ट", "रिज़ल्ट"), "design": ("डिजाइन", "डिज़ाइन"),
    "recurrence": ("रिकरेंस",), "runtime": ("रनटाइम",), "traverse": ("ट्रैवर्स",),
    "computer": ("कंप्यूटर", "कम्प्यूटर"), "science": ("साइंस",), "software": ("सॉफ्टवेयर", "सॉफ़्टवेयर"),
    "hardware": ("हार्डवेयर",), "Python": ("पायथन",),
    # ML / maths
    "machine": ("मशीन",), "learning": ("लर्निंग",), "regression": ("रिग्रेशन",), "boosting": ("बूस्टिंग",),
    "gradient": ("ग्रेडिएंट", "ग्रेडियंट"), "descent": ("डिसेंट",), "loss": ("लॉस",), "feature": ("फीचर", "फ़ीचर"),
    "training": ("ट्रेनिंग",), "prediction": ("प्रेडिक्शन",), "error": ("एरर",), "network": ("नेटवर्क",),
    "layer": ("लेयर",), "neural": ("न्यूरल",), "vector": ("वेक्टर",), "probability": ("प्रोबेबिलिटी", "प्रॉबेबिलिटी"),
    "statistics": ("स्टैटिस्टिक्स",), "derivative": ("डेरिवेटिव",), "integral": ("इंटीग्रल",),
}
# fmt: on

_DEVA = "ऀ-ॿ"
_NUKTA = "़"


def _key(word: str) -> str:
    return word.replace(_NUKTA, "")  # फ़ / फ, ज़ / ज: the same word either way


_LOOKUP: dict[str, str] = {_key(d): en for en, devs in _WORDS.items() for d in devs}
# a Devanagari word (letters + matras), plural "-्स" / "-ों" split off by the lookup
_WORD = re.compile(f"[{_DEVA}]+")
_PLURAL = ("्स", "ों")


def _english(word: str) -> str | None:
    w = _key(word)
    if w in _LOOKUP:
        return _LOOKUP[w]
    for suffix in _PLURAL:
        if w.endswith(suffix) and w[: -len(suffix)] in _LOOKUP:
            return _LOOKUP[w[: -len(suffix)]] + "s"
    return None


def latinize_terms(text: str) -> str:
    """Devanagari spellings of English-only words → English letters; everything else untouched."""
    if not text:
        return text
    return _WORD.sub(lambda m: _english(m.group()) or m.group(), text)


class TermStream:
    """`latinize_terms` over a streamed answer: a Devanagari word split across two deltas is held back until it is
    complete (at most one word of delay), so the client never sees "एल्गो" then "रिद्म"."""

    def __init__(self) -> None:
        self._held = ""

    def push(self, delta: str) -> str:
        text = self._held + delta
        cut = len(text)
        while cut > 0 and re.match(f"[{_DEVA}]", text[cut - 1]):
            cut -= 1  # the trailing Devanagari run may still be growing
        self._held = text[cut:]
        return latinize_terms(text[:cut])

    def flush(self) -> str:
        out, self._held = latinize_terms(self._held), ""
        return out
