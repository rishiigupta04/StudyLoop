"""Metrics for the CO4 table: accuracy, macro-F1, per-intent F1, confusion matrix with the §4 pairs called out,
temperature scaling, and the τ sweep (fast-path coverage vs misfire rate)."""

from __future__ import annotations

import math

import numpy as np

from common import FAST_PATH, INTENTS, PAIRS

ABBR = {
    "PLAY": "PLAY",
    "PAUSE": "PAUS",
    "SEEK_BACK": "BACK",
    "SEEK_FORWARD": "FWD",
    "SEEK_ABSOLUTE": "ABS",
    "REPLAY": "RPLY",
    "SPEED": "SPD",
    "VOLUME": "VOL",
    "SEMANTIC_SEEK": "SEM",
    "ASK": "ASK",
    "SUMMARIZE": "SUM",
    "TAKE_NOTE": "NOTE",
    "STOP_SPEAKING": "STOP",
    "OOS": "OOS",
}


def classification_report(y_true: list[str], y_pred: list[str]) -> dict:
    """Accuracy, macro-F1 over the intents present in y_true, per-intent P/R/F1, confusion matrix, §4 pairs."""
    n = len(y_true)
    labels = [i for i in INTENTS if i in set(y_true)]
    idx = {name: k for k, name in enumerate(INTENTS)}
    cm = np.zeros((len(INTENTS), len(INTENTS)), dtype=int)
    for t, p in zip(y_true, y_pred, strict=True):
        cm[idx[t], idx[p]] += 1
    per: dict[str, dict] = {}
    for name in INTENTS:
        k = idx[name]
        tp = cm[k, k]
        support = int(cm[k].sum())
        predicted = int(cm[:, k].sum())
        prec = tp / predicted if predicted else 0.0
        rec = tp / support if support else 0.0
        f1 = 2 * prec * rec / (prec + rec) if prec + rec else 0.0
        per[name] = {"precision": prec, "recall": rec, "f1": f1, "support": support}
    pairs = []
    for a, b in PAIRS:
        pairs.append(
            {
                "pair": f"{a} / {b}",
                "a_as_b": int(cm[idx[a], idx[b]]),
                "b_as_a": int(cm[idx[b], idx[a]]),
                "support_a": per[a]["support"],
                "support_b": per[b]["support"],
            }
        )
    return {
        "n": n,
        "accuracy": float(np.trace(cm) / n) if n else 0.0,
        "macro_f1": float(np.mean([per[i]["f1"] for i in labels])) if labels else 0.0,
        "per_intent": per,
        "confusion": cm.tolist(),
        "pairs": pairs,
    }


def confusion_markdown(cm: list[list[int]], title: str = "") -> str:
    """Rows = true intent, columns = predicted. Off-diagonal cells of a §4 pair are **bold**."""
    pair_cells = {(a, b) for a, b in PAIRS} | {(b, a) for a, b in PAIRS}
    head = "| true \\ pred | " + " | ".join(ABBR[i] for i in INTENTS) + " |"
    sep = "|---|" + "---:|" * len(INTENTS)
    lines = [f"**{title}**" if title else "", "", head, sep]
    for r, name in enumerate(INTENTS):
        cells = []
        for c, other in enumerate(INTENTS):
            v = cm[r][c]
            if v == 0:
                cells.append("·")
            elif r != c and (name, other) in pair_cells:
                cells.append(f"**{v}**")
            else:
                cells.append(str(v))
        lines.append(f"| {ABBR[name]} | " + " | ".join(cells) + " |")
    return "\n".join(lines)


# ---------------------------------------------------------------------------------------------- calibration
def softmax(z: np.ndarray) -> np.ndarray:
    z = z - z.max(axis=-1, keepdims=True)
    e = np.exp(z)
    return e / e.sum(axis=-1, keepdims=True)


def nll(logits: np.ndarray, y: np.ndarray, t: float) -> float:
    p = softmax(logits / t)
    return float(-np.mean(np.log(p[np.arange(len(y)), y] + 1e-12)))


def fit_temperature(logits: np.ndarray, y: np.ndarray) -> float:
    """Temperature scaling (Guo et al., 2017): one scalar T minimizing validation NLL."""
    from scipy.optimize import minimize_scalar

    res = minimize_scalar(lambda lt: nll(logits, y, float(np.exp(lt))), bounds=(-3, 3), method="bounded")
    return float(np.exp(res.x))


def ece(probs: np.ndarray, y: np.ndarray, bins: int = 15) -> float:
    conf = probs.max(axis=1)
    pred = probs.argmax(axis=1)
    edges = np.linspace(0, 1, bins + 1)
    total = 0.0
    for lo, hi in zip(edges[:-1], edges[1:], strict=True):
        m = (conf > lo) & (conf <= hi)
        if m.any():
            total += m.mean() * abs((pred[m] == y[m]).mean() - conf[m].mean())
    return float(total)


# ---------------------------------------------------------------------------------------------- τ sweep
def routing(probs: np.ndarray, y: np.ndarray, tau: float | dict[str, float]) -> dict:
    """What the graph would do: act directly when the top intent isn't OOS and its confidence ≥ τ(intent);
    otherwise hand the turn to llm_router.

    coverage          in-scope turns (true intent ≠ OOS) that skip the router
    misfire_rate      directly-routed turns that do the wrong thing (1 − precision of the direct path)
    fast_coverage     true player-intent turns that take the fast path with the right intent
    fast_misfire      fast-path actions (predicted player intent, direct) that are wrong: the costly error
    oos_leak          true OOS turns that trigger a direct action
    """
    oos = INTENTS.index("OOS")
    fast = np.array([name in FAST_PATH for name in INTENTS])
    pred = probs.argmax(axis=1)
    conf = probs.max(axis=1)
    thr = np.array([tau.get(INTENTS[k], tau["*"]) if isinstance(tau, dict) else tau for k in pred])
    direct = (pred != oos) & (conf >= thr)
    in_scope = y != oos
    correct = pred == y
    fast_direct = direct & fast[pred]
    return {
        "coverage": float((direct & in_scope).sum() / max(in_scope.sum(), 1)),
        "misfire_rate": float((direct & ~correct).sum() / max(direct.sum(), 1)),
        "misfires": int((direct & ~correct).sum()),
        "direct": int(direct.sum()),
        "fast_coverage": float((fast_direct & correct & fast[y]).sum() / max(fast[y].sum(), 1)),
        "fast_misfire": float((fast_direct & ~correct).sum() / max(fast_direct.sum(), 1)),
        "oos_leak": float((direct & ~in_scope).sum() / max((~in_scope).sum(), 1)),
        "n": len(y),
    }


TAU_GRID = [round(x, 2) for x in np.arange(0.30, 0.991, 0.01)]


def sweep(probs: np.ndarray, y: np.ndarray) -> list[dict]:
    return [{"tau": t, **routing(probs, y, t)} for t in TAU_GRID]


def pick_tau(curve: list[dict], max_misfire: float) -> float:
    """Lowest τ whose misfire rate is within budget (max coverage under the constraint)."""
    ok = [r for r in curve if r["misfire_rate"] <= max_misfire]
    return ok[0]["tau"] if ok else curve[-1]["tau"]


def per_intent_tau(
    probs: np.ndarray, y: np.ndarray, global_tau: float, max_misfire: float, min_support: int = 25
) -> dict[str, float]:
    """τ per predicted intent: the lowest threshold keeping that intent's direct-path precision ≥ 1 − budget.
    Intents with too few validation predictions keep the global τ (no per-intent overfitting on 5 rows)."""
    pred = probs.argmax(axis=1)
    conf = probs.max(axis=1)
    out: dict[str, float] = {"*": global_tau}
    for k, name in enumerate(INTENTS):
        if name == "OOS":
            continue
        m = pred == k
        if m.sum() < min_support:
            continue
        chosen = None
        for t in TAU_GRID:
            sel = m & (conf >= t)
            if sel.sum() == 0:
                break
            if (y[sel] != k).mean() <= max_misfire:
                chosen = t
                break
        out[name] = chosen if chosen is not None else TAU_GRID[-1]
    return out


# ---------------------------------------------------------------------------------------------- serving
CFS_QUOTA_MS, CFS_PERIOD_MS = 10.0, 100.0  # Docker/Linux `--cpus 0.1`: 10 ms of CPU per 100 ms period


def cfs_latency(cpu_ms: float, slowdown: float = 1.0) -> float:
    """Wall time of a call needing `cpu_ms` of CPU under a CFS quota, starting with a full quota (a voice turn
    arrives after seconds of idle): each exhausted quota costs the rest of its period."""
    c = cpu_ms * slowdown
    extra_periods = max(0, math.ceil(c / CFS_QUOTA_MS) - 1)
    return c + extra_periods * (CFS_PERIOD_MS - CFS_QUOTA_MS)
