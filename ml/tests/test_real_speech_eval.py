"""eval_real_speech.py on a small synthetic fixture (no real speech exists yet — these numbers mean nothing;
the fixture only pins the bookkeeping: which clips count for which provider, empty transcripts, speakers)."""

from pathlib import Path

import pytest

from common import normalize
from eval_real_speech import attempted, classifiers, evaluate, load_rows, split_by_speaker

FIXTURE = Path(__file__).parent / "fixtures" / "real_speech_fixture.jsonl"
ROWS = load_rows([FIXTURE])


def oracle(rows):
    """A classifier that knows every fixture text's label, except where told to be wrong."""
    truth = {}
    for r in rows:
        for p in ("browser", "groq", "sarvam"):
            if r.get(f"{p}_text"):
                truth[normalize(r[f"{p}_text"])] = r["final_label"]
    return lambda text, wrong=(): ("ASK", 0.9) if text in wrong else (truth[text], 0.99)


def test_a_provider_counts_only_clips_it_transcribed():
    assert len(ROWS) == 12
    assert sum(attempted(r, "sarvam") for r in ROWS) == 7  # stt_provider == sarvam, one of them heard nothing
    assert sum(attempted(r, "groq") for r in ROWS) == 5
    assert sum(attempted(r, "browser") for r in ROWS) == 10  # two clips have no browser transcript


def test_empty_transcripts_are_end_to_end_misses_but_not_classifier_errors():
    clf = oracle(ROWS)
    res = evaluate(ROWS, lambda t: clf(t))
    sarvam = res["sarvam"]
    assert sarvam["n"] == 7 and sarvam["empty_transcripts"] == 1
    # the empty clip is labelled OOS, so predicting OOS for "nothing heard" is right end to end
    assert sarvam["accuracy_e2e"] == 1.0 and sarvam["accuracy_text"] == 1.0

    relabelled = [
        {**r, "final_label": "PLAY"} if not (r["sarvam_text"] or r["groq_text"] or r["browser_text"]) else r
        for r in ROWS
    ]
    res = evaluate(relabelled, lambda t: oracle(relabelled)(t))
    assert res["sarvam"]["accuracy_e2e"] == pytest.approx(6 / 7) and res["sarvam"]["accuracy_text"] == 1.0


def test_metrics_per_provider_and_per_speaker():
    wrong = {normalize("say that again")}  # spk_a's REPLAY clip, predicted ASK on every provider
    clf = oracle(ROWS)
    res = evaluate(ROWS, lambda t: clf(t, wrong))
    assert res["sarvam"]["accuracy_e2e"] == pytest.approx(6 / 7)
    assert res["browser"]["accuracy_e2e"] == pytest.approx(9 / 10)
    assert res["groq"]["accuracy_e2e"] == 1.0  # groq never transcribed that clip
    assert res["sarvam"]["per_speaker"]["spk_a"]["accuracy_e2e"] == pytest.approx(2 / 3)
    assert res["sarvam"]["per_speaker"]["spk_b"]["accuracy_e2e"] == 1.0
    assert res["sarvam"]["report"]["per_intent"]["REPLAY"]["recall"] == 0.0


def test_held_out_speakers_are_reported_separately():
    groups = split_by_speaker(ROWS, {"spk_c"})
    assert {r["speaker_id"] for r in groups["held_out_speakers"]} == {"spk_c"}
    assert "spk_c" not in {r["speaker_id"] for r in groups["other_speakers"]}
    assert len(groups["held_out_speakers"]) + len(groups["other_speakers"]) == len(ROWS)


def test_runs_with_the_backends_own_regex_classifier():
    clf, tau = classifiers(None)["regex"]
    res = evaluate(ROWS, clf, tau)
    assert all(res[p]["n"] for p in ("sarvam", "groq", "browser"))
    assert 0.0 <= res["sarvam"]["macro_f1_e2e"] <= 1.0
