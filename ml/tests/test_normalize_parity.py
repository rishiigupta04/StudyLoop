"""normalize() parity: the classifier trains on exactly the text the graph hands it at serving time (roadmap D6).

ml/ imports the backend's own `studyloop_nlp.normalize` (never a copy); every built row's `norm` must equal what
that function returns today, the graph's normalize_input node must produce the same string, and a trained bundle
must record the normalize() version it was trained against."""

import json

import pytest

import common
import studyloop_nlp
from common import BUILD, SAVED, read_jsonl
from sources import load_bases


def test_ml_uses_the_backends_normalize_itself():
    assert common.normalize is studyloop_nlp.normalize
    assert common.NLP_VERSION == studyloop_nlp.__version__


def test_graph_node_and_training_prep_agree_on_every_base():
    from app.orchestration.graph import normalize_input

    for b in load_bases():
        assert normalize_input({"raw_text": b["text"]})["normalized_text"] == common.normalize(b["text"]), b


@pytest.mark.skipif(not (BUILD / "train.jsonl").exists(), reason="run ml/dataset.py first")
def test_built_rows_match_todays_normalize():
    stale = [
        r
        for split in ("train", "val", "test")
        for r in read_jsonl(BUILD / f"{split}.jsonl")
        if r["norm"] != common.normalize(r["text"])
    ]
    assert (
        not stale
    ), f"{len(stale)} rows were built with an older normalize(): rebuild and retrain ({stale[:3]})"
    stats = json.loads((BUILD / "stats.json").read_text(encoding="utf-8"))
    assert stats["nlp_version"] == studyloop_nlp.__version__


@pytest.mark.skipif(not (SAVED / "intent-onnx" / "LATEST").exists(), reason="no exported bundle")
def test_the_bundle_was_trained_on_this_normalize():
    version = (SAVED / "intent-onnx" / "LATEST").read_text(encoding="utf-8").strip()
    meta = json.loads((SAVED / "intent-onnx" / version / "meta.json").read_text(encoding="utf-8"))
    assert meta["nlp_version"] == studyloop_nlp.__version__
