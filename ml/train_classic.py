"""The two classical rows of the CO4 table: the regex baseline and TF-IDF + logistic regression.

    ml/.venv/Scripts/python ml/train_classic.py

Writes runs/<model>/{val,test}.jsonl (prediction, confidence, probabilities) and saved_models/tfidf/model.joblib.
The regex classifier is the backend's own (`app.orchestration.regex_classifier`), scored on the same normalized
text the graph hands it. It was tuned on the voice corpus, which is why the corpus is train-only here.
"""

from __future__ import annotations

import json
import time

import numpy as np

from common import INTENTS, LABEL2ID, RUNS, SAVED, write_jsonl
from dataset import load_split
from metrics import classification_report


def save_run(
    name: str, split: str, rows: list[dict], preds: list[str], confs: list[float], probs=None
) -> dict:
    out = []
    for k, r in enumerate(rows):
        rec = {"norm": r["norm"], "label": r["intent"], "pred": preds[k], "conf": round(float(confs[k]), 5)}
        rec.update({"style": r["style"], "kind": r["kind"], "base_id": r["base_id"]})
        if probs is not None:
            rec["probs"] = [round(float(x), 6) for x in probs[k]]
        out.append(rec)
    write_jsonl(RUNS / name / f"{split}.jsonl", out)
    rep = classification_report([r["intent"] for r in rows], preds)
    print(f"{name:10} {split:5} acc={rep['accuracy']:.4f} macro_f1={rep['macro_f1']:.4f} (n={rep['n']})")
    return rep


def regex_baseline(splits: dict[str, list[dict]]) -> None:
    from app.orchestration.regex_classifier import classify

    for split in ("val", "test"):
        rows = splits[split]
        res = [classify(r["norm"]) for r in rows]
        save_run("regex", split, rows, [i.value for i, _ in res], [c for _, c in res])


def tfidf_logreg(splits: dict[str, list[dict]]) -> None:
    import joblib
    from sklearn.feature_extraction.text import TfidfVectorizer
    from sklearn.linear_model import LogisticRegression
    from sklearn.pipeline import FeatureUnion, Pipeline

    def make(c: float) -> Pipeline:
        feats = FeatureUnion(
            [
                (
                    "char",
                    TfidfVectorizer(analyzer="char_wb", ngram_range=(2, 5), sublinear_tf=True, min_df=2),
                ),
                (
                    "word",
                    TfidfVectorizer(
                        analyzer="word", ngram_range=(1, 2), sublinear_tf=True, token_pattern=r"\S+"
                    ),
                ),
            ]
        )
        clf = LogisticRegression(C=c, max_iter=4000, class_weight="balanced")
        return Pipeline([("features", feats), ("clf", clf)])

    x_tr = [r["norm"] for r in splits["train"]]
    y_tr = [LABEL2ID[r["intent"]] for r in splits["train"]]
    best = None
    for c in (
        1.0,
        3.0,
        10.0,
        30.0,
        100.0,
        300.0,
        1000.0,
    ):  # the best must sit inside the grid, not on its edge
        model = make(c).fit(x_tr, y_tr)
        pred = [INTENTS[k] for k in model.predict([r["norm"] for r in splits["val"]])]
        f1 = classification_report([r["intent"] for r in splits["val"]], pred)["macro_f1"]
        print(f"  tfidf C={c:<6} val macro_f1={f1:.4f}")
        if best is None or f1 > best[0]:
            best = (f1, c, model)
    _, c, model = best
    print(f"  tfidf: chose C={c} on validation")
    SAVED.joinpath("tfidf").mkdir(parents=True, exist_ok=True)
    joblib.dump(model, SAVED / "tfidf" / "model.joblib")
    (SAVED / "tfidf" / "meta.json").write_text(json.dumps({"C": c, "labels": INTENTS}), encoding="utf-8")
    for split in ("val", "test"):
        rows = splits[split]
        probs = model.predict_proba([r["norm"] for r in rows])
        full = np.zeros((len(rows), len(INTENTS)))
        full[:, model.classes_] = probs  # classes_ are label ids
        save_run("tfidf", split, rows, [INTENTS[k] for k in full.argmax(1)], full.max(1), full)
    # latency of one call, like the fast path would make it
    t = []
    for r in splits["test"][:500]:
        t0 = time.perf_counter()
        model.predict_proba([r["norm"]])
        t.append((time.perf_counter() - t0) * 1000)
    print(f"  tfidf latency p50={np.percentile(t, 50):.2f} ms p95={np.percentile(t, 95):.2f} ms")


def main() -> None:
    splits = {s: load_split(s) for s in ("train", "val", "test")}
    regex_baseline(splits)
    tfidf_logreg(splits)


if __name__ == "__main__":
    main()
