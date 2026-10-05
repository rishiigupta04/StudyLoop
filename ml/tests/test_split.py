"""No leakage between train / val / test.

The split is by BASE utterance: a base and every paraphrase of it share one split, so the model never trains on a
rewording of a test sentence. The voice corpus (which the regex classifier was tuned on) is train-only. A
normalized string lives in one split only. The first tests need only committed files; the ones on data/build/
skip until `ml/dataset.py` has been run (it needs the downloaded CLINC150/SNIPS negatives)."""

from collections import Counter, defaultdict

import pytest

from common import BUILD, DATA, INTENTS, STYLES, read_jsonl
from dataset import TEST_FRAC, VAL_FRAC, _split_bases
from sources import load_bases

BASES = load_bases()
SPLIT = _split_bases(BASES)
BUILT = all((BUILD / f"{s}.jsonl").exists() for s in ("train", "val", "test"))
needs_build = pytest.mark.skipif(not BUILT, reason="run ml/dataset.py first")


def test_every_base_gets_exactly_one_split_and_it_is_deterministic():
    assert set(SPLIT) == {b["base_id"] for b in BASES}
    assert _split_bases(load_bases()) == SPLIT


def test_the_voice_corpus_is_train_only():
    corpus = [b for b in BASES if b["source"] == "vc"]
    assert len(corpus) == 743
    assert {SPLIT[b["base_id"]] for b in corpus} == {"train"}


def test_hand_written_bases_are_stratified_by_intent_and_style():
    groups: dict[tuple[str, str], Counter] = defaultdict(Counter)
    for b in BASES:
        if b["source"] == "hw":
            groups[(b["intent"], b["style"])][SPLIT[b["base_id"]]] += 1
    assert set(groups) == {(i, s) for i in INTENTS for s in STYLES}
    for counts in groups.values():
        n = sum(counts.values())
        assert counts["test"] == round(n * TEST_FRAC) and counts["val"] == round(n * VAL_FRAC)


def test_paraphrases_belong_to_known_bases():
    path = DATA / "paraphrases.jsonl"
    if not path.exists():
        pytest.skip("no paraphrases generated yet")
    ids = {b["base_id"] for b in BASES}
    orphans = [p for p in read_jsonl(path) if p["base_id"] not in ids]
    assert not orphans, f"{len(orphans)} paraphrases of bases that no longer exist: rerun ml/paraphrase.py"


@needs_build
def test_no_base_spans_two_splits():
    seen: dict[str, str] = {}
    for split in ("train", "val", "test"):
        for r in read_jsonl(BUILD / f"{split}.jsonl"):
            assert seen.setdefault(r["base_id"], split) == split, r
            if r["kind"] in ("base", "para"):
                assert SPLIT[r["base_id"]] == split, r  # a paraphrase sits where its base sits


@needs_build
def test_no_normalized_string_spans_two_splits():
    norms = {s: {r["norm"] for r in read_jsonl(BUILD / f"{s}.jsonl")} for s in ("train", "val", "test")}
    assert not norms["train"] & norms["test"]
    assert not norms["train"] & norms["val"]
    assert not norms["val"] & norms["test"]


@needs_build
def test_test_split_has_no_voice_corpus_rows_and_every_intent():
    test = list(read_jsonl(BUILD / "test.jsonl"))
    assert not [r for r in test if r["source"] == "vc"]
    assert {r["intent"] for r in test} == set(INTENTS)


@needs_build
def test_external_negatives_are_split_by_source_intent():
    where: dict[str, set[str]] = defaultdict(set)
    for split in ("train", "val", "test"):
        for r in read_jsonl(BUILD / f"{split}.jsonl"):
            if r["kind"] == "external":
                assert r["intent"] == "OOS"
                where[r["base_id"]].add(split)
    assert where and all(len(s) == 1 for s in where.values())
