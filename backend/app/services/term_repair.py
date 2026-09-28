"""Put a Hindi speaker's technical terms back into the transcript's own spelling (bilingual Tier 1b fix).

A learner who says "जहाँ उसने बाइनरी सर्च समझाया वहाँ ले चलो" gets Devanagari from STT, which
`normalize()` romanizes phonetically — "baainri sarch". The embedding half of hybrid retrieval limps
along (BGE-M3 is cross-lingual), but BM25 scores a flat zero, because "baainri" appears nowhere in an
English transcript. Measured on 6.006 L1, a Hindi speaker naming a topic got no lexical corroboration
at all and a similarity stuck in the grey zone below the 0.58 "relevant" band — right only by luck,
and rejected outright by `SEEK_STRONG_SIM`:

    "बाइनरी सर्च"    before → sim 0.525  lex 0.00     after → sim 0.568  lex 3.80
    "एल्गोरिदम"       before → sim 0.579  lex 0.00     after → sim 0.607  lex 0.86
    "कॉम्प्लेक्सिटी"      before → sim 0.539  lex 0.00     after → sim 0.599  lex 1.47

English queries are untouched: repaired variants are *added* to the query list, never substituted.

Phonetic romanization mangles vowels and swaps confusable consonants, but the consonant *skeleton*
survives: "baainri" and "binary" are both `bnr`. So we fold each word to its skeleton and look it up in
the vocabulary of **this video's own transcript** — the only evidence that a term is real. Nothing is
invented: a word is only rewritten to something the lecture actually says.

Used for retrieval queries only (`retrieval.Retriever.rank`). It never touches the classifier, the
slots, the fast path or anything the learner sees, so the worst a bad repair can do is rank chunks the
way an unrelated search term would.
"""

from __future__ import annotations

from collections.abc import Iterable, Mapping

VOWELS = frozenset("aeiou")
# dropped outright: aspiration and glides survive romanization too unreliably to carry signal
SILENT = frozenset("hyw")
# consonants that romanized Hindi and English spelling disagree about
#   c/q→k  (sarch/search)      x→ks (kompleksiti/complexity)   z→s
#   v→b    (divaaid/divide)    f→p                             d→t (dental stops: elgoridam/algorithm)
FOLD = {"c": "k", "q": "k", "x": "ks", "z": "s", "v": "b", "f": "p", "d": "t"}

MIN_WORD_LEN = 4  # shorter words carry too little skeleton to match safely
MIN_SKELETON = 3  # "bnr" is evidence; "bn" is a coincidence
DF_DOMINANCE = 3.0  # one candidate this many times commoner than the next wins the tie


def skeleton(word: str) -> str:
    """Consonant skeleton: 'binary' and 'baainri' both fold to 'bnr'. '' when there's nothing to match."""
    if not word.isascii():
        return ""  # Devanagari goes to the cross-lingual embedder unchanged; there's nothing to repair
    out: list[str] = []
    for ch in word.lower():
        if not ch.isalpha() or ch in VOWELS or ch in SILENT:
            continue
        for folded in FOLD.get(ch, ch):
            if not out or out[-1] != folded:  # collapse doubles ("kk" → "k")
                out.append(folded)
    return "".join(out)


def build_repair_map(vocabulary: Iterable[str]) -> dict[str, list[str]]:
    """Skeleton → the transcript words that share it. Built once per video, cached on the index."""
    out: dict[str, list[str]] = {}
    for word in vocabulary:
        if len(word) < MIN_WORD_LEN:
            continue
        key = skeleton(word)
        if len(key) >= MIN_SKELETON:
            out.setdefault(key, []).append(word)
    return out


def _best(candidates: list[str], df: Mapping[str, int]) -> str | None:
    """The one word this skeleton can mean — or None when the transcript gives no clear answer."""
    if not candidates:
        return None  # this lecture never says anything that sounds like it
    if len(candidates) == 1:
        return candidates[0]
    ranked = sorted(candidates, key=lambda w: (-df.get(w, 0), w))
    top, runner_up = df.get(ranked[0], 0), df.get(ranked[1], 0)
    # "peak" vs "pick" in a peak-finding lecture: take the dominant one, otherwise leave it alone
    return ranked[0] if runner_up and top >= DF_DOMINANCE * runner_up else None


def repair(
    text: str,
    repair_map: Mapping[str, list[str]],
    df: Mapping[str, int],
    skip: Iterable[str] = (),
) -> str | None:
    """Rewrite phonetically romanized words to the transcript's spelling, or None when nothing needed
    repairing. Lowercased, punctuation dropped — the result is a search query, never shown to anyone.

    Returning None (rather than a tidied copy) matters: the caller adds the result as an extra query,
    and an English utterance must not pay for a second embedding of itself.

    Idempotent: a repaired word is in the vocabulary, so a second pass leaves it alone."""
    skipped = frozenset(skip)
    out: list[str] = []
    changed = False
    for raw in text.split():
        word = "".join(ch for ch in raw.lower() if ch.isalnum())
        if not word:
            continue
        if word in df or word in skipped or len(word) < MIN_WORD_LEN:
            out.append(word)  # already the transcript's own word, a function word, or too short
            continue
        key = skeleton(word)
        fixed = _best(repair_map.get(key, []), df) if len(key) >= MIN_SKELETON else None
        if fixed:
            changed = True
        out.append(fixed or word)
    return " ".join(out) if changed else None
