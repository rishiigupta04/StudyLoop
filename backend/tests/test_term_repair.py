"""Vocabulary-anchored term repair: a Hindi speaker's technical terms must reach the transcript's
spelling, and must stay put when the transcript gives no evidence.

The real failure this guards (measured on MIT 6.006 L1): "बाइनरी सर्च" normalizes to "baainri sarch",
whose BM25 score against an English transcript is 0.00, so semantic seek landed on the wrong chunk.
"""

from collections import Counter

import pytest

from app.services.term_repair import (
    DF_DOMINANCE,
    build_repair_map,
    repair,
    skeleton,
)

# a stand-in for one lecture's vocabulary: {word: document frequency}
VOCAB = Counter(
    {
        "binary": 12,
        "search": 20,
        "algorithm": 30,
        "complexity": 8,
        "divide": 6,
        "conquer": 5,
        "array": 25,
        "peak": 40,
        "pick": 2,
        "finding": 9,
        "matrix": 4,
        "column": 7,
        "banner": 3,
    }
)


@pytest.fixture(scope="module")
def repairs():
    return build_repair_map(VOCAB)


def fix(text: str, skip=()) -> str | None:
    return repair(text, build_repair_map(VOCAB), VOCAB, skip=skip)


# ---------------------------------------------------------------- skeletons
@pytest.mark.parametrize(
    "word,expected",
    [
        ("binary", "bnr"),
        ("baainri", "bnr"),  # the same term as Chrome/Sarvam romanize it
        ("search", "srk"),
        ("sarch", "srk"),
        ("algorithm", "lgrtm"),
        ("elgoridam", "lgrtm"),  # d/t: the dental stop romanizes either way
        ("complexity", "kmplkst"),
        ("kompleksiti", "kmplkst"),  # c→k and x→ks
        ("divide", "tbt"),
        ("divaaid", "tbt"),  # v→b
        ("conquer", "knkr"),
        ("konkar", "knkr"),
    ],
)
def test_romanized_and_english_spellings_share_a_skeleton(word, expected):
    assert skeleton(word) == expected


def test_doubled_consonants_collapse():
    assert skeleton("summary") == skeleton("sumary")


def test_devanagari_has_no_skeleton():
    """Devanagari goes to the cross-lingual embedder untouched; there is nothing to repair."""
    assert skeleton("बाइनरी") == ""


# ---------------------------------------------------------------- repair
@pytest.mark.parametrize(
    "spoken,expected",
    [
        ("baainri sarch", "binary search"),
        ("elgoridam", "algorithm"),
        ("kompleksiti", "complexity"),
        ("divaaid konkar", "divide conquer"),
        ("phaainding", "finding"),
        ("maitriks", "matrix"),
    ],
)
def test_romanized_terms_reach_the_transcript_spelling(spoken, expected):
    assert fix(spoken) == expected


def test_returns_none_when_nothing_needed_repairing():
    """An English query must not pay for a second embedding of itself."""
    assert fix("binary search algorithm") is None
    assert fix("BINARY Search, algorithm!") is None


def test_words_the_transcript_already_uses_are_never_rewritten():
    assert fix("peak finding baainri") == "peak finding binary"


def test_ambiguity_is_declined():
    """'maitriks' could be matrix or metrics; with no dominant winner the word is left alone."""
    close = Counter({"matrix": 5, "metrics": 4})
    assert repair("maitriks", build_repair_map(close), close) is None


def test_a_dominant_candidate_wins_the_tie():
    wide = Counter({"matrix": int(4 * DF_DOMINANCE), "metrics": 4})
    assert repair("maitriks", build_repair_map(wide), wide) == "matrix"


def test_short_words_are_left_alone():
    """Three letters is a coincidence, not evidence."""
    assert fix("pik") is None


def test_short_skeletons_never_repair_even_with_a_candidate():
    """'peek' sits one letter from both 'peak' and 'pick' — two consonants is not enough to choose."""
    assert fix("peek") is None


def test_unknown_terms_stay_unknown():
    """Nothing is invented: a term this lecture never mentions is not rewritten to something it does."""
    assert fix("rikarshan") is None


def test_stopwords_are_skipped():
    assert fix("bataiye baainri", skip={"bataiye"}) == "bataiye binary"


def test_repair_is_idempotent():
    once = fix("baainri sarch")
    assert once == "binary search"
    assert fix(once) is None  # the repaired words are now in the vocabulary


def test_empty_and_punctuation_only_input():
    assert fix("") is None
    assert fix("!!! ???") is None
