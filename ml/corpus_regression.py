"""Regression check (not accuracy): the 743-case voice corpus through the real graph with CLASSIFIER=onnx vs regex.

    ml/.venv/Scripts/python ml/corpus_regression.py [--bundle DIR]  → reports/corpus_regression.md

The corpus is in the classifier's training data (and the regex was tuned on it), so agreement here says "the model
didn't forget or override the behaviour Tier 0/1b rely on", never "the model is accurate". Every disagreement is
listed: the intent, the player action (slots end to end) and the route (fast / seek / rag / notes / llm).
LLM and retrieval keys are blanked, so nothing leaves the machine: a turn the ONNX model isn't sure about shows up
as route "llm" (it would go to llm_router), which is the safe failure, not a wrong action.
"""

from __future__ import annotations

import argparse
import os
import uuid
from pathlib import Path

for _k in (
    "GROQ_API_KEY",
    "GEMINI_API_KEY",
    "HF_TOKEN",
    "TRANSCRIPT_API_KEY",
    "SUPABASE_URL",
    "SUPABASE_SERVICE_KEY",
):
    os.environ[_k] = ""  # hermetic: the graph must not call an LLM or a database from this script
os.environ["CHECKPOINTER"] = "memory"

from common import REPORTS, SAVED  # noqa: E402


def run_all(cases) -> list[dict]:
    from langgraph.checkpoint.memory import MemorySaver

    from app.orchestration.graph import build_graph, new_turn_input

    g = build_graph(checkpointer=MemorySaver())
    out = []
    for text, _intent, _action in cases:
        tid = str(uuid.uuid4())
        s = g.invoke(
            new_turn_input(
                session_id=tid,
                user_id="u",
                video_id="v",
                language="en",
                playback_s=600.0,
                max_watched_s=600.0,
                turn_id=tid,
                raw_text=text,
            ),
            {"configurable": {"thread_id": tid}},
        )
        out.append(
            {
                "intent": s["intent"],
                "conf": s["confidence"],
                "action": s["action"],
                "route": s["route"],
                "classify_ms": s["timings"].get("classify_intent"),
                "norm": s["normalized_text"],
            }
        )
    return out


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--bundle", type=Path)
    ap.add_argument("--tau", type=float, help="what-if: route on this global τ instead of the bundle's")
    args = ap.parse_args()
    bundle = (
        args.bundle
        or SAVED / "intent-onnx" / (SAVED / "intent-onnx" / "LATEST").read_text(encoding="utf-8").strip()
    )

    from app.orchestration import onnx_classifier
    from tests.voice_corpus import CASES, GROUPS

    group_of = {text: g for g, cases in GROUPS.items() for text, _, _ in cases}
    onnx_classifier.unload()
    regex = run_all(CASES)
    status = onnx_classifier.load(bundle)
    assert status == "onnx", status
    model = onnx_classifier.active()
    if args.tau is not None:  # what-if only: the bundle on disk keeps its calibrated τ
        model.tau, model.tau_per_intent = args.tau, {}
    onnx = run_all(CASES)
    onnx_classifier.unload()

    rows = []
    for (text, want_intent, want_action), r, o in zip(CASES, regex, onnx, strict=True):
        same = (r["intent"], r["action"], r["route"]) == (o["intent"], o["action"], o["route"])
        if not same:
            kind = (
                "deferred to llm_router (below τ or OOS)"
                if o["route"] == "llm" and r["route"] != "llm"
                else "different intent"
                if o["intent"] != r["intent"]
                else "same intent, different action/route"
            )
            rows.append((text, want_intent, want_action, r, o, kind))

    regex_ok = sum(r["intent"] == c[1] and r["action"] == c[2] for c, r in zip(CASES, regex, strict=True))
    onnx_ok = sum(o["intent"] == c[1] and o["action"] == c[2] for c, o in zip(CASES, onnx, strict=True))
    ms = sorted(o["classify_ms"] for o in onnx if o["classify_ms"] is not None)
    by_kind: dict[str, int] = {}
    for *_, kind in rows:
        by_kind[kind] = by_kind.get(kind, 0) + 1
    md = [
        "# Voice-corpus regression: CLASSIFIER=onnx vs regex",
        "",
        f"_`ml/corpus_regression.py`, bundle `{bundle.name}`, routing τ {model.tau}"
        + (" (**what-if**, not the bundle's calibrated τ)" if args.tau is not None else " (the bundle's)")
        + ". A regression check, not accuracy: the corpus is in the training data and the regex was tuned on it._",
        "",
        f"- cases: {len(CASES)}; identical intent + action + route: **{len(CASES) - len(rows)}**; disagreements: **{len(rows)}**",
        f"- matching the corpus's expected intent and action: regex {regex_ok}/{len(CASES)}, ONNX {onnx_ok}/{len(CASES)}",
        f"- disagreements by kind: {by_kind}",
        f"- classify_intent node time with ONNX (graph timings): p50 {ms[len(ms) // 2]:.2f} ms, "
        f"p95 {ms[int(len(ms) * 0.95)]:.2f} ms, max {ms[-1]:.2f} ms",
        "",
        "| # | utterance | group | expected | regex | ONNX (conf) | ONNX route | kind |",
        "|---:|---|---|---|---|---|---|---|",
    ]
    for n, (text, want_intent, want_action, r, o, kind) in enumerate(rows, 1):
        want = want_intent + (f" {want_action}" if want_action else "")
        reg = r["intent"] + (f" {r['action']}" if r["action"] else "") + f" [{r['route']}]"
        onx = o["intent"] + f" ({o['conf']:.2f})" + (f" {o['action']}" if o["action"] else "")
        md.append(
            f"| {n} | {text} | {group_of.get(text, '?')} | {want} | {reg} | {onx} | {o['route']} | {kind} |"
        )
    REPORTS.mkdir(parents=True, exist_ok=True)
    out = REPORTS / ("corpus_regression.md" if args.tau is None else f"corpus_regression_tau{args.tau}.md")
    out.write_text("\n".join(md) + "\n", encoding="utf-8")
    print("\n".join(md[:12]))
    print(f"... {len(rows)} rows → {out}")


if __name__ == "__main__":
    main()
