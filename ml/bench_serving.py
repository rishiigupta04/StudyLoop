"""Serving cost of CLASSIFIER=onnx: memory and latency, measured in the backend's own code.

    backend/.venv/Scripts/python ml/bench_serving.py [--bundle DIR] [--cpu-cap 0.1] → reports/serving_bench.json
    backend/.venv/Scripts/python ml/bench_serving.py --bundle DIR --name l3 --cpu-cap 0.1   # a candidate bundle

- RSS of a process holding the backend app, before and after the ONNX bundle is loaded (the model's own cost),
  and with the whole FastAPI app imported (what Render's ~512 MB has to hold).
- classify() latency, one thread, one utterance at a time (the fast path's shape), on the voice corpus (real
  command lengths) and on the synthetic test split (longer, includes CLINC queries); by token count.
- the fast path end to end through the real graph (normalize → classify → parse_slots → action_executor).
- --cpu-cap F: re-run under a Windows Job Object hard cap of F of ONE core, the way Render's free instance gives
  0.1 CPU, twice: saturated (calls back to back: the process is always out of budget, so p95 ≈ the throttle
  period, a many-users worst case) and sparse (--sparse-gap seconds idle before each call: one voice turn every
  few seconds, the real single-user pattern). An approximation (different CPU, different scheduler).
- cfs_0.1cpu_estimate: a model, not a measurement. Docker/Linux `--cpus 0.1` is a CFS quota of 10 ms CPU per
  100 ms period; a call needing c ms of CPU that starts with a full quota takes c + (ceil(c/10) - 1) × 90 ms.
  Applied to every uncapped call, at this laptop's speed and at half of it (Render doesn't publish its CPU).
"""

from __future__ import annotations

import argparse
import gc
import json
import os
import statistics
import sys
import time
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
    os.environ[_k] = ""
os.environ["CHECKPOINTER"] = "memory"

import psutil  # noqa: E402

from common import BUILD, REPORTS, SAVED, normalize, read_jsonl  # noqa: E402
from metrics import cfs_latency  # noqa: E402


def rss_mb() -> float:
    gc.collect()
    return psutil.Process().memory_info().rss / 1e6


def pct(ms: list[float]) -> dict:
    s = sorted(ms)
    return {
        "n": len(s),
        "p50": round(s[len(s) // 2], 3),
        "p95": round(s[int(len(s) * 0.95)], 3),
        "p99": round(s[min(len(s) - 1, int(len(s) * 0.99))], 3),
        "max": round(s[-1], 3),
        "mean": round(statistics.mean(s), 3),
    }


def cap_cpu(fraction_of_one_core: float) -> None:
    """Windows Job Object hard cap. CpuRate is in 1/100 % of the WHOLE machine, so one core's fraction is scaled
    by the number of logical processors."""
    import ctypes
    from ctypes import wintypes

    class CpuRate(ctypes.Structure):
        _fields_ = [("ControlFlags", wintypes.DWORD), ("CpuRate", wintypes.DWORD)]

    k32 = ctypes.WinDLL("kernel32", use_last_error=True)
    k32.CreateJobObjectW.restype = wintypes.HANDLE
    k32.GetCurrentProcess.restype = wintypes.HANDLE
    k32.SetInformationJobObject.argtypes = [wintypes.HANDLE, ctypes.c_int, ctypes.c_void_p, wintypes.DWORD]
    k32.AssignProcessToJobObject.argtypes = [wintypes.HANDLE, wintypes.HANDLE]
    job = k32.CreateJobObjectW(None, None)
    rate = max(1, round(10000 * fraction_of_one_core / os.cpu_count()))
    info = CpuRate(0x1 | 0x4, rate)  # ENABLE | HARD_CAP
    if not k32.SetInformationJobObject(job, 15, ctypes.byref(info), ctypes.sizeof(info)):
        raise OSError(ctypes.get_last_error(), "SetInformationJobObject")
    if not k32.AssignProcessToJobObject(job, k32.GetCurrentProcess()):
        raise OSError(ctypes.get_last_error(), "AssignProcessToJobObject")
    print(
        f"CPU capped at {fraction_of_one_core} of one core (CpuRate {rate}/10000 of {os.cpu_count()} logical CPUs)"
    )


def measure(model, corpus: list[str], test: list[str], graph, player_cases: list[str]) -> dict:
    # per-call CPU time for the CFS model. Windows' process/thread CPU clocks tick at ~15.6 ms, too coarse for 3-12 ms
    # calls; these calls are CPU-bound on one thread, so the uncapped wall time stands in for CPU time
    cpu: dict[str, list[float]] = {"classify": [], "fast_path": []}

    def run(texts: list[str], repeat: int) -> list[float]:
        ms = []
        for _ in range(repeat):
            for t in texts:
                t0 = time.perf_counter()
                model.classify(t)
                ms.append((time.perf_counter() - t0) * 1000)
                cpu["classify"].append(ms[-1])
        return ms

    run(corpus[:20], 1)  # warm
    cpu["classify"].clear()
    out = {"classify_corpus": pct(run(corpus, 2)), "classify_test": pct(run(test, 1))}
    by_len: dict[str, list[float]] = {}
    for t in test + corpus:
        n = len(model.tokenizer.encode(t).ids)
        bucket = "≤8" if n <= 8 else "9-16" if n <= 16 else "17-24" if n <= 24 else ">24"
        t0 = time.perf_counter()
        model.classify(t)
        by_len.setdefault(bucket, []).append((time.perf_counter() - t0) * 1000)
    out["classify_by_tokens"] = {k: pct(v) for k, v in sorted(by_len.items())}

    from app.orchestration.graph import new_turn_input

    fast = []
    for text in player_cases:
        tid = str(uuid.uuid4())
        t0 = time.perf_counter()
        s = graph.invoke(
            new_turn_input(
                session_id=tid, user_id="u", video_id="v", language="en", turn_id=tid, raw_text=text
            ),
            {"configurable": {"thread_id": tid}},
        )
        if s["route"] == "fast":
            cpu["fast_path"].append((time.perf_counter() - t0) * 1000)  # the whole invoke, LangGraph included
            fast.append(
                sum(
                    v
                    for k, v in s["timings"].items()
                    if k in ("normalize_input", "classify_intent", "parse_slots", "action_executor")
                )
            )
    out["fast_path_graph_ms"] = pct(fast) if fast else None
    out["fast_path_share"] = len(fast) / len(player_cases)
    out["cpu_ms"] = {k: pct(v) for k, v in cpu.items() if v}
    out["_cpu_samples"] = cpu
    return out


def sparse(model, texts: list[str], gap_s: float) -> dict:
    """Under the cap, one call after `gap_s` of idle — a voice turn every few seconds, not a saturated server."""
    ms = []
    for t in texts:
        time.sleep(gap_s)
        t0 = time.perf_counter()
        model.classify(t)
        ms.append((time.perf_counter() - t0) * 1000)
    return pct(ms)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--bundle", type=Path)
    ap.add_argument("--cpu-cap", type=float, default=0.0)
    ap.add_argument("--name", default="", help="report suffix for a candidate bundle, e.g. l3")
    ap.add_argument(
        "--sparse-gap", type=float, default=1.0, help="idle seconds before each sparse capped call"
    )
    ap.add_argument("--sparse-n", type=int, default=80)
    args = ap.parse_args()
    bundle = (
        args.bundle
        or SAVED / "intent-onnx" / (SAVED / "intent-onnx" / "LATEST").read_text(encoding="utf-8").strip()
    )

    base = rss_mb()
    from langgraph.checkpoint.memory import MemorySaver

    from app.main import create_app
    from app.orchestration import onnx_classifier
    from app.orchestration.graph import build_graph
    from app.orchestration.intents import PLAYER_INTENTS
    from tests.voice_corpus import CASES

    create_app()
    graph = build_graph(checkpointer=MemorySaver())
    app_only = rss_mb()
    t0 = time.perf_counter()
    status = onnx_classifier.load(bundle, threads=1)
    load_s = time.perf_counter() - t0
    assert status == "onnx", status
    model = onnx_classifier.active()
    loaded = rss_mb()

    corpus = [normalize(t) for t, _, _ in CASES]
    test = (
        [r["norm"] for r in read_jsonl(BUILD / "test.jsonl")] if (BUILD / "test.jsonl").exists() else corpus
    )
    player = [t for t, i, _ in CASES if i in {p.value for p in PLAYER_INTENTS}]
    result = {
        "bundle": bundle.name,
        "model_bytes": (bundle / "model.onnx").stat().st_size,
        "python": sys.version.split()[0],
        "cpu": os.cpu_count(),
        "rss_mb": {
            "python_baseline": round(base, 1),
            "backend_app_imported": round(app_only, 1),
            "with_onnx_loaded": round(loaded, 1),
            "onnx_delta": round(loaded - app_only, 1),
        },
        "load_seconds": round(load_s, 2),
        "uncapped": measure(model, corpus, test, graph, player),
    }
    samples = result["uncapped"].pop("_cpu_samples")
    result["rss_mb"]["after_benchmark"] = round(rss_mb(), 1)
    # model, not measurement: this laptop's per-call CPU time run through a CFS 10 ms / 100 ms quota; slowdown 2 =
    # a server core half as fast as this laptop's boosted one (Render doesn't publish its CPU)
    result["cfs_0.1cpu_estimate"] = {
        f"slowdown_{f}": {k: pct([cfs_latency(c, f) for c in v]) for k, v in samples.items()}
        for f in (1.0, 2.0)
    }
    if args.cpu_cap:
        cap_cpu(args.cpu_cap)
        capped = measure(model, corpus[:150], test[:150], graph, player[:150])
        capped.pop("_cpu_samples")
        capped["sparse_classify"] = {
            "gap_s": args.sparse_gap,
            **sparse(model, corpus[: args.sparse_n], args.sparse_gap),
        }
        result[f"cpu_cap_{args.cpu_cap}"] = capped
    REPORTS.mkdir(parents=True, exist_ok=True)
    name = "serving_bench" + (f"_{args.name}" if args.name else "")
    name += (f"_cap{args.cpu_cap}" if args.cpu_cap else "") + ".json"
    (REPORTS / name).write_text(json.dumps(result, indent=2, ensure_ascii=False), encoding="utf-8")
    print(json.dumps(result, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
