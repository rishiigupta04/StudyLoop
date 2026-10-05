"""Assemble the synthetic Tier 1c dataset → data/build/{train,val,test}.jsonl + stats.json (gitignored).

    ml/.venv/Scripts/python ml/dataset.py

Inputs (all committed except the external negatives, which download_oos.py fetches):
  sources.load_bases()          voice corpus (vc, train only) + hand-written bases (hw, split by base)
  data/paraphrases.jsonl        LLM paraphrases (paraphrase.py); each inherits its base's split
  data/paraphrase_checks.jsonl  blind second-model labels (verify_paraphrases.py)
  data/label_noise.jsonl        confident-learning pass/flag for train rows the judge never labeled (label_noise.py)
  data/label_review.jsonl       human decisions on every judge disagreement, every CL flag and every val/test row
  data/external/                CLINC150 + SNIPS out-of-scope negatives, split by source intent

Label gate for a generated row, first match wins: a human review decision; the judge (agree = keep, disagree = drop
until reviewed); for a TRAIN row the judge never saw, confident learning (passed = keep, flagged = drop until
reviewed); otherwise dropped. Every val/test row is meant to be reviewed by hand (review.py queue test), so the
gate never decides one; stats.json counts any that slipped through (`valtest_unreviewed`, reported by evaluate.py).

Every row goes through the backend's `studyloop_nlp.normalize()` — the model trains on `norm`, exactly what the
graph's normalize_input node hands the classifier. Split rules (see tests/test_split.py):
  - a base and all its paraphrases share one split, so no paraphrase of a test base is ever trained on;
  - voice-corpus bases are train-only (the regex was tuned on them — scoring on them isn't accuracy);
  - a normalized string lives in one split only (train > val > test), so test never repeats a training string.
"""

from __future__ import annotations

import json
import random
from collections import Counter, defaultdict

from common import (
    BUILD,
    DATA,
    EXTERNAL,
    INTENTS,
    NLP_VERSION,
    normalize,
    read_jsonl,
    stable_hash,
    write_jsonl,
)
from download_oos import EXCLUDE, SNIPS_INTENTS
from sources import load_bases

SPLIT_SALT = "tier1c-v1"
TEST_FRAC, VAL_FRAC = 0.20, 0.15  # of each (intent, style) group of hand-written bases
EXT_PER_CLINC_INTENT, EXT_PER_SNIPS_INTENT = 3, 10
EXT_TEST_FRAC, EXT_VAL_FRAC = 0.15, 0.15  # of external source intents
SPLITS = ("train", "val", "test")


def _split_bases(bases: list[dict]) -> dict[str, str]:
    """base_id → split. Stratified by (intent, style) and deterministic (ordered by a salted hash)."""
    out: dict[str, str] = {}
    groups: dict[tuple[str, str], list[str]] = defaultdict(list)
    for b in bases:
        if b["source"] == "vc":
            out[b["base_id"]] = "train"
        else:
            groups[(b["intent"], b["style"])].append(b["base_id"])
    for ids in groups.values():
        ids.sort(key=lambda i: stable_hash(i, SPLIT_SALT))
        n_test, n_val = round(len(ids) * TEST_FRAC), round(len(ids) * VAL_FRAC)
        for k, i in enumerate(ids):
            out[i] = "test" if k < n_test else "val" if k < n_test + n_val else "train"
    return out


def _external_rows() -> list[dict]:
    """Sampled CLINC150/SNIPS negatives labelled OOS; a whole source intent lands in one split."""
    clinc_path = EXTERNAL / "clinc150_full.json"
    if not clinc_path.exists():
        raise SystemExit("external negatives missing: run ml/download_oos.py first")
    rng = random.Random(SPLIT_SALT)
    by_intent: dict[str, list[str]] = defaultdict(list)
    for text, intent in json.loads(clinc_path.read_text(encoding="utf-8"))["train"]:
        if intent not in EXCLUDE:
            by_intent[f"clinc:{intent}"].append(text)
    for intent in SNIPS_INTENTS:
        by_intent[f"snips:{intent}"] = json.loads(
            (EXTERNAL / f"snips_{intent}.json").read_text(encoding="utf-8")
        )
    sources = sorted(by_intent, key=lambda s: stable_hash(s, SPLIT_SALT))
    n_test, n_val = round(len(sources) * EXT_TEST_FRAC), round(len(sources) * EXT_VAL_FRAC)
    rows = []
    for k, src in enumerate(sources):
        split = "test" if k < n_test else "val" if k < n_test + n_val else "train"
        n = EXT_PER_SNIPS_INTENT if src.startswith("snips:") else EXT_PER_CLINC_INTENT
        texts = sorted(set(by_intent[src]))
        for text in rng.sample(texts, min(n, len(texts))):
            rows.append(
                {
                    "text": text,
                    "intent": "OOS",
                    "base_id": f"ext-{src}",
                    "kind": "external",
                    "style": "en",
                    "source": src.split(":")[0],
                    "split": split,
                }
            )
    return rows


def _load_reviews() -> dict[str, dict]:
    path = DATA / "label_review.jsonl"
    return {r["text"]: r for r in read_jsonl(path)} if path.exists() else {}


def _load_label_noise() -> dict[str, dict]:
    path = DATA / "label_noise.jsonl"
    return {r["text"]: r for r in read_jsonl(path)} if path.exists() else {}


def build(allow_unjudged: bool = False, out=BUILD) -> dict:
    """allow_unjudged: development only (pipeline dry runs, and the candidate pool label_noise.py scores); never
    for reported numbers."""
    bases = load_bases()
    split_of = _split_bases(bases)
    checks_path = DATA / "paraphrase_checks.jsonl"
    checks = {c["text"]: c["label"] for c in read_jsonl(checks_path)} if checks_path.exists() else {}
    reviews = _load_reviews()
    noise = {} if allow_unjudged else _load_label_noise()
    drops: Counter[str] = Counter()
    gated: Counter[str] = Counter()
    rows: list[dict] = []

    def gate(text: str, intent: str, split: str) -> str | None:
        """The label a generated row trains with, or None to drop it."""
        judged = checks.get(text)
        review = reviews.get(text)
        if review is not None:  # a human looked at it: that decision wins
            gated["review"] += 1
            return review["intent"] if review["decision"] in ("keep", "relabel") else None
        if judged is not None:
            if judged == intent:
                gated["judge_agrees"] += 1
                return intent
            drops["judge_disagrees_unreviewed"] += 1
            return None
        cl = noise.get(text)
        if split == "train" and cl is not None and cl["label"] == intent:
            if cl["status"] == "pass":
                gated["confident_learning_pass"] += 1
                return intent
            drops["cl_flagged_unreviewed"] += 1
            return None
        drops["unjudged"] += 1
        return intent if allow_unjudged else None

    for b in bases:
        if b["source"] == "vc":
            intent = b["intent"]  # the corpus is gold (and a regression suite); never gated
        else:
            intent = reviews[b["text"]]["intent"] if b["text"] in reviews else b["intent"]
            if b["text"] in reviews and reviews[b["text"]]["decision"] == "drop":
                drops["base_dropped_in_review"] += 1
                continue
        rows.append(
            {
                "text": b["text"],
                "intent": intent,
                "base_id": b["base_id"],
                "kind": "base",
                "style": b["style"],
                "source": b["source"],
                "split": split_of[b["base_id"]],
            }
        )
    base_by_id = {b["base_id"]: b for b in bases}
    for p in read_jsonl(DATA / "paraphrases.jsonl"):
        if p.get("skipped"):
            continue
        base = base_by_id.get(p["base_id"])
        if base is None:
            drops["orphan_paraphrase"] += 1  # its base was edited or removed since generation
            continue
        # a paraphrase follows its base's review: a dropped (ambiguous) base takes its paraphrases with it unless
        # one was reviewed on its own; a relabeled base relabels them
        base_review = reviews.get(base["text"]) if base["source"] == "hw" else None
        if base_review is not None and base_review["decision"] == "drop" and p["text"] not in reviews:
            drops["paraphrase_of_dropped_base"] += 1
            continue
        base_intent = base_review["intent"] if base_review is not None else base["intent"]
        intent = gate(p["text"], base_intent, split_of[p["base_id"]])
        if intent is None:
            continue
        rows.append(
            {
                "text": p["text"],
                "intent": intent,
                "base_id": p["base_id"],
                "kind": "para",
                "style": p["style"],
                "source": base["source"],
                "split": split_of[p["base_id"]],
            }
        )
    for r in (
        _external_rows()
    ):  # a reviewed CLINC/SNIPS row (flagged by confident learning) can be dropped/relabeled
        review = reviews.get(r["text"])
        if review is not None and review["decision"] == "drop":
            drops["external_dropped_in_review"] += 1
            continue
        if review is not None:
            r["intent"] = review["intent"]
        rows.append(r)

    # normalize, then dedup: one normalized string → one split (train > val > test) and one label
    for r in rows:
        r["norm"] = normalize(r["text"])
    rank = {"train": 0, "val": 1, "test": 2}
    kind_rank = {"base": 0, "para": 1, "external": 2}
    by_norm: dict[str, list[dict]] = defaultdict(list)
    for r in rows:
        if r["norm"]:
            by_norm[r["norm"]].append(r)
        else:
            drops["empty_after_normalize"] += 1
    kept: list[dict] = []
    for _norm, group in by_norm.items():
        group.sort(key=lambda r: (rank[r["split"]], kind_rank[r["kind"]]))
        labels = {r["intent"] for r in group}
        if len(labels) > 1:
            gold = [r for r in group if r["kind"] == "base"]
            if gold and len({r["intent"] for r in gold}) == 1:
                group = [r for r in group if r["intent"] == gold[0]["intent"]]
                drops["label_conflict_resolved_by_base"] += 1
            else:
                drops["label_conflict_dropped"] += len(group)
                continue
        winner = group[0]
        drops["duplicate"] += len(group) - 1
        if any(r["split"] != winner["split"] for r in group):
            drops["cross_split_duplicate"] += 1
        kept.append(winner)

    by_split = {s: [r for r in kept if r["split"] == s] for s in SPLITS}
    # every scored row, the CLINC/SNIPS negatives included (one SNIPS source turned out to hold "play <song>" lines)
    unreviewed = Counter(r["split"] for r in kept if r["split"] != "train" and r["text"] not in reviews)
    for s, rs in by_split.items():
        rs.sort(key=lambda r: (r["intent"], r["base_id"], r["norm"]))
        write_jsonl(out / f"{s}.jsonl", rs)
    stats = {
        "nlp_version": NLP_VERSION,
        "allow_unjudged": allow_unjudged,
        "paraphrase_label_gate": dict(gated),
        "valtest_unreviewed": dict(unreviewed),
        "rows": {s: len(rs) for s, rs in by_split.items()},
        "per_intent": {
            s: {i: sum(r["intent"] == i for r in rs) for i in INTENTS} for s, rs in by_split.items()
        },
        "per_kind": {s: dict(Counter(r["kind"] for r in rs)) for s, rs in by_split.items()},
        "per_style": {s: dict(Counter(r["style"] for r in rs)) for s, rs in by_split.items()},
        "drops": dict(drops),
        "judge": {
            "checked": len(checks),
            "agree_with_base_intent": sum(
                1
                for p in read_jsonl(DATA / "paraphrases.jsonl")
                if not p.get("skipped")
                and p["base_id"] in base_by_id
                and checks.get(p["text"]) == p["intent"]
            ),
            "reviewed": len(reviews),
            "confident_learning": dict(Counter(r["status"] for r in noise.values())),
        },
    }
    (out / "stats.json").write_text(json.dumps(stats, indent=2), encoding="utf-8")
    return stats


def load_split(name: str) -> list[dict]:
    path = BUILD / f"{name}.jsonl"
    if not path.exists():
        raise SystemExit(f"{path} missing: run ml/dataset.py first")
    return list(read_jsonl(path))


if __name__ == "__main__":
    import sys

    s = build(allow_unjudged="--allow-unjudged" in sys.argv)
    keys = ("rows", "drops", "judge", "paraphrase_label_gate", "valtest_unreviewed")
    print(json.dumps({k: s[k] for k in keys}, indent=2))
    if s["valtest_unreviewed"] and not s["allow_unjudged"]:
        print(
            f"WARNING: val/test rows without a human review: {s['valtest_unreviewed']} (review.py queue test)"
        )
    for split in SPLITS:
        print(split, s["per_intent"][split])
