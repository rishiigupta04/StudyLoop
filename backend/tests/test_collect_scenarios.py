"""The Tier 1c recording deck (`frontend/src/lib/collectScenarios.json`) checked from the backend.

The deck decides what the real-speech corpus contains, so it is data worth a test even though the
page that shows it is frontend-only: the intents must stay in step with `orchestration/intents.py`
(changing the taxonomy means relabelling), every bucket needs enough situations that a speaker never
repeats one, and the confusable pairs of docs/TIER1C_DATA_PLAN.md §4 must all be covered on purpose.
"""

import json
from pathlib import Path

import pytest

from app.orchestration.intents import Intent

DECK_PATH = Path(__file__).resolve().parents[2] / "frontend" / "src" / "lib" / "collectScenarios.json"

# §4 of the data plan. Dropping a row here means dropping it from the corpus, so it is spelled out.
REQUIRED_PAIRS = {
    "ask_vs_replay",
    "stop_vs_pause",
    "semantic_vs_ask",
    "summarize_vs_ask",
    "note_vs_ask",
    "seekback_vs_replay",
    "volume_vs_speed",
    "absolute_vs_forward",
}

# A card must describe a situation, never the command (data plan §3). Scenarios are written in the
# second person ("You missed…"), so a leading imperative is the tell-tale of a command sneaking in.
COMMAND_OPENERS = (
    "go ",
    "play",
    "pause",
    "stop",
    "skip",
    "replay",
    "repeat",
    "jump",
    "seek",
    "rewind",
    "set ",
    "turn ",
    "show ",
    "take a note",
    "note ",
    "summarize",
    "summarise",
    "tell me",
    "what ",
)

LANGS = ("en", "hinglish", "hi")
MIN_PER_INTENT = 5  # the CO4 minimum per speaker: 5 clips with no repeated situation


@pytest.fixture(scope="module")
def deck() -> dict:
    return json.loads(DECK_PATH.read_text(encoding="utf-8"))


@pytest.fixture(scope="module")
def scenarios(deck) -> list[dict]:
    return deck["scenarios"]


def test_deck_file_exists():
    assert DECK_PATH.is_file(), f"recording deck missing at {DECK_PATH}"


def test_every_intent_has_scenarios(scenarios):
    covered = {s["intent"] for s in scenarios}
    assert covered == {i.value for i in Intent}, "deck and Intent taxonomy have drifted apart"


def test_enough_scenarios_per_intent(scenarios):
    for intent in Intent:
        n = sum(1 for s in scenarios if s["intent"] == intent.value)
        assert n >= MIN_PER_INTENT, f"{intent.value} has {n} scenarios, needs {MIN_PER_INTENT}"


def test_ids_are_unique_and_filename_safe(scenarios):
    ids = [s["id"] for s in scenarios]
    assert len(ids) == len(set(ids)), "duplicate scenario id"
    for sid in ids:
        assert sid == sid.lower() and sid.replace("-", "").isalnum(), sid


def test_every_scenario_is_written_in_all_three_styles(scenarios):
    for s in scenarios:
        for lang in LANGS:
            text = s.get(lang, "")
            assert isinstance(text, str) and len(text.strip()) >= 15, f"{s['id']}.{lang} too short"
        assert len({s[lang] for lang in LANGS}) == 3, f"{s['id']} repeats the same text across styles"


def test_hindi_card_is_actually_devanagari(scenarios):
    for s in scenarios:
        devanagari = sum(1 for ch in s["hi"] if "ऀ" <= ch <= "ॿ")
        assert devanagari >= 10, f"{s['id']}.hi does not look like Hindi"


def test_cards_describe_a_situation_not_a_command(scenarios):
    for s in scenarios:
        opener = s["en"].lower()
        assert not opener.startswith(COMMAND_OPENERS), f"{s['id']}.en reads like the command itself"


def test_confusable_pairs_are_declared_and_covered(deck, scenarios):
    declared = set(deck["pairs"])
    assert REQUIRED_PAIRS <= declared, f"data plan §4 pairs missing: {REQUIRED_PAIRS - declared}"
    for s in scenarios:
        unknown = set(s["pairs"]) - declared
        assert not unknown, f"{s['id']} tags undeclared pair(s) {unknown}"
    for pair in REQUIRED_PAIRS:
        tagged = [s for s in scenarios if pair in s["pairs"]]
        assert len(tagged) >= 3, f"{pair} has only {len(tagged)} scenarios"
        assert len({s["intent"] for s in tagged}) >= 2, f"{pair} must span both sides of the pair"


def test_the_decided_labeling_rule_is_in_the_deck(scenarios):
    """ "I missed the bit where he defined X" names a topic -> SEMANTIC_SEEK; "I missed that" -> REPLAY.

    Both halves have to be recorded or the rule can never be evaluated (data plan §4, decided 28 Sep).
    """
    missed_with_topic = [
        s for s in scenarios if s["intent"] == Intent.SEMANTIC_SEEK.value and "missed" in s["en"].lower()
    ]
    missed_without = [
        s for s in scenarios if s["intent"] == Intent.REPLAY.value and "missed" not in s["en"].lower()
    ]
    assert missed_with_topic, "no SEMANTIC_SEEK card for 'I missed the bit where he defined X'"
    assert missed_without, "no REPLAY card for a missed moment with no topic named"
