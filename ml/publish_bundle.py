"""Publish the ONNX intent bundle to a Hugging Face model repo and pin it with backend/bundle.lock.json.

    ml/.venv/Scripts/python ml/publish_bundle.py --write-lock                  # lock only, no network
    ml/.venv/Scripts/python ml/publish_bundle.py --write-card card.md          # the model card, to read first
    HF_WRITE_TOKEN=... ml/.venv/Scripts/python ml/publish_bundle.py --push     # upload, prove the round trip, lock

The Docker build (backend/Dockerfile) runs backend/scripts/fetch_intent_bundle.py, which downloads exactly the
files and revision named in the lock from the public repo, checks every sha256 and fails the build on a mismatch.
The lock lives under backend/ because render.yaml has rootDir: backend, so the Docker build context is backend/.

    {"schema": 1, "repo": "<owner>/<name>", "revision": null | "<40 hex>", "version": "<meta.json version>",
     "files": {"model.onnx": {"bytes": n, "sha256": "..."}, "tokenizer.json": ..., "labels.json": ...,
               "calibration.json": ..., "meta.json": ...}}

`revision: null` means "not published yet". Download URL of file F: <base-url>/<repo>/resolve/<revision>/<F>.

--write-lock   read the five files of --bundle (default: saved_models/intent-onnx/LATEST), refuse anything that
               does not hold together (missing file, version != directory name, sha256 differing from meta.json,
               no tau / temperature) and write the lock atomically. An existing lock's revision is kept only when
               repo, version and every sha256/bytes are unchanged; otherwise it goes back to null.
--write-card   write the model card (the README.md --push uploads) to a path, to read before the first push
--push         HF_WRITE_TOKEN (environment only, never an argument, never printed) → create the model repo if
               needed (public), upload the five files + a generated model card (README.md) in ONE commit, take the
               commit id as the revision, then prove it: run the build's own fetcher against that revision, with
               no token, into a temp dir. Only after that does the lock get its revision. If anything fails once
               the commit exists, its id is printed (re-running --push is safe: identical files make no new commit).

The model card is generated from meta.json, calibration.json and reports/metrics.json: every number in it is
computed, none typed. The owner in --repo's default is NOT confirmed: confirm the Hugging Face username first.
"""

from __future__ import annotations

import argparse
import hashlib
import importlib
import json
import math
import os
import re
import shutil
import subprocess
import sys
import tempfile
import time
from dataclasses import dataclass
from pathlib import Path

from common import BACKEND, REPORTS, SAVED

FILES = ("model.onnx", "tokenizer.json", "labels.json", "calibration.json", "meta.json")
HASHED_IN_META = ("model.onnx", "tokenizer.json")  # export_onnx.py records these two in meta.json["files"]
DEFAULT_REPO = "rishiigupta04/studyloop-intent"  # owner NOT confirmed: --repo, and see docs/TIER1C_DEPLOY.md
DEFAULT_LOCK = BACKEND / "bundle.lock.json"
FETCHER = BACKEND / "scripts" / "fetch_intent_bundle.py"
TOKEN_ENV = "HF_WRITE_TOKEN"
SECRET_ENV = (TOKEN_ENV, "HF_TOKEN", "HUGGING_FACE_HUB_TOKEN")  # none of these reaches the fetcher
LOCK_SCHEMA = 1
ROUND_TRIP_ATTEMPTS = 3  # the CDN can lag a few seconds behind the commit
ROUND_TRIP_RETRY_SECONDS = 5.0
ROUND_TRIP_TIMEOUT_SECONDS = 900

_SHA = re.compile(r"^[0-9a-f]{64}$")
_REVISION = re.compile(r"^[0-9a-f]{40}$")
_REPO = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{0,95}/[A-Za-z0-9][A-Za-z0-9._-]{0,95}$")
_TOKEN_SHAPE = re.compile(r"hf_[A-Za-z0-9]{8,}")
_BEARER = re.compile(r"(?i)\bbearer\s+[A-Za-z0-9._~+/=-]+")

REAL_SPEECH_CAVEAT = (
    "**Real speech is not measured yet.** The headline measurement for this model (the CO4 requirement of the "
    "course project it was built for) is at least 90 % accuracy on a real-speech test set: recorded commands "
    "from held-out speakers, reported per speech-to-text provider. That evaluation has not been run, so the "
    "headline is not measured yet. Every number below comes from text (hand-written commands, LLM-written "
    "paraphrases and negatives from public datasets), none from real speech: read them as a sanity check on "
    "clean text, not as the accuracy you will see on a microphone."
)

INTENT_GLOSS = {
    "PLAY": "resume playback",
    "PAUSE": "pause playback",
    "SEEK_BACK": "jump back by an amount of time",
    "SEEK_FORWARD": "jump forward by an amount of time",
    "SEEK_ABSOLUTE": "jump to a given timestamp",
    "REPLAY": "repeat the last few seconds",
    "SPEED": "change the playback speed",
    "VOLUME": "change the volume",
    "SEMANTIC_SEEK": "jump to where a named topic is explained",
    "ASK": "a question about the lecture content",
    "SUMMARIZE": "summarize the lecture so far",
    "TAKE_NOTE": "save a timestamped note",
    "STOP_SPEAKING": "silence the assistant's spoken answer (not the video)",
    "OOS": "out of scope: nothing should happen",
}
STYLE_GLOSS = {
    "en": "English",
    "hinglish": "Hindi-English written in Latin script",
    "hi": "Hindi-English code-mix, Hindi in Devanagari (as hosted speech-to-text writes it)",
    "hi_pure": "pure Devanagari Hindi",
    "external": "out-of-scope negatives from public intent datasets",
}


class PublishError(Exception):
    """A refusal with a message meant for the person running the script."""


# ----------------------------------------------------------------------------------------- secrets


def scrub(text: object, token: str | None = None) -> str:
    """The text with the write token (exact value, any hf_… shaped string, any bearer header) blanked out."""
    out = str(text)
    if token:
        out = out.replace(token, "[hf-token]")
    out = _TOKEN_SHAPE.sub("[hf-token]", out)
    return _BEARER.sub("Bearer [hidden]", out)


# ----------------------------------------------------------------------------------------- the bundle


@dataclass(frozen=True)
class Bundle:
    directory: Path
    version: str
    meta: dict
    calibration: dict
    labels: list[str]
    files: dict[str, dict]  # name → {"bytes": int, "sha256": str}, in FILES order, hashed from the real files


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def read_json(path: Path) -> object:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError) as exc:
        raise PublishError(f"{path} is not readable JSON ({type(exc).__name__}: {exc})") from None


def _number(value: object) -> bool:
    return isinstance(value, int | float) and not isinstance(value, bool) and math.isfinite(value)


def inspect_bundle(directory: Path, version: str | None = None) -> Bundle:
    """Read and verify a bundle directory; raises PublishError on anything that does not hold together.

    `version` defaults to the directory name (the contract: meta.json's version IS the directory name); the staged
    copy of a bundle lives in a temp dir, so push passes the real version for it."""
    directory = Path(directory)
    version = version or directory.name
    if not directory.is_dir():
        raise PublishError(
            f"{directory} is not a directory (export_onnx.py writes saved_models/intent-onnx/<version>)"
        )
    missing = [f for f in FILES if not (directory / f).is_file()]
    if missing:
        raise PublishError(f"{directory} is missing {missing} (run export_onnx.py, then calibrate.py)")

    meta = read_json(directory / "meta.json")
    if not isinstance(meta, dict):
        raise PublishError("meta.json is not a JSON object")
    if meta.get("version") != version:
        raise PublishError(
            f"meta.json says version {meta.get('version')!r} but the bundle directory is {version!r}: "
            "the version string must name the bundle (re-export, or point --bundle at the right directory)"
        )

    files: dict[str, dict] = {}
    for name in FILES:
        path = directory / name
        files[name] = {"bytes": path.stat().st_size, "sha256": sha256_file(path)}
    recorded = meta.get("files") if isinstance(meta.get("files"), dict) else {}
    for name in HASHED_IN_META:
        info = recorded.get(name)
        if not isinstance(info, dict) or "sha256" not in info:
            raise PublishError(f"meta.json records no sha256 for {name}: re-export the bundle")
        if (
            info["sha256"] != files[name]["sha256"]
            or info.get("bytes", files[name]["bytes"]) != files[name]["bytes"]
        ):
            raise PublishError(
                f"{name} does not match the sha256/bytes recorded in meta.json "
                f"(file {files[name]['sha256'][:12]}..., meta {str(info['sha256'])[:12]}...): the file changed after export"
            )

    calibration = read_json(directory / "calibration.json")
    if not isinstance(calibration, dict):
        raise PublishError("calibration.json is not a JSON object")
    for key in ("tau", "temperature"):
        if not _number(calibration.get(key)):
            raise PublishError(
                f"calibration.json has no numeric {key!r}: the bundle would serve without its routing threshold "
                "(run calibrate.py)"
            )
    if not 0 < calibration["tau"] <= 1 or calibration["temperature"] <= 0:
        raise PublishError(
            f"calibration.json has tau={calibration['tau']!r}, temperature={calibration['temperature']!r}: "
            "tau must be in (0, 1] and the temperature positive"
        )

    labels = read_json(directory / "labels.json")
    if not isinstance(labels, list) or not labels or not all(isinstance(x, str) for x in labels):
        raise PublishError("labels.json is not a non-empty list of label names")
    if isinstance(meta.get("labels"), list) and meta["labels"] != labels:
        raise PublishError(
            "labels.json and meta.json disagree on the label order (the logit order): re-export"
        )
    return Bundle(directory, version, meta, calibration, labels, files)


def resolve_bundle(arg: str | None) -> Path:
    """--bundle: a directory, a version name under saved_models/intent-onnx, or LATEST (the default)."""
    arg = arg or "LATEST"
    if arg != "LATEST" and Path(arg).is_dir():
        return Path(arg)
    root = SAVED / "intent-onnx"
    if arg == "LATEST":
        latest = root / "LATEST"
        if not latest.is_file():
            raise PublishError(f"{latest} not found: run export_onnx.py, or name a bundle with --bundle")
        arg = latest.read_text(encoding="utf-8").strip()
    return root / arg


# ----------------------------------------------------------------------------------------- the lock


def read_lock(path: Path) -> dict | None:
    """The existing lock, or None when there is none or it is not a usable lock (then nothing is kept from it)."""
    try:
        lock = json.loads(Path(path).read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None
    return lock if isinstance(lock, dict) else None


def decide_revision(
    previous: dict | None, repo: str, version: str, files: dict[str, dict]
) -> tuple[str | None, str]:
    """Keep a published revision only while repo, version and every file's sha256/bytes are unchanged."""
    if previous is None:
        return None, "no existing lock"
    revision = previous.get("revision")
    if revision is None:
        return None, "the existing lock has no revision"
    if not isinstance(revision, str) or not _REVISION.match(revision):
        return None, "the existing lock's revision is not a 40-hex commit id"
    if previous.get("repo") != repo:
        return None, f"repo changed ({previous.get('repo')!r} -> {repo!r})"
    if previous.get("version") != version:
        return None, f"version changed ({previous.get('version')!r} -> {version!r})"
    if previous.get("files") != files:
        changed = sorted(
            name
            for name in set(files) | set(previous.get("files") or {})
            if (previous.get("files") or {}).get(name) != files.get(name)
        )
        return None, f"files changed since that revision was published: {', '.join(changed)}"
    return revision, "repo, version and every sha256/bytes unchanged"


def build_lock(bundle: Bundle, repo: str, revision: str | None) -> dict:
    """The contract's lock, keys in contract order."""
    return {
        "schema": LOCK_SCHEMA,
        "repo": repo,
        "revision": revision,
        "version": bundle.version,
        "files": {name: dict(bundle.files[name]) for name in FILES},
    }


def derive_lock(bundle: Bundle, repo: str, previous: dict | None = None) -> tuple[dict, str]:
    revision, why = decide_revision(previous, repo, bundle.version, bundle.files)
    return build_lock(bundle, repo, revision), why


def lock_problems(lock: dict) -> list[str]:
    """Anything in `lock` that breaks the contract (the fetcher and the Docker build rely on every point)."""
    problems = []
    if list(lock) != ["schema", "repo", "revision", "version", "files"]:
        problems.append(
            f"keys are {list(lock)}, expected schema, repo, revision, version, files in that order"
        )
        return problems
    if lock["schema"] != LOCK_SCHEMA:
        problems.append(f"schema is {lock['schema']!r}, expected {LOCK_SCHEMA}")
    if not isinstance(lock["repo"], str) or not _REPO.match(lock["repo"]):
        problems.append(f"repo {lock['repo']!r} is not <owner>/<name>")
    if lock["revision"] is not None and not (
        isinstance(lock["revision"], str) and _REVISION.match(lock["revision"])
    ):
        problems.append(f"revision {lock['revision']!r} is neither null nor a 40-hex commit id")
    if not isinstance(lock["version"], str) or not lock["version"]:
        problems.append("version is empty")
    files = lock["files"]
    if not isinstance(files, dict) or list(files) != list(FILES):
        problems.append(
            f"files are {list(files) if isinstance(files, dict) else files!r}, expected {list(FILES)}"
        )
        return problems
    for name, info in files.items():
        if not isinstance(info, dict) or list(info) != ["bytes", "sha256"]:
            problems.append(f"{name}: expected exactly bytes, sha256")
        elif not isinstance(info["bytes"], int) or isinstance(info["bytes"], bool) or info["bytes"] < 0:
            problems.append(f"{name}: bytes must be a non-negative integer")
        elif not isinstance(info["sha256"], str) or not _SHA.match(info["sha256"]):
            problems.append(f"{name}: sha256 must be 64 lowercase hex characters")
    return problems


def render_lock(lock: dict) -> str:
    return json.dumps(lock, indent=2, ensure_ascii=False) + "\n"


def write_lock(path: Path, lock: dict) -> None:
    """Atomic: a temp file in the same directory, swapped in (a crash never leaves half a lock). UTF-8, LF."""
    problems = lock_problems(lock)
    if problems:
        raise PublishError("refusing to write a lock that breaks the contract: " + "; ".join(problems))
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_name(path.name + ".tmp")
    try:
        with open(tmp, "w", encoding="utf-8", newline="\n") as f:
            f.write(render_lock(lock))
        os.replace(tmp, path)
    except BaseException:
        tmp.unlink(missing_ok=True)
        raise


# ----------------------------------------------------------------------------------------- the model card


def _f3(x: float) -> str:
    return f"{x:.3f}"


def _pct(x: float) -> str:
    return f"{100 * x:.1f} %"


def _n(x: object) -> str:
    return f"{x:,}" if isinstance(x, int) and not isinstance(x, bool) else "?"


def _mb(n: int) -> str:
    return f"{n / 1e6:.1f} MB"


def _cell(text: object) -> str:
    return str(text).replace("|", "\\|").replace("\n", " ")


def _table(header: list[str], rows: list[list[object]], right: tuple[int, ...] = ()) -> list[str]:
    align = ["---:" if i in right else "---" for i in range(len(header))]
    lines = ["| " + " | ".join(header) + " |", "|" + "|".join(align) + "|"]
    lines += ["| " + " | ".join(_cell(c) for c in row) + " |" for row in rows]
    return lines


def load_metrics(path: Path, meta: dict) -> dict:
    """reports/metrics.json, accepted only if it describes THIS bundle (a stale report must not become a model card)."""
    path = Path(path)
    if not path.is_file():
        raise PublishError(
            f"{path} not found: run ml/evaluate.py first (the model card's numbers come from it)"
        )
    metrics = read_json(path)
    if not isinstance(metrics, dict):
        raise PublishError(f"{path} is not a JSON object")
    described = (metrics.get("bundle") or {}).get("version")
    if described != meta.get("version"):
        raise PublishError(
            f"{path} describes bundle {described!r}, not {meta.get('version')!r}: "
            "install this bundle (install_bundle.py, make it LATEST) and re-run ml/evaluate.py"
        )
    report = (metrics.get("reports") or {}).get("onnx-int8")
    if (
        not isinstance(report, dict)
        or not isinstance(report.get("per_intent"), dict)
        or "accuracy" not in report
    ):
        raise PublishError(f"{path} has no 'onnx-int8' report: re-run ml/evaluate.py")
    served = ((meta.get("metrics") or {}).get("int8") or {}).get("test_accuracy")
    if served is not None and abs(served - report["accuracy"]) > 1e-6:
        raise PublishError(
            f"{path} says INT8 test accuracy {report['accuracy']:.4f} but meta.json says {served:.4f}: "
            "the report was made for another export; re-run ml/evaluate.py"
        )
    return metrics


def build_model_card(bundle: Bundle, lock: dict, metrics: dict, repo: str) -> str:
    """The README.md of the Hugging Face repo. Pure function of its inputs; numbers come from the files."""
    meta, calib = bundle.meta, bundle.calibration
    report = metrics["reports"]["onnx-int8"]
    data = metrics.get("data") or {}
    n_labels = len(bundle.labels)
    base = meta.get("base_model")
    quant = meta.get("quantization") or {}
    tau_mode = calib.get("chosen") or ("per_intent" if calib.get("tau_per_intent") else "global")
    out: list[str] = []

    # ---- front matter: no `license:` key on purpose (see Licensing)
    out += ["---", "language:", "- en", "- hi", "library_name: onnx", "pipeline_tag: text-classification"]
    if base:
        out.append(f"base_model: {base}")
    out += [
        "tags:",
        "- intent-classification",
        "- onnx",
        "- int8",
        "- code-mixed",
        "- hinglish",
        "- studyloop",
        "---",
        "",
    ]

    out += [
        f"# StudyLoop intent classifier - {bundle.version}",
        "",
        f"A small text classifier for StudyLoop, a voice-driven study copilot for long lecture videos. It reads the "
        f"transcript of one spoken command and picks one of {n_labels} intents: player controls, questions about the "
        f"lecture, notes, or out of scope. It is a fine-tuned `{base or 'transformer'}` exported to ONNX with dynamic "
        f"INT8 quantization, so it runs on a CPU with onnxruntime and no PyTorch. It is the model behind "
        f"`CLASSIFIER=onnx` in the StudyLoop backend; it is product-specific, not a general intent model.",
        "",
        "## Evaluation status (read this first)",
        "",
        REAL_SPEECH_CAVEAT,
        "",
        "## Labels",
        "",
    ]
    out += _table(
        ["#", "label", "meaning"],
        [[i, f"`{x}`", INTENT_GLOSS.get(x, "")] for i, x in enumerate(bundle.labels)],
    )
    out += ["", "The order above is the logit order (`labels.json`).", ""]

    # ---- how to use
    max_len = int(meta.get("max_len", 40))
    nlp = meta.get("nlp_version")
    out += [
        "## How to use",
        "",
        "The reference consumer is `backend/app/orchestration/onnx_classifier.py` in the StudyLoop repository: it "
        "loads the five files below from one directory. The input is the transcript **after** the backend's "
        f"`studyloop_nlp.normalize()` (version {nlp or 'recorded at training time'}), which transliterates Devanagari "
        "to Latin script and canonicalizes the text; the model was trained on normalized text only. "
        "`normalize()` is not part of this Hugging Face repository.",
        "",
        "```python",
        "import json",
        "import numpy as np",
        "import onnxruntime as ort",
        "from tokenizers import Tokenizer",
        "from studyloop_nlp import normalize  # StudyLoop backend; the model expects normalized text",
        "",
        'tok = Tokenizer.from_file("tokenizer.json")',
        f"tok.enable_truncation(max_length={max_len})",
        "tok.no_padding()",
        'sess = ort.InferenceSession("model.onnx", providers=["CPUExecutionProvider"])',
        'labels = json.load(open("labels.json"))',
        'calib = json.load(open("calibration.json"))',
        "",
        "enc = tok.encode(normalize(utterance))",
        'feed = {"input_ids": np.array([enc.ids], dtype=np.int64)}',
        'if "attention_mask" in {i.name for i in sess.get_inputs()}:',
        '    feed["attention_mask"] = np.array([enc.attention_mask], dtype=np.int64)',
        'z = sess.run(None, feed)[0][0] / calib["temperature"]',
        "p = np.exp(z - z.max())",
        "p /= p.sum()",
        "label, confidence = labels[int(p.argmax())], float(p.max())",
        'tau = (calib.get("tau_per_intent") or {}).get(label, calib["tau"])',
        'act_now = label != "OOS" and confidence >= tau  # below tau, StudyLoop asks its LLM router instead',
        "```",
        "",
        f"`confidence` is the softmax of the logits divided by the temperature T = {calib['temperature']:.3f}.",
        "",
    ]

    # ---- training
    rows = data.get("rows") or {}
    out += ["## Training summary", ""]
    train = [
        f"- Base model: `{base}`, {meta.get('layers')} transformer blocks, {meta.get('params', 0) / 1e6:.1f} M "
        f"parameters, maximum input length {max_len} tokens, fine-tuned with seed {meta.get('seed')}."
        if base
        else f"- Fine-tuned transformer, maximum input length {max_len} tokens.",
        f"- Export: ONNX opset {meta.get('opset')}, then dynamic quantization of the weights to "
        f"{quant.get('weight_type', 'INT8')} ({quant.get('config', 'per-tensor')}); onnxruntime "
        f"{meta.get('onnxruntime', '?')} at export time. Size: {_mb(bundle.files['model.onnx']['bytes'])}"
        + (f" (fp32: {_mb(meta['fp32_bytes'])})." if meta.get("fp32_bytes") else "."),
    ]
    if rows:
        train.append(
            f"- Data: {_n(rows.get('train'))} training, {_n(rows.get('val'))} validation and "
            f"{_n(rows.get('test'))} test rows after normalization and de-duplication, split by source "
            "utterance so a command and its paraphrases never straddle two splits."
        )
    train += [
        "- Data sources: hand-written commands in English, romanized Hindi (Hinglish) and Devanagari-mixed Hindi; "
        "LLM-written paraphrases of them; and out-of-scope negatives sampled from two public intent datasets "
        "(CLINC150 and SNIPS). Labels were checked by a blind LLM judge, then reviewed row by row by an LLM "
        "(Claude) against written labeling rules, with a few decisions made by the project author. No "
        "native-speaker annotation study has been done.",
        "- The training text is not published here.",
        "",
    ]
    out += train

    # ---- evaluation
    n_test = report.get("n")
    int8 = (meta.get("metrics") or {}).get("int8") or {}
    fp32 = (meta.get("metrics") or {}).get("fp32") or {}
    kinds = ((data.get("per_kind") or {}).get("test")) or {}
    out += [
        "## Evaluation on the synthetic test split",
        "",
        f"On {n_test} held-out **text** rows (not speech) the INT8 model scores accuracy "
        f"{_f3(report['accuracy'])} ({_pct(report['accuracy'])}) and macro-F1 {_f3(report['macro_f1'])} "
        f"({_pct(report['macro_f1'])}).",
    ]
    if fp32.get("test_accuracy") is not None:
        out.append(
            f"Before quantization (fp32 ONNX) the same split gave accuracy {_f3(fp32['test_accuracy'])} and "
            f"macro-F1 {_f3(fp32['test_macro_f1'])}."
            if fp32.get("test_macro_f1") is not None
            else f"Before quantization (fp32 ONNX) accuracy was {_f3(fp32['test_accuracy'])}."
        )
    if kinds:
        out.append(
            f"The split holds {kinds.get('base', '?')} hand-written commands, {kinds.get('para', '?')} paraphrases "
            f"and {kinds.get('external', '?')} negatives from public datasets."
        )
    elif int8.get("test_accuracy") is not None:
        out.append(f"(meta.json records INT8 test accuracy {_f3(int8['test_accuracy'])}.)")
    out += [
        "",
        "These are results on text. Real speech is not measured yet (see *Evaluation status* above).",
        "",
        "### Per intent",
        "",
    ]
    per = report["per_intent"]
    out += _table(
        ["label", "n", "precision", "recall", "F1"],
        [
            [f"`{k}`", v.get("support", ""), _f3(v["precision"]), _f3(v["recall"]), _f3(v["f1"])]
            for k, v in per.items()
        ],
        right=(1, 2, 3, 4),
    )
    supports = [v["support"] for v in per.values() if "support" in v]
    weakest = sorted(per.items(), key=lambda kv: kv[1]["f1"])[:3]
    out += [
        "",
        "The weakest intents on this split are "
        + ", ".join(f"`{k}` (F1 {_f3(v['f1'])})" for k, v in weakest)
        + (
            f". Per-intent support is between {min(supports)} and {max(supports)} rows, so one wrong row moves the "
            f"smallest intent's F1 by up to about {50 / min(supports):.0f} points: treat the per-intent figures as "
            "indicative."
            if supports
            else "."
        ),
        "",
    ]
    pairs = [p for p in report.get("pairs", []) if p.get("a_as_b") or p.get("b_as_a")]
    if pairs:
        out += ["### Confusable pairs (errors on the test split)", ""]
        out += _table(
            ["pair (a / b)", "a predicted as b", "b predicted as a"],
            [[p["pair"], p["a_as_b"], p["b_as_a"]] for p in pairs],
            right=(1, 2),
        )
        out.append("")
    styles = (metrics.get("styles") or {}).get("onnx-int8")
    if styles:
        out += ["### By input style (accuracy)", ""]
        out += _table(
            ["style", "what it is", "n", "accuracy"],
            [[f"`{k}`", STYLE_GLOSS.get(k, ""), v["n"], _f3(v["accuracy"])] for k, v in styles.items()],
            right=(2, 3),
        )
        lowest = min(styles.items(), key=lambda kv: kv[1]["accuracy"])
        out += [
            "",
            f"The lowest accuracy is on `{lowest[0]}` ({_f3(lowest[1]['accuracy'])}, n = {lowest[1]['n']}).",
            "",
        ]

    # ---- calibration
    out += ["## Calibration and routing", ""]
    mode_text = "one global threshold" if tau_mode == "global" else "a threshold per predicted intent"
    out += [
        f"- Temperature T = {calib['temperature']:.3f}"
        + (f" ({calib['fitted_on']})" if calib.get("fitted_on") else "")
        + "; the confidence is softmax(logits / T) of the top label.",
        f"- Threshold tau = {calib['tau']} ({mode_text}). A turn whose top label is not `OOS` and whose confidence "
        "is at least tau is acted on directly; anything below tau is handed to a slower LLM router in the app. "
        "tau is a product decision (how many wrong direct actions the app tolerates versus how many turns "
        "it defers), not a property of the model: it is specific to StudyLoop and to this validation data.",
    ]
    if _number(calib.get("misfire_budget")):
        out.append(
            f"- Misfire budget: {_pct(calib['misfire_budget'])} of directly routed validation turns may be "
            "wrong; tau is the lowest threshold that stays within it."
        )
    if calib.get("tau_per_intent"):
        out.append(
            "- Per-intent thresholds: "
            + ", ".join(f"`{k}` {v}" for k, v in sorted(calib["tau_per_intent"].items()))
            + "."
        )
    ece = calib.get("ece") or {}
    if all(_number(ece.get(k)) for k in ("test_raw", "test_scaled")):
        out.append(
            f"- Expected calibration error on the test split: {_f3(ece['test_raw'])} before scaling, "
            f"{_f3(ece['test_scaled'])} after."
        )
    override = calib.get("override")
    if isinstance(override, dict) and override.get("why"):
        out.append(f"- The threshold mode was set by hand ({override.get('mode')}): {override['why']}")
        if "test" in str(override["why"]).lower():
            out.append(
                "  Because that decision was informed by test-split results, the test routing column below is not a "
                "clean held-out estimate."
            )
    routing = calib.get("routing") or {}
    val_row = (routing.get("val") or {}).get(tau_mode)
    test_row = (routing.get("test") or {}).get(tau_mode)
    if val_row and test_row:
        out += ["", f"Routing with the served threshold ({tau_mode.replace('_', ' ')}), synthetic text:", ""]
        out += _table(
            ["", "validation", "test"],
            [
                [
                    "in-scope turns that skip the LLM router",
                    _pct(val_row["coverage"]),
                    _pct(test_row["coverage"]),
                ],
                [
                    "wrong actions among directly routed turns",
                    f"{_pct(val_row['misfire_rate'])} ({val_row['misfires']} of {val_row['direct']})",
                    f"{_pct(test_row['misfire_rate'])} ({test_row['misfires']} of {test_row['direct']})",
                ],
                [
                    "player-command turns acted on correctly",
                    _pct(val_row["fast_coverage"]),
                    _pct(test_row["fast_coverage"]),
                ],
                ["wrong player actions", _pct(val_row["fast_misfire"]), _pct(test_row["fast_misfire"])],
                [
                    "out-of-scope turns that trigger an action",
                    _pct(val_row["oos_leak"]),
                    _pct(test_row["oos_leak"]),
                ],
            ],
            right=(1, 2),
        )
    out.append("")

    # ---- limitations
    out += [
        "## Limitations",
        "",
        "- **Not measured on real speech** (see the top of this card). Speech-to-text errors, accents and "
        "disfluencies are not represented in the numbers.",
        "- **Code-mixed Hindi-English.** Hindi is handled through the backend's Devanagari-to-Latin "
        "normalization and an English-vocabulary tokenizer; spellings the normalizer has not seen, and pure "
        "Devanagari input, are the likeliest to be misread.",
        "- **Weakest intents:** " + ", ".join(f"`{k}`" for k, _ in weakest) + " on the synthetic test split.",
        "- **Synthetic data.** Training and test rows are hand-written or LLM-paraphrased, with label review done "
        "by an LLM; the distribution of real users' phrasing is unknown. A real-speech evaluation may move every "
        "number.",
        "- **tau is product-specific.** It was picked on synthetic validation text, which is cleaner than speech "
        "recognition output and therefore tends to underestimate wrong actions; it should be re-picked on "
        "real-speech validation data.",
        f"- Inputs longer than {max_len} tokens are truncated; the label set is fixed at {n_labels} intents.",
        "",
    ]

    # ---- licensing
    out += [
        "## Licensing and data",
        "",
        f"- The base model, `{base or 'the base model'}`, is released under the Apache-2.0 licence by its authors.",
        "- The model was also trained on out-of-scope negatives derived from **CLINC150** (Larson et al., 2019, "
        "*An Evaluation Dataset for Intent Classification and Out-of-Scope Prediction*) and **SNIPS** "
        "(Coucke et al., 2018, *Snips Voice Platform*). Those datasets have their own licences and terms: "
        "see their repositories, `clinc/oos-eval` and `sonos/nlu-benchmark` on GitHub. This card does not restate "
        "them.",
        "- No licence is declared for the fine-tuned weights in this repository yet (the card has no `license` "
        "field on purpose). Until the owner adds one, assume the usual default: all rights reserved.",
        "- The repository contains no training text and no personal data.",
        "",
    ]

    # ---- files and provenance
    out += ["## Files", ""]
    out += _table(
        ["file", "bytes", "sha256"],
        [
            [f"`{name}`", f"{lock['files'][name]['bytes']:,}", f"`{lock['files'][name]['sha256']}`"]
            for name in FILES
        ],
        right=(1,),
    )
    out += [
        "",
        f"Bundle version `{bundle.version}`"
        + (f", exported {meta['created_at']}" if meta.get("created_at") else "")
        + f". Published as `{repo}`; StudyLoop's Docker build pins an exact commit of this repository and verifies "
        "every sha256 above.",
        "",
        "This card is generated by `ml/publish_bundle.py` from `meta.json`, `calibration.json` and "
        "`ml/reports/metrics.json`; its numbers are computed, not typed.",
        "",
    ]
    return "\n".join(out)


# ----------------------------------------------------------------------------------------- the push


def _import_hub():
    try:
        return importlib.import_module("huggingface_hub")
    except ImportError:
        raise PublishError(
            "huggingface_hub is not installed in this Python: use the ML venv "
            "(ml/.venv/Scripts/python, `uv pip install -r ml/requirements.txt`)"
        ) from None


def _stage(bundle_dir: Path, staging: Path) -> None:
    for name in FILES:
        shutil.copy2(bundle_dir / name, staging / name)


def round_trip(lock: dict, expected: Bundle) -> None:
    """Run the Docker build's own fetcher against the published revision (no token) and check what it wrote."""
    if not FETCHER.is_file():
        raise PublishError(
            f"{FETCHER} not found: the fetcher the Docker build runs must exist to prove the round trip"
        )
    env = {k: v for k, v in os.environ.items() if k not in SECRET_ENV}
    with tempfile.TemporaryDirectory(prefix="studyloop-roundtrip-") as tmp:
        tmp_lock = Path(tmp) / "bundle.lock.json"
        dest = Path(tmp) / "intent"
        dest.mkdir()
        write_lock(tmp_lock, lock)
        cmd = [sys.executable, str(FETCHER), "--lock", str(tmp_lock), "--dest", str(dest)]
        last = "no attempt ran"
        for attempt in range(1, ROUND_TRIP_ATTEMPTS + 1):
            try:
                proc = subprocess.run(
                    cmd,
                    capture_output=True,
                    text=True,
                    encoding="utf-8",
                    errors="replace",
                    env=env,
                    timeout=ROUND_TRIP_TIMEOUT_SECONDS,
                )
                output = (proc.stdout + proc.stderr).strip()
                if proc.returncode == 0:
                    print("  " + (proc.stdout.strip().splitlines() or ["fetched"])[-1])
                    break
                last = f"exit {proc.returncode}: {output[-600:]}"
                if (
                    proc.returncode == 2
                ):  # the fetcher rejected the lock or its arguments: a retry cannot help
                    raise PublishError(f"the fetcher rejected the lock: {last}")
            except subprocess.TimeoutExpired:
                last = f"timed out after {ROUND_TRIP_TIMEOUT_SECONDS} s"
            print(f"  fetch attempt {attempt}/{ROUND_TRIP_ATTEMPTS} failed ({last[:200]})")
            if attempt < ROUND_TRIP_ATTEMPTS:
                time.sleep(ROUND_TRIP_RETRY_SECONDS)
        else:
            raise PublishError(f"the fetcher could not download the published revision: {last}")
        for name in FILES:
            path = dest / name
            if not path.is_file():
                raise PublishError(f"the fetcher succeeded but did not write {name}")
            want = lock["files"][name]
            if path.stat().st_size != want["bytes"] or sha256_file(path) != want["sha256"]:
                raise PublishError(f"the fetched {name} does not match the lock")
        # the fetched bundle is the one that was exported
        inspect_bundle(dest, version=expected.version)


def run_push(bundle_dir: Path, repo: str, lock_path: Path, metrics_path: Path, token: str) -> None:
    bundle = inspect_bundle(bundle_dir)
    metrics = load_metrics(metrics_path, bundle.meta)
    hub = _import_hub()
    with tempfile.TemporaryDirectory(prefix="studyloop-publish-") as tmp:
        staging = Path(tmp) / "bundle"
        staging.mkdir()
        _stage(bundle_dir, staging)
        # What gets uploaded is the staged copy; the lock is derived from that copy and must equal the source
        # (the bundle can be re-exported while this runs).
        staged = inspect_bundle(staging, version=bundle.version)
        if staged.files != bundle.files:
            raise PublishError(
                f"{bundle_dir} changed while it was being staged: nothing was uploaded, run again"
            )
        lock = build_lock(staged, repo, None)
        existing = read_lock(lock_path)
        kept, why = decide_revision(existing, repo, staged.version, staged.files)
        if existing and existing.get("revision") and kept is None:
            print(f"note: the lock's current revision {existing['revision']} will be replaced ({why})")
        card = build_model_card(staged, lock, metrics, repo)
        with open(staging / "README.md", "w", encoding="utf-8", newline="\n") as f:
            f.write(card)

        print(f"publishing {bundle.version} ({_mb(bundle.files['model.onnx']['bytes'])} model) to {repo} ...")
        try:
            hub.create_repo(repo_id=repo, token=token, private=False, repo_type="model", exist_ok=True)
            info = hub.upload_folder(
                repo_id=repo,
                folder_path=str(staging),
                repo_type="model",
                token=token,
                commit_message=f"{bundle.version}: ONNX intent bundle and model card",
            )
        except Exception as exc:
            raise PublishError(
                f"the Hugging Face upload failed: {type(exc).__name__}: {scrub(exc, token)}. "
                f"No commit id came back; before retrying, look at https://huggingface.co/{repo}/commits/main "
                "(a retry is safe: identical files make no new commit)"
            ) from None
        revision = getattr(info, "oid", None)
        if not isinstance(revision, str) or not _REVISION.match(revision):
            raise PublishError(
                f"the upload returned no usable commit id ({scrub(repr(revision), token)}); "
                f"look at https://huggingface.co/{repo}/commits/main for the new commit and put its id "
                "in the lock by hand after checking it"
            )
        print(f"committed: {repo} @ {revision}")

        # from here on the commit exists: whatever fails, the revision is in the message
        try:
            published = build_lock(staged, repo, revision)
            print("checking the round trip with the build's own fetcher (no token) ...")
            round_trip(published, staged)
            write_lock(lock_path, published)
        except Exception as exc:
            raise PublishError(
                f"{scrub(exc, token)}. THE COMMIT EXISTS: {repo} revision {revision}; the lock was NOT updated. "
                "Fix the cause and run --push again (identical files make no new commit, the revision stays "
                "the same)"
            ) from None
    print(f"lock written: {lock_path} (revision {revision})")
    print("next: commit backend/bundle.lock.json, push to GitHub, Render rebuilds (docs/TIER1C_DEPLOY.md)")


def run_write_lock(bundle_dir: Path, repo: str, lock_path: Path) -> None:
    bundle = inspect_bundle(bundle_dir)
    lock, why = derive_lock(bundle, repo, read_lock(lock_path))
    write_lock(lock_path, lock)
    size = _mb(bundle.files["model.onnx"]["bytes"])
    state = f"revision {lock['revision']} kept ({why})" if lock["revision"] else f"revision null ({why})"
    print(f"lock written: {lock_path} - {bundle.version} for {repo}, model.onnx {size}, {state}")
    if lock["revision"] is None:
        print("not published yet: HF_WRITE_TOKEN=... publish_bundle.py --push sets the revision")


def run_write_card(bundle_dir: Path, repo: str, metrics_path: Path, card_path: Path) -> None:
    """The model card exactly as --push would upload it, written locally so it can be read before anything is public."""
    bundle = inspect_bundle(bundle_dir)
    metrics = load_metrics(metrics_path, bundle.meta)
    card = build_model_card(bundle, build_lock(bundle, repo, None), metrics, repo)
    card_path = Path(card_path)
    card_path.parent.mkdir(parents=True, exist_ok=True)
    with open(card_path, "w", encoding="utf-8", newline="\n") as f:
        f.write(card)
    print(f"model card written: {card_path} ({card.count(chr(10))} lines) - read it before the first --push")


# ----------------------------------------------------------------------------------------- the command line


def parse_args(argv: list[str] | None) -> argparse.Namespace:
    ap = argparse.ArgumentParser(
        description="Publish the ONNX intent bundle to Hugging Face and write backend/bundle.lock.json.",
        epilog=f"The write token is read from the {TOKEN_ENV} environment variable only.",
        allow_abbrev=False,
    )
    ap.add_argument("--bundle", help="bundle directory or version (default: saved_models/intent-onnx/LATEST)")
    ap.add_argument(
        "--repo", default=DEFAULT_REPO, help=f"Hugging Face model repo (default {DEFAULT_REPO}; confirm it)"
    )
    ap.add_argument(
        "--lock", type=Path, default=DEFAULT_LOCK, help="lock file (default backend/bundle.lock.json)"
    )
    ap.add_argument(
        "--metrics", type=Path, default=REPORTS / "metrics.json", help="evaluation report for the card"
    )
    ap.add_argument(
        "--write-lock", action="store_true", help="derive and write the lock from the files; no network"
    )
    ap.add_argument(
        "--push", action="store_true", help=f"upload to Hugging Face (needs {TOKEN_ENV}), then write the lock"
    )
    ap.add_argument(
        "--write-card",
        type=Path,
        metavar="PATH",
        help="write the model card (what --push uploads as README.md) to PATH and stop; no network, no lock",
    )
    args, extra = ap.parse_known_args(argv)
    if extra:
        # argparse would echo the offending text, and a mistyped `--token hf_…` must never reach a terminal
        hint = (
            f" The write token is read from the {TOKEN_ENV} environment variable only."
            if any("token" in e.lower() for e in extra)
            else ""
        )
        ap.exit(2, f"publish_bundle.py: unrecognized arguments ({len(extra)}, not shown).{hint}\n")
    if not (args.write_lock or args.push or args.write_card):
        ap.error("choose --write-lock (no network), --write-card PATH (no network) or --push")
    return args


def main(argv: list[str] | None = None) -> None:
    args = parse_args(argv)
    token = os.environ.get(TOKEN_ENV, "").strip() if args.push else ""
    try:
        if args.push and not token:
            raise PublishError(
                f"--push needs the write token in the {TOKEN_ENV} environment variable (never as an argument): "
                f"create a fine-grained token limited to {args.repo}, export it in this shell, run again"
            )
        if not _REPO.match(args.repo):
            raise PublishError(f"--repo {args.repo!r} is not <owner>/<name>")
        bundle_dir = resolve_bundle(args.bundle)
        if args.push:
            run_push(bundle_dir, args.repo, args.lock, args.metrics, token)
        else:
            if args.write_lock:
                run_write_lock(bundle_dir, args.repo, args.lock)
            if args.write_card:
                run_write_card(bundle_dir, args.repo, args.metrics, args.write_card)
    except PublishError as exc:
        raise SystemExit(f"publish_bundle: {scrub(exc, token)}") from None
    except Exception as exc:  # unexpected: still never let the token out in a traceback
        raise SystemExit(f"publish_bundle: unexpected {type(exc).__name__}: {scrub(exc, token)}") from None


if __name__ == "__main__":
    main()
