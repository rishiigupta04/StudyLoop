"""Real-speech evaluation (the CO4 headline number): accuracy + macro-F1 per STT provider, split by speaker.

    ml/.venv/Scripts/python ml/eval_real_speech.py                        # ml/data/real_speech_*.jsonl
    ml/.venv/Scripts/python ml/eval_real_speech.py --files a.jsonl --test-speakers spk3,spk7 --out r.json

Input: the Collect page's JSONL export (docs/TIER1C_COLLECT.md), one row per clip, with `final_label` (the audited
intent), `speaker_id`, `lang_style`, and one text column per provider:
    browser_text   Chrome/Edge Web Speech (empty = recognizer unavailable or heard nothing)
    groq_text      Groq Whisper   } the export fills the one that served the turn (`stt_provider`); a re-run of
    sarvam_text    Sarvam Saaras  } the stored audio through the other provider fills the other column
Every text goes through the backend's `normalize()` and then the classifier, exactly as in the graph.

Per provider, a clip counts if that provider transcribed it. An empty transcript is an end-to-end miss (nothing
happens for the user), so there are two accuracies: `e2e` (empty = OOS prediction) and `text` (non-empty only,
the classifier's own accuracy). Speakers: every speaker separately, plus the held-out test speakers (--test-speakers
or data/real_speech_split.json) against the rest — the number to quote is the held-out speakers', never training
speakers', and never a synthetic set's.
"""

from __future__ import annotations

import argparse
import json
from collections import defaultdict
from collections.abc import Callable
from pathlib import Path

from common import DATA, SAVED, normalize, read_jsonl
from metrics import classification_report

PROVIDERS = ("sarvam", "groq", "browser")
Classifier = Callable[[str], tuple[str, float]]  # normalized text -> (intent, confidence)


def attempted(row: dict, provider: str) -> bool:
    if provider == "browser":
        return bool((row.get("browser_text") or "").strip())
    return row.get("stt_provider") == provider or bool((row.get(f"{provider}_text") or "").strip())


def load_rows(files: list[Path]) -> list[dict]:
    rows = []
    for f in files:
        for r in read_jsonl(f):
            if r.get("final_label"):
                rows.append({**r, "_file": f.name})
    return rows


def evaluate(rows: list[dict], classify: Classifier, tau: Callable[[str], float] | None = None) -> dict:
    """Metrics per provider: overall, per speaker, per lang_style; e2e and text-only accuracy."""
    out: dict = {}
    for provider in PROVIDERS:
        items = []
        for r in rows:
            if not attempted(r, provider):
                continue
            text = (r.get(f"{provider}_text") or "").strip()
            norm = normalize(text) if text else ""
            intent, conf = classify(norm) if norm else ("OOS", 0.0)
            items.append(
                {
                    "label": r["final_label"],
                    "pred": intent,
                    "conf": conf,
                    "empty": not norm,
                    "speaker": r.get("speaker_id") or "?",
                    "style": r.get("lang_style") or "?",
                    "direct": intent != "OOS" and conf >= (tau(intent) if tau else 0.0),
                }
            )
        if not items:
            out[provider] = {"n": 0}
            continue

        def summary(sel: list[dict]) -> dict:
            e2e = classification_report([i["label"] for i in sel], [i["pred"] for i in sel])
            nonempty = [i for i in sel if not i["empty"]]
            txt = (
                classification_report([i["label"] for i in nonempty], [i["pred"] for i in nonempty])
                if nonempty
                else None
            )
            direct = [i for i in sel if i["direct"]]
            return {
                "n": len(sel),
                "empty_transcripts": sum(i["empty"] for i in sel),
                "accuracy_e2e": e2e["accuracy"],
                "macro_f1_e2e": e2e["macro_f1"],
                "accuracy_text": txt["accuracy"] if txt else None,
                "macro_f1_text": txt["macro_f1"] if txt else None,
                "direct_rate": len(direct) / len(sel),
                "misfire_rate": (sum(i["pred"] != i["label"] for i in direct) / len(direct))
                if direct
                else 0.0,
            }

        by_speaker: dict[str, list[dict]] = defaultdict(list)
        by_style: dict[str, list[dict]] = defaultdict(list)
        for i in items:
            by_speaker[i["speaker"]].append(i)
            by_style[i["style"]].append(i)
        out[provider] = {
            **summary(items),
            "per_speaker": {s: summary(v) for s, v in sorted(by_speaker.items())},
            "per_style": {s: summary(v) for s, v in sorted(by_style.items())},
            "report": classification_report([i["label"] for i in items], [i["pred"] for i in items]),
        }
    return out


def split_by_speaker(rows: list[dict], test_speakers: set[str]) -> dict[str, list[dict]]:
    return {
        "held_out_speakers": [r for r in rows if r.get("speaker_id") in test_speakers],
        "other_speakers": [r for r in rows if r.get("speaker_id") not in test_speakers],
    }


def classifiers(bundle: Path | None) -> dict[str, tuple[Classifier, Callable[[str], float] | None]]:
    """The backend's own classifiers — the code that serves, not a re-implementation."""
    from app.orchestration import regex_classifier

    out: dict = {
        "regex": (lambda t: (lambda r: (r[0].value, r[1]))(regex_classifier.classify(t)), lambda _i: 0.85)
    }
    if bundle is not None and (bundle / "model.onnx").exists():
        from app.orchestration.onnx_classifier import OnnxIntentClassifier

        m = OnnxIntentClassifier(bundle)
        out[f"onnx:{m.version}"] = (lambda t: (lambda r: (r[0].value, r[1]))(m.classify(t)), m.threshold)
    return out


def table(results: dict[str, dict], title: str) -> str:
    lines = [
        f"### {title}",
        "",
        "| classifier | provider | n | empty | acc (e2e) | macro-F1 (e2e) | acc (text) | macro-F1 (text) |",
        "|---|---|---:|---:|---:|---:|---:|---:|",
    ]
    for name, per_provider in results.items():
        for provider, m in per_provider.items():
            if not m.get("n"):
                lines.append(f"| {name} | {provider} | 0 | | | | | |")
                continue
            text_acc = f"{m['accuracy_text']:.3f}" if m["accuracy_text"] is not None else "–"
            text_f1 = f"{m['macro_f1_text']:.3f}" if m["macro_f1_text"] is not None else "–"
            lines.append(
                f"| {name} | {provider} | {m['n']} | {m['empty_transcripts']} | {m['accuracy_e2e']:.3f} | "
                f"{m['macro_f1_e2e']:.3f} | {text_acc} | {text_f1} |"
            )
    return "\n".join(lines)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--files", nargs="*", type=Path)
    ap.add_argument("--bundle", type=Path, help="ONNX bundle dir (default: saved_models/intent-onnx/LATEST)")
    ap.add_argument("--test-speakers", default="", help="comma-separated held-out speaker ids")
    ap.add_argument("--out", type=Path)
    args = ap.parse_args()

    files = args.files or sorted(DATA.glob("real_speech_*.jsonl"))
    if not files:
        raise SystemExit(
            "no real_speech_*.jsonl yet: record a Collect session first (docs/TIER1C_COLLECT.md)"
        )
    rows = load_rows(files)
    test_speakers = {s for s in args.test_speakers.split(",") if s}
    split_file = DATA / "real_speech_split.json"
    if not test_speakers and split_file.exists():
        test_speakers = set(json.loads(split_file.read_text(encoding="utf-8")).get("test_speakers", []))
    bundle = args.bundle
    if bundle is None and (SAVED / "intent-onnx" / "LATEST").exists():
        bundle = (
            SAVED / "intent-onnx" / (SAVED / "intent-onnx" / "LATEST").read_text(encoding="utf-8").strip()
        )

    models = classifiers(bundle)
    report: dict = {
        "files": [f.name for f in files],
        "rows": len(rows),
        "test_speakers": sorted(test_speakers),
    }
    groups = {"all_speakers": rows}
    if test_speakers:
        groups.update(split_by_speaker(rows, test_speakers))
    for group, sel in groups.items():
        results = {name: evaluate(sel, clf, tau) for name, (clf, tau) in models.items()}
        report[group] = results
        print(
            table(results, f"{group} ({len(sel)} clips, {len({r.get('speaker_id') for r in sel})} speakers)")
        )
        print()
    for name, (clf, tau) in models.items():
        res = evaluate(rows, clf, tau)
        print(f"#### {name}: accuracy (e2e) per speaker")
        for provider, m in res.items():
            if m.get("n"):
                cells = ", ".join(
                    f"{s} {v['accuracy_e2e']:.2f} (n={v['n']})" for s, v in m["per_speaker"].items()
                )
                print(f"- {provider}: {cells}")
        print()
    if args.out:
        args.out.write_text(json.dumps(report, indent=2, default=str), encoding="utf-8")


if __name__ == "__main__":
    main()
