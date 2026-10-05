"""Temperature scaling + τ for the served (INT8 ONNX) model → calibration.json in the bundle, reports/tau_sweep.csv.

    ml/.venv/Scripts/python ml/calibrate.py [--budget 0.01]

T is fitted on validation logits of the INT8 model (the one that serves), never on test. τ is then chosen on the
calibrated validation probabilities as the lowest threshold whose misfire rate (wrong actions among turns that
skip llm_router) stays within the budget. Per-intent τ is tried the same way. Tuning and judging on one set flatters
the option with more knobs, so the two are compared out-of-fold (5-fold within validation: pick τ on four folds,
route the fifth); per-intent τ is adopted only if it covers more turns out-of-fold without more misfires. Both are
reported on test.
"""

from __future__ import annotations

import argparse
import csv
import json

import numpy as np

from common import LABEL2ID, REPORTS, RUNS, SAVED, read_jsonl
from metrics import ece, fit_temperature, per_intent_tau, pick_tau, routing, softmax, sweep


def load(run: str, split: str) -> tuple[np.ndarray, np.ndarray]:
    logits = np.load(RUNS / run / f"{split}_logits.npy")
    y = np.array([LABEL2ID[r["label"]] for r in read_jsonl(RUNS / run / f"{split}.jsonl")])
    return logits, y


def out_of_fold(probs: np.ndarray, y: np.ndarray, budget: float, folds: int = 5) -> dict[str, dict]:
    """Global vs per-intent τ, each picked on k−1 folds and scored on the held-out one (stratified, fixed order)."""
    fold_of = np.zeros(len(y), dtype=int)
    for label in np.unique(y):
        idx = np.flatnonzero(y == label)
        fold_of[idx] = np.arange(len(idx)) % folds
    agg = {"global": [], "per_intent": []}
    for f in range(folds):
        fit, held = fold_of != f, fold_of == f
        tau = pick_tau(sweep(probs[fit], y[fit]), budget)
        per = per_intent_tau(probs[fit], y[fit], tau, budget)
        agg["global"].append(routing(probs[held], y[held], tau))
        agg["per_intent"].append(routing(probs[held], y[held], per))

    def pool(rs: list[dict]) -> dict:
        direct = sum(r["direct"] for r in rs)
        return {
            "coverage": float(np.mean([r["coverage"] for r in rs])),
            "misfire_rate": sum(r["misfires"] for r in rs) / max(direct, 1),
            "misfires": sum(r["misfires"] for r in rs),
            "direct": direct,
        }

    return {k: pool(v) for k, v in agg.items()}


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--run", default="onnx-int8")
    ap.add_argument(
        "--budget", type=float, default=0.01, help="max misfire rate among direct routes (validation)"
    )
    ap.add_argument("--bundle", default="", help="bundle version (default: saved_models/intent-onnx/LATEST)")
    ap.add_argument("--sweep-csv", default="tau_sweep.csv", help="file name under reports/")
    ap.add_argument(
        "--tau-mode",
        choices=("auto", "global", "per_intent"),
        default="auto",
        help="auto = decided out-of-fold; global/per_intent = an explicit override, recorded in calibration.json",
    )
    ap.add_argument("--why", default="", help="the reason for a --tau-mode override (recorded)")
    args = ap.parse_args()

    version = args.bundle or (SAVED / "intent-onnx" / "LATEST").read_text(encoding="utf-8").strip()
    bundle = SAVED / "intent-onnx" / version
    lv, yv = load(args.run, "val")
    lt, yt = load(args.run, "test")

    t = fit_temperature(lv, yv)
    pv, pt = softmax(lv / t), softmax(lt / t)
    print(
        f"T = {t:.3f}   ECE val {ece(softmax(lv), yv):.4f} → {ece(pv, yv):.4f}   test {ece(softmax(lt), yt):.4f} → {ece(pt, yt):.4f}"
    )

    curve = sweep(pv, yv)
    tau = pick_tau(curve, args.budget)
    per = per_intent_tau(pv, yv, tau, args.budget)
    per = {k: float(v) for k, v in per.items()}
    val_global, val_per = routing(pv, yv, tau), routing(pv, yv, per)
    oof = out_of_fold(pv, yv, args.budget)
    oof_says_per = oof["per_intent"]["coverage"] > oof["global"]["coverage"] and oof["per_intent"][
        "misfire_rate"
    ] <= max(oof["global"]["misfire_rate"], args.budget)
    use_per = oof_says_per if args.tau_mode == "auto" else args.tau_mode == "per_intent"
    test_global, test_per = routing(pt, yt, tau), routing(pt, yt, per)
    print(f"global τ={tau}: val {val_global}\n                test {test_global}")
    print(f"per-intent τ={per}:\n  val {val_per}\n  test {test_per}")
    print(f"out-of-fold on validation: {oof}")
    how = "decided out-of-fold on validation" if args.tau_mode == "auto" else f"override: {args.why or '—'}"
    print(f"→ serving {'per-intent' if use_per else 'global'} τ ({how})")

    REPORTS.mkdir(parents=True, exist_ok=True)
    with open(REPORTS / args.sweep_csv, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=["split", *curve[0].keys()])
        w.writeheader()
        for split, probs, y in (("val", pv, yv), ("test", pt, yt)):
            for row in sweep(probs, y):
                w.writerow({"split": split, **row})

    calib = {
        "temperature": t,
        "tau": tau,
        "tau_per_intent": per if use_per else None,
        "misfire_budget": args.budget,
        "chosen": "per_intent" if use_per else "global",
        "out_of_fold_choice": "per_intent" if oof_says_per else "global",
        "override": None if args.tau_mode == "auto" else {"mode": args.tau_mode, "why": args.why},
        "ece": {
            "val_raw": ece(softmax(lv), yv),
            "val_scaled": ece(pv, yv),
            "test_raw": ece(softmax(lt), yt),
            "test_scaled": ece(pt, yt),
        },
        "routing": {
            "val": {"global": val_global, "per_intent": val_per},
            "val_out_of_fold": oof,
            "test": {"global": test_global, "per_intent": test_per},
        },
        "fitted_on": f"{args.run} validation logits",
    }
    (bundle / "calibration.json").write_text(json.dumps(calib, indent=2), encoding="utf-8")
    print(f"wrote {bundle / 'calibration.json'}")


if __name__ == "__main__":
    main()
