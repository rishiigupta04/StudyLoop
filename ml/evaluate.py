"""The CO4 comparison on the synthetic test split → reports/RESULTS.md + reports/metrics.json (committed).

    ml/.venv/Scripts/python ml/evaluate.py

Reads the predictions every training script saved under runs/<model>/test.jsonl, plus the bundle's meta.json and
calibration.json, and times each model on CPU (one thread, batch of one: the fast path's shape). The synthetic test
split is hand-written bases the regex never saw plus their paraphrases; it is NOT the CO4 headline, which is the
real-speech set (eval_real_speech.py).
"""

from __future__ import annotations

import json
import statistics
import time
from datetime import datetime, timezone
from pathlib import Path

import numpy as np

from common import BUILD, FAST_PATH, INTENTS, LABEL2ID, REPORTS, RUNS, SAVED, read_jsonl
from metrics import ABBR, classification_report, confusion_markdown, routing

TRANSFORMERS = [
    ("DistilBERT (distilbert-base-uncased)", "distilbert-base-uncased"),
    ("DistilBERT, first 3 of its 6 blocks (`--layers 3`)", "distilbert-l3"),
    ("multilingual DistilBERT (distilbert-base-multilingual-cased)", "distilbert-base-multilingual-cased"),
    ("MuRIL (google/muril-base-cased)", "muril-base-cased"),
]
STYLE_ORDER = ["en", "hinglish", "hi", "hi_pure", "external"]
# the Render CPU decision: the deployed bundle vs the 3-layer candidate (export_onnx.py --run onnx-l3 --no-latest)
CANDIDATE_RUNS = [
    ("6 blocks (DistilBERT)", "onnx"),
    ("3 blocks (DistilBERT `--layers 3`)", "onnx-l3"),
]


def find_bundle(run: str) -> Path | None:
    """The newest bundle export_onnx.py wrote with --run <run> (recorded in its meta.json)."""
    found = []
    for path in (SAVED / "intent-onnx").glob("*/meta.json"):
        m = json.loads(path.read_text(encoding="utf-8"))
        if m.get("run", "onnx") == run and (path.parent / "calibration.json").exists():
            found.append((m["created_at"], path.parent))
    return max(found)[1] if found else None


def load_run(name: str, split: str = "test") -> list[dict] | None:
    path = RUNS / name / f"{split}.jsonl"
    return list(read_jsonl(path)) if path.exists() else None


def seeds_of(prefix: str) -> list[str]:
    return sorted(p.name for p in RUNS.glob(f"{prefix}-s*") if (p / "test.jsonl").exists())


def report(rows: list[dict]) -> dict:
    return classification_report([r["label"] for r in rows], [r["pred"] for r in rows])


def style_of(r: dict) -> str:
    return "external" if r.get("kind") == "external" else r.get("style", "?")


def per_style(rows: list[dict]) -> dict[str, dict]:
    out = {}
    for s in STYLE_ORDER:
        sel = [r for r in rows if style_of(r) == s]
        if sel:
            out[s] = {"n": len(sel), "accuracy": sum(r["label"] == r["pred"] for r in sel) / len(sel)}
    return out


def dir_bytes(path: Path, pattern: str) -> int:
    return sum(p.stat().st_size for p in path.glob(pattern)) if path.exists() else 0


def bench(fn, texts: list[str], repeat: int = 1) -> dict:
    fn(texts[0])  # warm
    ms = []
    for _ in range(repeat):
        for t in texts:
            t0 = time.perf_counter()
            fn(t)
            ms.append((time.perf_counter() - t0) * 1000)
    return {"p50": float(np.percentile(ms, 50)), "p95": float(np.percentile(ms, 95)), "n": len(ms)}


def latencies(texts: list[str], bundle: Path | None, best: dict[str, str]) -> dict[str, dict]:
    """CPU, one thread, one utterance at a time."""
    import torch

    torch.set_num_threads(1)
    out: dict[str, dict] = {}
    from app.orchestration.regex_classifier import classify

    out["regex"] = bench(classify, texts, repeat=3)
    tfidf = SAVED / "tfidf" / "model.joblib"
    if tfidf.exists():
        import joblib

        model = joblib.load(tfidf)
        out["tfidf"] = bench(lambda t: model.predict_proba([t]), texts)
    from transformers import AutoModelForSequenceClassification, AutoTokenizer

    for _label, key in TRANSFORMERS:
        tag = best.get(key)
        if not tag:
            continue
        tok = AutoTokenizer.from_pretrained(SAVED / tag)
        m = AutoModelForSequenceClassification.from_pretrained(SAVED / tag).eval()

        def run(t, tok=tok, m=m):
            with torch.no_grad():
                return m(**tok(t, return_tensors="pt", truncation=True, max_length=40)).logits

        out[key] = bench(run, texts[:200])
    if bundle is not None:
        from export_onnx import OrtModel

        meta = json.loads((bundle / "meta.json").read_text(encoding="utf-8"))
        fp32 = SAVED / "onnx-work" / meta["checkpoint"] / "model.fp32.opt.onnx"
        if fp32.exists():
            out["onnx-fp32"] = bench(OrtModel(fp32, bundle / "tokenizer.json", meta["max_len"]).logits, texts)
        from app.orchestration.onnx_classifier import OnnxIntentClassifier

        served = OnnxIntentClassifier(bundle)  # the backend's own class: tokenizer + session + calibration
        out["onnx-int8"] = bench(served.classify, texts, repeat=3)
    return out


def fmt(x: float | None, digits: int = 3) -> str:
    return "–" if x is None else f"{x:.{digits}f}"


def render_cpu_section(texts: list[str]) -> dict:
    """6 vs 3 transformer blocks, both INT8 ONNX with their own calibrated τ: accuracy on val/test, routing on test,
    CPU latency here (one thread, uncapped, this laptop), and under the 0.1-core cap from bench_serving.py."""
    from app.orchestration.onnx_classifier import OnnxIntentClassifier
    from metrics import softmax

    rows: list[dict] = []
    for label, run in CANDIDATE_RUNS:
        b = find_bundle(run)
        test_rows, val_rows = load_run(f"{run}-int8"), load_run(f"{run}-int8", "val")
        if b is None or test_rows is None or val_rows is None:
            continue
        meta = json.loads((b / "meta.json").read_text(encoding="utf-8"))
        calib = json.loads((b / "calibration.json").read_text(encoding="utf-8"))
        yt = np.array([LABEL2ID[r["label"]] for r in test_rows])
        pt = softmax(np.load(RUNS / f"{run}-int8" / "test_logits.npy") / calib["temperature"])
        route = routing(pt, yt, calib["tau_per_intent"] or calib["tau"])
        served = OnnxIntentClassifier(b)
        runs = []  # every bench_serving.py --cpu-cap run of THIS bundle (repeated runs: laptop CPU scaling is noisy)
        for cap_file in sorted(REPORTS.glob("serving_bench*_cap*.json")):
            j = json.loads(cap_file.read_text(encoding="utf-8"))
            if j.get("bundle") != b.name:
                continue  # a stale benchmark or another bundle
            key = next(k for k in j if k.startswith("cpu_cap_"))
            cfs = j.get("cfs_0.1cpu_estimate", {})
            runs.append(
                {
                    "saturated_p95": j[key]["classify_corpus"]["p95"],
                    "sparse_p95": (j[key].get("sparse_classify") or {}).get("p95"),
                    "cfs1_turn_p95": cfs.get("slowdown_1.0", {}).get("fast_path", {}).get("p95"),
                    "cfs2_turn_p95": cfs.get("slowdown_2.0", {}).get("fast_path", {}).get("p95"),
                    "turn_p95_uncapped": j["uncapped"].get("cpu_ms", {}).get("fast_path", {}).get("p95"),
                    "rss_delta_mb": j["rss_mb"]["onnx_delta"],
                }
            )
        capped = {"runs": runs}
        test_rep, val_rep = report(test_rows), report(val_rows)
        rows.append(
            {
                "label": label,
                "bundle": b.name,
                "layers": meta.get("layers"),
                "params": meta["params"],
                "bytes": meta["files"]["model.onnx"]["bytes"],
                "val_acc": val_rep["accuracy"],
                "val_f1": val_rep["macro_f1"],
                "test_acc": test_rep["accuracy"],
                "test_f1": test_rep["macro_f1"],
                "tau": calib["tau_per_intent"] or calib["tau"],
                "coverage": route["coverage"],
                "misfire": route["misfire_rate"],
                "latency": bench(served.classify, texts, repeat=3),
                "capped": capped,
            }
        )
    md: list[str] = []
    if len(rows) < 2:
        return {"md": md, "rows": rows}
    md += [
        "",
        "## Render CPU: 6 vs 3 transformer blocks (both INT8 ONNX, each with its own calibrated τ)",
        "",
        "| model | params | model.onnx | val acc / F1 | test acc / F1 | test coverage / misfire | classify p50 / p95 "
        "ms, uncapped | whole fast-path turn p95, uncapped | 0.1-core cap, classify p95: saturated / sparse | CFS "
        "0.1 CPU, whole turn p95 at 1× / 2× | RSS +MB | bench runs |",
        "|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|",
    ]

    def span(runs: list[dict], key: str) -> str:
        vals = [x[key] for x in runs if x.get(key) is not None]
        if not vals:
            return "–"
        lo, hi = min(vals), max(vals)
        return f"{lo:.0f}" if round(lo) == round(hi) else f"{lo:.0f}–{hi:.0f}"

    for r in rows:
        runs = r["capped"]["runs"]
        md.append(
            f"| {r['label']} | {r['params'] / 1e6:.0f} M | {r['bytes'] / 1e6:.1f} MB | {r['val_acc']:.3f} / "
            f"{r['val_f1']:.3f} | {r['test_acc']:.3f} / {r['test_f1']:.3f} | {r['coverage']:.3f} / "
            f"{r['misfire']:.3f} | {r['latency']['p50']:.2f} / {r['latency']['p95']:.2f} | "
            f"{span(runs, 'turn_p95_uncapped')} | {span(runs, 'saturated_p95')} / {span(runs, 'sparse_p95')} | "
            f"{span(runs, 'cfs1_turn_p95')} / {span(runs, 'cfs2_turn_p95')} | {span(runs, 'rss_delta_mb')} | "
            f"{len(runs)} |"
        )
    md += [
        "",
        "All latencies in ms on this laptop (ranges = repeated runs). The cap is a Windows Job Object hard cap "
        "(`bench_serving.py --cpu-cap 0.1`): *saturated* = calls back to back, so p95 is the throttle period; *sparse* = "
        "one call after 1 s idle, how one user talks to it. *CFS* = a model, not a measurement: Docker/Linux `--cpus "
        "0.1` gives 10 ms CPU per 100 ms period, so a turn needing c ms takes c + (ceil(c/10) − 1) × 90 ms; 2× = a "
        "server core half this laptop's speed. The whole fast-path turn includes LangGraph, normalize and slot "
        "parsing (~6 ms of it is not the classifier). None of this is a measurement on Render: `probe_ws.py` against "
        "the deployed server is.",
    ]
    return {"md": md, "rows": rows}


def main() -> None:
    test = list(read_jsonl(BUILD / "test.jsonl"))
    stats = json.loads((BUILD / "stats.json").read_text(encoding="utf-8"))
    latest = SAVED / "intent-onnx" / "LATEST"
    bundle = SAVED / "intent-onnx" / latest.read_text(encoding="utf-8").strip() if latest.exists() else None
    meta = json.loads((bundle / "meta.json").read_text(encoding="utf-8")) if bundle else None
    calib = (
        json.loads((bundle / "calibration.json").read_text(encoding="utf-8"))
        if bundle and (bundle / "calibration.json").exists()
        else None
    )

    rows: list[dict] = []  # the comparison table
    reps: dict[str, dict] = {}
    runs_by_model: dict[str, list[dict]] = {}
    best: dict[str, str] = {}

    def add(
        name: str, key: str, run_rows: list[dict], params: int | None, size: int | None, note: str = ""
    ) -> None:
        rep = report(run_rows)
        reps[key] = rep
        runs_by_model[key] = run_rows
        rows.append(
            {
                "model": name,
                "key": key,
                "params": params,
                "bytes": size,
                "acc": rep["accuracy"],
                "f1": rep["macro_f1"],
                "note": note,
            }
        )

    add("Regex baseline (backend `regex_classifier`)", "regex", load_run("regex"), None, None)
    if load_run("tfidf"):
        add(
            "TF-IDF (char 2-5 + word 1-2) + LogReg",
            "tfidf",
            load_run("tfidf"),
            None,
            dir_bytes(SAVED / "tfidf", "*.joblib"),
        )
    for label, key in TRANSFORMERS:
        tags = seeds_of(key)
        if not tags:
            continue
        per_seed = {t: report(load_run(t)) for t in tags}
        # the seed shipped / timed = best validation macro-F1 (never chosen on test)
        best[key] = max(
            tags,
            key=lambda t: json.loads((SAVED / t / "train_meta.json").read_text(encoding="utf-8"))[
                "val_macro_f1"
            ],
        )
        tmeta = json.loads((SAVED / best[key] / "train_meta.json").read_text(encoding="utf-8"))
        accs = [r["accuracy"] for r in per_seed.values()]
        f1s = [r["macro_f1"] for r in per_seed.values()]
        note = f"{len(tags)} seed(s): acc {statistics.mean(accs):.3f} ± {statistics.pstdev(accs):.3f}, F1 {statistics.mean(f1s):.3f} ± {statistics.pstdev(f1s):.3f}"
        add(
            f"{label}, fp32 PyTorch",
            key,
            load_run(best[key]),
            tmeta["params"],
            dir_bytes(SAVED / best[key], "*.safetensors"),
            note,
        )
    if meta:
        add("↳ exported to ONNX fp32", "onnx-fp32", load_run("onnx-fp32"), meta["params"], meta["fp32_bytes"])
        add(
            "↳ **ONNX dynamic INT8 (deployed, CLASSIFIER=onnx)**",
            "onnx-int8",
            load_run("onnx-int8"),
            meta["params"],
            meta["files"]["model.onnx"]["bytes"],
            f"quantization: {meta['quantization']['config']}",
        )

    lat = latencies([r["norm"] for r in test[:300]], bundle, best)
    for r in rows:
        r["latency"] = lat.get(r["key"])

    # --------------------------------------------------------------------------------------------- markdown
    md: list[str] = [
        "# Tier 1c intent classifier — results (synthetic test split)",
        "",
        f"_Generated {datetime.now(timezone.utc):%Y-%m-%d %H:%M} UTC by `ml/evaluate.py`. normalize() version "
        f"{stats['nlp_version']}. Bundle: `{meta['version'] if meta else '—'}`._",
        "",
        "> **Not the CO4 headline.** These are synthetic numbers: the test split is hand-written bases (never seen by",
        "> the regex, which was tuned on `voice_corpus.py`) plus their LLM paraphrases and held-out CLINC150/SNIPS",
        "> negatives. The ≥90 % target is for the real-speech test set (`ml/eval_real_speech.py`), which has no data yet.",
        "",
        "## Data",
        "",
        f"- rows: train {stats['rows']['train']}, val {stats['rows']['val']}, test {stats['rows']['test']} "
        f"(split by base utterance; the 743-case voice corpus is train-only)",
        f"- per style in test: {json.dumps(stats['per_style']['test'])}; per kind: {json.dumps(stats['per_kind']['test'])}",
        f"- labels: {stats['judge']['checked']} blind-judge labels, {stats['judge']['reviewed']} review decisions "
        f"(every val/test row; unreviewed val/test rows: {json.dumps(stats.get('valtest_unreviewed', {}))}), "
        f"confident learning {json.dumps(stats['judge'].get('confident_learning', {}))}; paraphrases admitted by "
        f"{json.dumps(stats.get('paraphrase_label_gate', {}))}",
        f"- dropped: {json.dumps(stats['drops'])}",
        "",
        "## CO4 comparison (test split)",
        "",
        "| model | params | size | CPU p50 / p95 ms (1 thread) | accuracy | macro-F1 | notes |",
        "|---|---:|---:|---:|---:|---:|---|",
    ]
    for r in rows:
        params = f"{r['params'] / 1e6:.0f} M" if r["params"] else "–"
        size = f"{r['bytes'] / 1e6:.1f} MB" if r["bytes"] else "–"
        latency = f"{r['latency']['p50']:.2f} / {r['latency']['p95']:.2f}" if r.get("latency") else "–"
        md.append(
            f"| {r['model']} | {params} | {size} | {latency} | {r['acc']:.3f} | {r['f1']:.3f} | {r['note']} |"
        )
    if meta:
        q = meta["quantization"]
        md += [
            "",
            f"INT8 vs fp32 ({q['config']}): validation Δacc {q['drop_val_acc_pt']:+.2f} pt, ΔF1 {q['drop_val_f1_pt']:+.2f} pt; "
            f"test Δacc {q['drop_test_acc_pt']:+.2f} pt, ΔF1 {q['drop_test_f1_pt']:+.2f} pt "
            f"(budget {q['budget_pt']} pt, chosen on validation: {'within' if q['within_budget_on_val'] else 'NOT within'}).",
        ]

    keys = [k for k in ("regex", "tfidf", "distilbert-base-uncased", "onnx-int8") if k in reps]
    md += [
        "",
        "## Per-intent F1 (test)",
        "",
        "| intent | support | " + " | ".join(keys) + " |",
        "|---|---:|" + "---:|" * len(keys),
    ]
    for i in INTENTS:
        md.append(
            f"| {i} | {reps[keys[0]]['per_intent'][i]['support']} | "
            + " | ".join(f"{reps[k]['per_intent'][i]['f1']:.3f}" for k in keys)
            + " |"
        )

    md += [
        "",
        "## Accuracy by input style (test)",
        "",
        "| style | n | " + " | ".join(keys) + " |",
        "|---|---:|" + "---:|" * len(keys),
    ]
    styles = {k: per_style(runs_by_model[k]) for k in keys}
    for s in STYLE_ORDER:
        if s in styles[keys[0]]:
            md.append(
                f"| {s} | {styles[keys[0]][s]['n']} | "
                + " | ".join(fmt(styles[k].get(s, {}).get("accuracy")) for k in keys)
                + " |"
            )
    md += [
        "",
        "`hi` = Sarvam-style code-mix (Devanagari Hindi, Latin English terms, digits); `hi_pure` = all Devanagari (Chrome hi-IN,",
        "or Sarvam spelling an English term in Devanagari); `hinglish` = romanized (Groq Whisper); `external` = CLINC150/SNIPS OOS.",
    ]

    md += [
        "",
        "## Confusable pairs (data plan §4), errors on test",
        "",
        "| pair | " + " | ".join(keys) + " |",
        "|---|" + "---|" * len(keys),
    ]
    for p_idx, pair in enumerate(reps[keys[0]]["pairs"]):
        cells = []
        for k in keys:
            p = reps[k]["pairs"][p_idx]
            cells.append(f"{p['a_as_b']} → / {p['b_as_a']} ←")
        md.append(f"| {pair['pair']} | " + " | ".join(cells) + " |")
    md.append("")
    md.append(
        "(`a → b` = true first intent predicted as the second; supports differ per intent, see the per-intent table.)"
    )
    for k in [k for k in ("onnx-int8", "regex") if k in reps]:
        md += [
            "",
            confusion_markdown(
                reps[k]["confusion"],
                f"Confusion matrix — {k} (rows true, columns predicted; §4 pairs in bold)",
            ),
        ]
    md.append("")
    md.append("Abbreviations: " + ", ".join(f"{v} = {k}" for k, v in ABBR.items()))

    if calib:
        yt = np.array([LABEL2ID[r["label"]] for r in load_run("onnx-int8")])
        lt = np.load(RUNS / "onnx-int8" / "test_logits.npy")
        from metrics import softmax

        pt = softmax(lt / calib["temperature"])
        yv = np.array([LABEL2ID[r["label"]] for r in load_run("onnx-int8", "val")])
        pv = softmax(np.load(RUNS / "onnx-int8" / "val_logits.npy") / calib["temperature"])
        test_route = calib["routing"]["test"]
        regex_rows = load_run("regex")
        regex_probs = np.zeros((len(regex_rows), len(INTENTS)))
        for n, r in enumerate(regex_rows):  # the regex's "probability" is its fixed 0.95 / 0.30 confidence
            regex_probs[n, LABEL2ID[r["pred"]]] = r["conf"]
        regex_route = routing(regex_probs, np.array([LABEL2ID[r["label"]] for r in regex_rows]), 0.85)
        override = calib.get("override")
        served = calib["chosen"]
        md += [
            "",
            "## Calibration and routing threshold τ",
            "",
            f"- temperature T = {calib['temperature']:.3f} (fitted on validation logits of the INT8 model); ECE "
            f"val {calib['ece']['val_raw']:.3f} → {calib['ece']['val_scaled']:.3f}, test {calib['ece']['test_raw']:.3f} → "
            f"{calib['ece']['test_scaled']:.3f}",
            f"- global τ = {calib['tau']}: the lowest threshold with ≤ {calib['misfire_budget']:.0%} misfires among direct "
            f"routes on validation. Per-intent τ `{json.dumps(calib.get('tau_per_intent') or {})}`."
            if served == "per_intent"
            else f"- global τ = {calib['tau']}: the lowest threshold with ≤ {calib['misfire_budget']:.0%} misfires among "
            "direct routes on validation.",
            f"- out-of-fold on validation chose **{calib.get('out_of_fold_choice', served)}**; served: **{served}**"
            + (f" — override: {override['why']}" if override else "")
            + ". Full sweep: `ml/reports/tau_sweep.csv`.",
            "",
            "| on the test split | regex (τ 0.85) | ONNX INT8, global τ | ONNX INT8, per-intent τ |",
            "|---|---:|---:|---:|",
        ]
        for label, key in (
            ("coverage: in-scope turns that skip llm_router", "coverage"),
            ("misfire rate among those direct routes", "misfire_rate"),
            ("fast path: player-intent turns acted on correctly", "fast_coverage"),
            ("fast path: wrong player actions among fast-path actions", "fast_misfire"),
            ("OOS turns that trigger a direct action", "oos_leak"),
        ):
            md.append(
                f"| {label} | {regex_route[key]:.3f} | {test_route['global'][key]:.3f} | "
                f"{test_route['per_intent'][key]:.3f} |"
            )
        md += [
            "",
            f"Fast-path intents: {', '.join(sorted(FAST_PATH))}.",
            "",
            "The misfire budget is a product choice — wrong actions vs turns that wait for `llm_router` (~0.5–1.5 s):",
            "",
            "| global τ | val coverage | val misfire | test coverage | test misfire | test fast-path misfire | test OOS turns that act |",
            "|---:|---:|---:|---:|---:|---:|---:|",
        ]
        # the served global τ is always a row (bold), whatever the budget picked
        for t in sorted({0.8, 0.9, 0.92, 0.95, 0.97, 0.98, calib["tau"]}):
            rv, rt = routing(pv, yv, t), routing(pt, yt, t)
            tag = f"**{t}** (served)" if served == "global" and t == calib["tau"] else f"{t}"
            md.append(
                f"| {tag} | {rv['coverage']:.3f} | {rv['misfire_rate']:.3f} | {rt['coverage']:.3f} | "
                f"{rt['misfire_rate']:.3f} | {rt['fast_misfire']:.3f} | {rt['oos_leak']:.3f} |"
            )

    decision = render_cpu_section([r["norm"] for r in test[:300]])
    md += decision["md"]

    REPORTS.mkdir(parents=True, exist_ok=True)
    (REPORTS / "RESULTS.md").write_text("\n".join(md) + "\n", encoding="utf-8")
    (REPORTS / "metrics.json").write_text(
        json.dumps(
            {
                "generated": datetime.now(timezone.utc).isoformat(timespec="seconds"),
                "bundle": meta,
                "calibration": calib,
                "table": rows,
                "reports": {
                    k: {kk: v for kk, v in rep.items() if kk != "confusion"} | {"confusion": rep["confusion"]}
                    for k, rep in reps.items()
                },
                "styles": styles,
                "data": stats,
                "render_cpu_candidates": decision["rows"],
            },
            indent=2,
            default=float,
        ),
        encoding="utf-8",
    )
    print("\n".join(md))


if __name__ == "__main__":
    main()
