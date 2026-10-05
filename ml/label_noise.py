"""Confident learning over the training rows → data/label_noise.jsonl (committed; dataset.py applies it).

    ml/.venv/Scripts/python ml/label_noise.py                  # DistilBERT, 5 folds grouped by base (GPU: minutes)
    ml/.venv/Scripts/python ml/label_noise.py --model tfidf    # the same with TF-IDF + LogReg (seconds, weaker)

Why: the blind LLM judge (verify_paraphrases.py) couldn't label every training paraphrase on free-tier quotas, and
it is one model's opinion anyway. Confident learning (Northcutt, Jiang & Chuang, JAIR 2021) needs no extra labels:
  1. the candidate pool is every train row dataset.py would build with no judge gate (bases, paraphrases carrying
     their base's intent or a review decision, CLINC/SNIPS negatives), normalized and deduplicated the same way;
  2. out-of-fold probabilities: K folds GROUPED BY BASE, so a paraphrase is scored by a model that never saw its
     base or its siblings (otherwise a drifted paraphrase inherits its siblings' label and hides);
  3. per-class thresholds t_j = mean p_j over rows labeled j; a row labeled i is FLAGGED when p_i < t_i and some
     other class j has p_j >= t_j (it lands off the diagonal of the confident joint), suggested label = that j.
Flagged rows go to human review (`review.py queue cl`); unflagged rows are recorded as passed. dataset.py trains
on a train paraphrase the judge never labeled only if it passed here or a human kept it. Bases, the voice corpus
and external negatives are scored too (the report lists them) but only paraphrases are gated by this file.
"""

from __future__ import annotations

import argparse
import json
from collections import Counter
from datetime import datetime, timezone

import numpy as np

from common import BUILD, DATA, INTENTS, LABEL2ID, REPORTS, read_jsonl, stable_hash, write_jsonl

OUT = DATA / "label_noise.jsonl"
POOL = BUILD / "cl_pool"
FOLDS = 5
SALT = "tier1c-cl-v1"


def folds_by_group(rows: list[dict], k: int) -> np.ndarray:
    """Fold of each row: whole base groups (a base + its paraphrases) land in one fold, assigned by a salted hash."""
    return np.array([stable_hash(r["base_id"], SALT) % k for r in rows])


def oof_tfidf(rows: list[dict], fold: np.ndarray) -> np.ndarray:
    from sklearn.feature_extraction.text import TfidfVectorizer
    from sklearn.linear_model import LogisticRegression
    from sklearn.pipeline import FeatureUnion, Pipeline

    x = np.array([r["norm"] for r in rows], dtype=object)
    y = np.array([LABEL2ID[r["intent"]] for r in rows])
    probs = np.zeros((len(rows), len(INTENTS)))
    for f in range(FOLDS):
        tr, te = fold != f, fold == f
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
        model = Pipeline(
            [("f", feats), ("clf", LogisticRegression(C=10.0, max_iter=4000, class_weight="balanced"))]
        )
        model.fit(x[tr], y[tr])
        probs[np.ix_(te, model.classes_)] = model.predict_proba(x[te])
    return probs


def oof_transformer(
    rows: list[dict], fold: np.ndarray, base_model: str, epochs: int, seed: int
) -> np.ndarray:
    import torch
    from transformers import (
        AutoModelForSequenceClassification,
        AutoTokenizer,
        get_linear_schedule_with_warmup,
    )

    from train_transformer import batches, encode, predict_logits, set_seed

    device = "cuda" if torch.cuda.is_available() else "cpu"
    tokenizer = AutoTokenizer.from_pretrained(base_model)
    probs = np.zeros((len(rows), len(INTENTS)))
    for f in range(FOLDS):
        set_seed(seed + f)
        tr = [r for r, k in zip(rows, fold, strict=True) if k != f]
        te_idx = np.flatnonzero(fold == f)
        model = AutoModelForSequenceClassification.from_pretrained(
            base_model, num_labels=len(INTENTS), id2label=dict(enumerate(INTENTS)), label2id=LABEL2ID
        ).to(device)
        loader = batches(
            tokenizer, encode(tokenizer, tr), [LABEL2ID[r["intent"]] for r in tr], 32, True, seed + f
        )
        steps = len(loader) * epochs
        opt = torch.optim.AdamW(model.parameters(), lr=5e-5, weight_decay=0.01)
        sched = get_linear_schedule_with_warmup(opt, int(0.1 * steps), steps)
        scaler = torch.amp.GradScaler(enabled=device == "cuda")
        model.train()
        for _ in range(epochs):
            for b in loader:
                b = {k: v.to(device) for k, v in b.items()}
                with torch.autocast(device_type="cuda", dtype=torch.float16, enabled=device == "cuda"):
                    loss = model(**b).loss
                opt.zero_grad(set_to_none=True)
                scaler.scale(loss).backward()
                scaler.unscale_(opt)
                torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
                scaler.step(opt)
                scaler.update()
                sched.step()
            model.train()
        logits = predict_logits(model, tokenizer, [rows[i] for i in te_idx], device)
        z = logits - logits.max(axis=1, keepdims=True)
        probs[te_idx] = np.exp(z) / np.exp(z).sum(axis=1, keepdims=True)
        print(f"  fold {f + 1}/{FOLDS}: {len(tr)} train rows, {len(te_idx)} scored", flush=True)
        del model
        if device == "cuda":
            torch.cuda.empty_cache()
    return probs


def confident_flags(probs: np.ndarray, y: np.ndarray) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """(flagged, suggested label, per-class thresholds). Off-diagonal confident-joint membership: p_y < t_y and
    max over j != y of p_j among classes with p_j >= t_j; ties broken by the larger p_j."""
    t = np.array([probs[y == k, k].mean() if (y == k).any() else 1.0 for k in range(probs.shape[1])])
    above = probs >= t[None, :]
    above[np.arange(len(y)), y] = False
    masked = np.where(above, probs, -1.0)
    suggest = masked.argmax(axis=1)
    flagged = (probs[np.arange(len(y)), y] < t[y]) & (masked.max(axis=1) >= 0)
    return flagged, suggest, t


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--model", default="distilbert-base-uncased", help="a HF model id, or 'tfidf'")
    ap.add_argument("--epochs", type=int, default=4)
    ap.add_argument("--seed", type=int, default=7)
    args = ap.parse_args()

    from dataset import build

    build(allow_unjudged=True, out=POOL)  # the ungated candidate pool (never used for reported numbers)
    rows = list(read_jsonl(POOL / "train.jsonl"))
    y = np.array([LABEL2ID[r["intent"]] for r in rows])
    fold = folds_by_group(rows, FOLDS)
    print(
        f"{len(rows)} train rows in the pool, {len({r['base_id'] for r in rows})} base groups, {FOLDS} folds"
    )
    probs = (
        oof_tfidf(rows, fold)
        if args.model == "tfidf"
        else oof_transformer(rows, fold, args.model, args.epochs, args.seed)
    )
    flagged, suggest, t = confident_flags(probs, y)
    oof_acc = float((probs.argmax(1) == y).mean())

    stamp = datetime.now(timezone.utc).isoformat(timespec="seconds")
    out = []
    for k, r in enumerate(rows):
        out.append(
            {
                "text": r["text"],
                "norm": r["norm"],
                "label": r["intent"],
                "kind": r["kind"],
                "base_id": r["base_id"],
                "status": "flag" if flagged[k] else "pass",
                "p_label": round(float(probs[k, y[k]]), 4),
                "suggest": INTENTS[suggest[k]] if flagged[k] else None,
                "p_suggest": round(float(probs[k, suggest[k]]), 4) if flagged[k] else None,
                "model": args.model,
                "folds": FOLDS,
                "scored_at": stamp,
            }
        )
    out.sort(key=lambda r: (r["label"], r["status"], r["text"]))
    write_jsonl(OUT, out)

    by_kind = Counter((r["kind"], r["status"]) for r in out)
    pairs = Counter((r["label"], r["suggest"]) for r in out if r["status"] == "flag")
    summary = {
        "model": args.model,
        "rows": len(out),
        "out_of_fold_accuracy": round(oof_acc, 4),
        "flagged": int(flagged.sum()),
        "by_kind": {f"{k}/{s}": n for (k, s), n in sorted(by_kind.items())},
        "thresholds": {INTENTS[k]: round(float(v), 3) for k, v in enumerate(t)},
        "top_flag_pairs": [[f"{a} -> {b}", n] for (a, b), n in pairs.most_common(15)],
    }
    REPORTS.mkdir(parents=True, exist_ok=True)
    (REPORTS / "label_noise.json").write_text(json.dumps(summary, indent=2), encoding="utf-8")
    print(json.dumps(summary, indent=2))


if __name__ == "__main__":
    main()
