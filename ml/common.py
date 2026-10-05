"""Paths and shared helpers for the Tier 1c pipeline (ml/).

The text preprocessing is the backend's own: `studyloop_nlp.normalize` is imported from backend/, never
copied, so training data and serving can't drift apart (roadmap D6). The label set is the backend's frozen
taxonomy (`app.orchestration.intents.Intent`).
"""

from __future__ import annotations

import hashlib
import json
import os
import sys
from collections.abc import Iterable, Iterator
from pathlib import Path

ML = Path(__file__).resolve().parent
REPO = ML.parent
BACKEND = REPO / "backend"
DATA = ML / "data"
EXTERNAL = DATA / "external"  # downloaded datasets (CLINC150, SNIPS) — gitignored
BUILD = DATA / "build"  # assembled splits — gitignored (they contain the external rows)
REPORTS = ML / "reports"  # committed metrics / tables
SAVED = ML / "saved_models"  # checkpoints + ONNX bundles — gitignored
RUNS = ML / "runs"  # per-run predictions / logs — gitignored

if str(BACKEND) not in sys.path:
    sys.path.insert(0, str(BACKEND))

from app.orchestration.intents import PLAYER_INTENTS, Intent  # noqa: E402
from studyloop_nlp import __version__ as NLP_VERSION  # noqa: E402
from studyloop_nlp import normalize  # noqa: E402

INTENTS: list[str] = [i.value for i in Intent]  # label order = the enum's order, fixed
LABEL2ID = {name: k for k, name in enumerate(INTENTS)}
FAST_PATH = {i.value for i in PLAYER_INTENTS}
STYLES = ("en", "hinglish", "hi")

# data plan §4: the confusable pairs the confusion matrix calls out
PAIRS: list[tuple[str, str]] = [
    ("ASK", "REPLAY"),
    ("STOP_SPEAKING", "PAUSE"),
    ("SEMANTIC_SEEK", "ASK"),
    ("SUMMARIZE", "ASK"),
    ("TAKE_NOTE", "ASK"),
    ("SEEK_BACK", "REPLAY"),
    ("VOLUME", "SPEED"),
    ("SEEK_ABSOLUTE", "SEEK_FORWARD"),
]

__all__ = [
    "BUILD",
    "DATA",
    "EXTERNAL",
    "FAST_PATH",
    "INTENTS",
    "LABEL2ID",
    "ML",
    "NLP_VERSION",
    "PAIRS",
    "REPO",
    "REPORTS",
    "RUNS",
    "SAVED",
    "STYLES",
    "normalize",
    "read_jsonl",
    "stable_hash",
    "write_jsonl",
]


def stable_hash(text: str, salt: str = "") -> int:
    """Process-independent hash (Python's hash() is salted per run)."""
    return int.from_bytes(hashlib.sha1(f"{salt}|{text}".encode()).digest()[:8], "big")


def read_jsonl(path: Path) -> Iterator[dict]:
    with open(path, encoding="utf-8") as f:
        for line in f:
            if line.strip():
                yield json.loads(line)


def write_jsonl(path: Path, rows: Iterable[dict]) -> int:
    """Atomic: written to a temp file and swapped in, so a script reading the file concurrently (the judge while
    the generator appends) never sees half a line."""
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    n = 0
    with open(tmp, "w", encoding="utf-8", newline="\n") as f:
        for row in rows:
            f.write(json.dumps(row, ensure_ascii=False) + "\n")
            n += 1
    os.replace(tmp, path)
    return n
