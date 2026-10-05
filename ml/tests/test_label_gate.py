"""The label gate: confident learning flags the right rows, folds keep a base's family together, and dataset.py
lets a generated row in only through a review, the judge, or (train only) a confident-learning pass."""

import json

import numpy as np

import dataset
from common import INTENTS, LABEL2ID, read_jsonl
from label_noise import confident_flags, folds_by_group


def test_confident_learning_flags_a_row_whose_label_the_model_is_sure_is_wrong():
    k_play, k_pause, k_ask = LABEL2ID["PLAY"], LABEL2ID["PAUSE"], LABEL2ID["ASK"]
    probs = np.full((6, len(INTENTS)), 0.001)
    rows = [  # (given label, the out-of-fold model's belief)
        (k_play, {k_play: 0.95}),
        (k_play, {k_play: 0.90}),
        (k_pause, {k_pause: 0.92}),
        (k_pause, {k_pause: 0.88}),
        (k_play, {k_pause: 0.93, k_play: 0.02}),  # labeled PLAY, confidently PAUSE → flagged, suggest PAUSE
        (k_ask, {k_ask: 0.40, k_play: 0.35}),  # unsure but no other class clears its threshold → passes
    ]
    y = np.array([label for label, _ in rows])
    for n, (_, p) in enumerate(rows):
        for k, v in p.items():
            probs[n, k] = v
    flagged, suggest, t = confident_flags(probs, y)
    assert flagged.tolist() == [False, False, False, False, True, False]
    assert suggest[4] == k_pause
    assert t[k_play] < 0.95  # a class threshold is the mean self-confidence of its own rows


def test_folds_keep_a_base_and_its_paraphrases_together():
    rows = [{"base_id": f"hw-{i // 3}"} for i in range(60)]  # 20 bases x 3 rows
    fold = folds_by_group(rows, 5)
    for i in range(0, 60, 3):
        assert len(set(fold[i : i + 3])) == 1
    assert len(set(fold.tolist())) > 1


def test_dataset_gate_order(tmp_path, monkeypatch):
    """review > judge > confident learning (train only) > drop."""
    bases = [
        {
            "base_id": "hw-a",
            "text": "play it",
            "intent": "PLAY",
            "style": "en",
            "source": "hw",
            "group": "hw",
        },
        {
            "base_id": "hw-b",
            "text": "pause it",
            "intent": "PAUSE",
            "style": "en",
            "source": "hw",
            "group": "hw",
        },
        {
            "base_id": "hw-c",
            "text": "maybe play",
            "intent": "PLAY",
            "style": "en",
            "source": "hw",
            "group": "hw",
        },
    ]
    paras = [
        {"base_id": "hw-a", "intent": "PLAY", "style": "en", "text": t}
        for t in ("resume it", "keep playing", "go on then", "phir se chalao", "carry on now")
    ] + [
        {"base_id": "hw-b", "intent": "PAUSE", "style": "en", "text": "hold on a sec"},
        {"base_id": "hw-c", "intent": "PLAY", "style": "en", "text": "perhaps play it"},
    ]
    data = tmp_path / "data"
    data.mkdir()

    def jl(name, rows):
        (data / name).write_text("".join(json.dumps(r) + "\n" for r in rows), encoding="utf-8")

    jl("paraphrases.jsonl", paras)
    jl(
        "paraphrase_checks.jsonl",
        [
            {"text": "resume it", "label": "PLAY"},
            {"text": "phir se chalao", "label": "REPLAY"},
            {"text": "perhaps play it", "label": "PLAY"},
        ],
    )
    jl(
        "label_review.jsonl",
        [
            {"text": "phir se chalao", "decision": "relabel", "intent": "REPLAY"},
            {"text": "maybe play", "decision": "drop", "intent": "PLAY"},
        ],
    )
    jl(
        "label_noise.jsonl",
        [
            {"text": "keep playing", "label": "PLAY", "status": "pass"},
            {"text": "go on then", "label": "PLAY", "status": "flag"},
            {"text": "hold on a sec", "label": "PAUSE", "status": "pass"},
        ],
    )
    monkeypatch.setattr(dataset, "DATA", data)
    monkeypatch.setattr(dataset, "load_bases", lambda: bases)
    monkeypatch.setattr(dataset, "_split_bases", lambda b: {"hw-a": "train", "hw-b": "test", "hw-c": "train"})
    monkeypatch.setattr(dataset, "_external_rows", lambda: [])
    stats = dataset.build(out=tmp_path / "build")
    got = {
        r["text"]: (r["intent"], split)
        for split in ("train", "val", "test")
        for r in read_jsonl(tmp_path / "build" / f"{split}.jsonl")
    }
    assert got["resume it"] == ("PLAY", "train")  # judge agrees
    assert got["phir se chalao"] == ("REPLAY", "train")  # judge disagreed, a human relabeled it
    assert got["keep playing"] == ("PLAY", "train")  # unjudged, passed confident learning
    assert "go on then" not in got  # unjudged, flagged, never reviewed
    assert "carry on now" not in got  # unjudged, never scored
    assert "hold on a sec" not in got  # a TEST row: confident learning never decides one
    assert (
        "maybe play" not in got and "perhaps play it" not in got
    )  # a dropped base takes its paraphrases along
    assert stats["valtest_unreviewed"] == {"test": 1}  # the unreviewed test base "pause it"


def test_cfs_latency_model():
    from metrics import cfs_latency

    assert cfs_latency(6.0) == 6.0  # fits in one 10 ms quota
    assert cfs_latency(10.0) == 10.0
    assert cfs_latency(13.0) == 13.0 + 90.0  # one exhausted quota costs the rest of its 100 ms period
    assert cfs_latency(6.0, slowdown=2.0) == 12.0 + 90.0
