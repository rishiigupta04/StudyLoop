"""Row-by-row review of generated labels → data/label_review.jsonl (committed; dataset.py applies it).

    ml/.venv/Scripts/python ml/review.py queue disagree  OUT.json   # every paraphrase / base the judge disputes
    ml/.venv/Scripts/python ml/review.py queue test      OUT.json   # every val + test row, agreed or not
    ml/.venv/Scripts/python ml/review.py queue cl        OUT.json   # every train row confident learning flags
    ml/.venv/Scripts/python ml/review.py apply OUT.json DECISIONS.json [--mark-kept]

A queue is a numbered list (deterministic order) written to OUT.json and printed. DECISIONS.json maps a queue number
to {"decision": "relabel" | "drop" | "keep", "intent": "...", "note": "..."}. With --mark-kept every queued row
without a decision is recorded as reviewed-and-kept, so the file shows what was looked at, not only what changed.
Review policy: ml/review_brief.md (the labeling rules of backend/tests/voice_corpus.py + corpus precedents); a row
that is ambiguous even to a human, or not something a student would say, is dropped rather than forced into a
class. Every decision records its reviewer (REVIEWER below) and a note.
"""

from __future__ import annotations

import json
import sys
from datetime import date
from pathlib import Path

from common import DATA, INTENTS, read_jsonl, write_jsonl
from dataset import _split_bases
from sources import load_bases

REVIEW = DATA / "label_review.jsonl"
REVIEWER = f"Claude (Opus 5.5), {date.today():%d %b %Y}"


def _reviewed() -> set[str]:
    return {r["text"] for r in read_jsonl(REVIEW)} if REVIEW.exists() else set()


def _rows() -> list[dict]:
    bases = load_bases()
    by_id = {b["base_id"]: b for b in bases}
    split = _split_bases(bases)
    checks = {c["text"]: c["label"] for c in read_jsonl(DATA / "paraphrase_checks.jsonl")}
    reviewed = _reviewed()
    rows, seen = [], set()
    for b in bases:
        if b["source"] == "hw" and b["text"] not in seen:
            seen.add(b["text"])
            rows.append(
                {
                    "text": b["text"],
                    "was": b["intent"],
                    "judge": checks.get(b["text"]),
                    "kind": "base",
                    "split": split[b["base_id"]],
                    "base": b["text"],
                }
            )
    for p in read_jsonl(DATA / "paraphrases.jsonl"):
        if p.get("skipped") or p["base_id"] not in by_id or p["text"] in seen:
            continue
        seen.add(p["text"])
        b = by_id[p["base_id"]]
        rows.append(
            {
                "text": p["text"],
                "was": b["intent"],
                "judge": checks.get(p["text"]),
                "kind": "para",
                "split": split[p["base_id"]],
                "base": b["text"],
            }
        )
    for r in rows:
        r["already_reviewed"] = r["text"] in reviewed
    return rows


def queue(kind: str, out: Path) -> None:
    rows = _rows()
    if kind == "disagree":
        sel = [
            r for r in rows if r["judge"] is not None and r["judge"] != r["was"] and not r["already_reviewed"]
        ]
    elif kind == "test":  # val too: both are scored, so neither may carry a label no human looked at
        sel = [r for r in rows if r["split"] in ("val", "test") and not r["already_reviewed"]]
    elif kind == "cl":
        by_text = {r["text"]: r for r in rows}
        sel = []
        for n in read_jsonl(DATA / "label_noise.jsonl"):
            if n["status"] != "flag" or n["base_id"].startswith(
                "vc-"
            ):  # the corpus is gold: reported, not relabeled
                continue
            r = by_text.get(n["text"]) or {  # a CLINC/SNIPS negative
                "text": n["text"],
                "was": n["label"],
                "judge": None,
                "kind": n["kind"],
                "split": "train",
                "base": n["text"],
                "already_reviewed": False,
            }
            if not r["already_reviewed"] and r["text"] not in _reviewed():
                sel.append({**r, "cl_suggest": n["suggest"], "cl_p_label": n["p_label"]})
    else:
        raise SystemExit("queue kind: disagree | test | cl")
    sel.sort(key=lambda r: (r["was"], str(r["judge"]), str(r.get("cl_suggest")), r["base"], r["text"]))
    items = [{"n": n, "queue": kind, **r} for n, r in enumerate(sel, 1)]
    out.write_text(json.dumps(items, ensure_ascii=False, indent=1), encoding="utf-8")
    for it in items:
        mark = "" if it["judge"] in (None, it["was"]) else f" judge={it['judge']}"
        mark += f" cl={it['cl_suggest']}" if it.get("cl_suggest") else ""
        print(
            f"{it['n']:4} [{it['split'][:2]}|{it['kind'][0]}] {it['was']}{mark} :: {it['text']}   <= {it['base']}"
        )
    print(f"{len(items)} rows → {out}")


def apply(queue_file: Path, decisions_file: Path, mark_kept: bool) -> None:
    items = {it["n"]: it for it in json.loads(queue_file.read_text(encoding="utf-8"))}
    decisions = {int(k): v for k, v in json.loads(decisions_file.read_text(encoding="utf-8")).items()}
    existing = list(read_jsonl(REVIEW)) if REVIEW.exists() else []
    done = {r["text"] for r in existing}
    added = 0
    for n, it in items.items():
        d = decisions.get(n)
        if d is None and not mark_kept:
            continue
        d = d or {"decision": "keep"}
        decision = d["decision"]
        intent = d.get("intent") or it["was"]
        assert decision in ("keep", "relabel", "drop"), d
        assert intent in INTENTS, d
        if it["text"] in done:
            continue
        existing.append(
            {
                "text": it["text"],
                "decision": decision,
                "intent": intent,
                "was": it["was"],
                "judge": it["judge"],
                "kind": it["kind"],
                "queue": it.get("queue", ""),
                "split": it.get("split", ""),
                "note": d.get("note", ""),
                "reviewer": REVIEWER,
            }
        )
        done.add(it["text"])
        added += 1
    existing.sort(key=lambda r: (r["was"], r["text"]))
    write_jsonl(REVIEW, existing)
    print(f"+{added} decisions → {REVIEW} ({len(existing)} total)")


if __name__ == "__main__":
    if len(sys.argv) >= 4 and sys.argv[1] == "queue":
        queue(sys.argv[2], Path(sys.argv[3]))
    elif len(sys.argv) >= 4 and sys.argv[1] == "apply":
        apply(Path(sys.argv[2]), Path(sys.argv[3]), "--mark-kept" in sys.argv)
    else:
        raise SystemExit(__doc__)
