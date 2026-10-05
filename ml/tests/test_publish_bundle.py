"""publish_bundle.py: the lock the Docker build verifies, the model card, and the --push path with a fake Hub.

No network, no GPU, no real model: a tiny synthetic bundle in tmp_path, a stand-in `huggingface_hub` module, and a
stub fetcher. The real fetcher is exercised end to end (against a local HTTP server) when backend/scripts has it.
"""

import hashlib
import http.server
import json
import os
import re
import shutil
import socket
import subprocess
import sys
import threading
from pathlib import Path
from types import SimpleNamespace

import pytest

import publish_bundle as pb
from common import INTENTS
from install_bundle import FILES as INSTALL_FILES

VERSION = "intent-20990101-tiny-s1"
REPO = "someone/studyloop-intent-test"
TOKEN = "hf_" + "AbCdEfGhIjKlMnOpQrStUvWxYz0123456789"
REVISION = "0123456789abcdef0123456789abcdef01234567"
OTHER_REVISION = "fedcba9876543210fedcba9876543210fedcba98"
SECRETISH = "hf_SECRETSHOULDNEVERAPPEAR000"


def sha(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def write_json(path: Path, obj) -> None:
    path.write_text(json.dumps(obj, indent=2), encoding="utf-8")


def per_intent():
    f1 = {k: 0.95 for k in INTENTS}
    f1["ASK"], f1["REPLAY"], f1["SUMMARIZE"] = 0.7123, 0.8456, 0.8001
    return {
        k: {"precision": v + 0.01, "recall": v - 0.01, "f1": v, "support": 30 + i}
        for i, (k, v) in enumerate(f1.items())
    }


def make_bundle(root: Path, version: str = VERSION, *, tau=0.97, temperature=1.234) -> Path:
    """A bundle that passes every check: five files, meta.json hashes of model + tokenizer, calibration with tau/T."""
    d = root / version
    d.mkdir(parents=True)
    model, tok = b"not-really-onnx\x00\x01" * 50, b'{"model": {"type": "WordPiece"}}'
    (d / "model.onnx").write_bytes(model)
    (d / "tokenizer.json").write_bytes(tok)
    write_json(d / "labels.json", INTENTS)
    write_json(
        d / "calibration.json",
        {
            "temperature": temperature,
            "tau": tau,
            "tau_per_intent": None,
            "misfire_budget": 0.01,
            "chosen": "global",
            "fitted_on": "onnx-int8 validation logits",
            "ece": {"val_raw": 0.031, "val_scaled": 0.0176, "test_raw": 0.04248, "test_scaled": 0.02546},
            "routing": {
                "val": {"global": routing_row(0.6667, 0.0, 0, 232)},
                "test": {"global": routing_row(0.6767, 0.0102, 3, 293)},
            },
        },
    )
    write_json(
        d / "meta.json",
        {
            "version": version,
            "created_at": "2099-01-01T00:00:00+00:00",
            "base_model": "distilbert-base-uncased",
            "layers": 6,
            "seed": 1,
            "params": 66964238,
            "max_len": 40,
            "labels": INTENTS,
            "nlp_version": "1.0.0",
            "opset": 17,
            "quantization": {"type": "dynamic", "weight_type": "QInt8", "config": "per-channel"},
            "onnxruntime": "1.30.0",
            "fp32_bytes": 267952642,
            "files": {
                "model.onnx": {"bytes": len(model), "sha256": sha(model)},
                "tokenizer.json": {"bytes": len(tok), "sha256": sha(tok)},
            },
            "metrics": {
                "fp32": {"test_accuracy": 0.9313, "test_macro_f1": 0.9263},
                "int8": {"test_accuracy": 0.9332096, "test_macro_f1": 0.9275655},
            },
        },
    )
    return d


def routing_row(coverage, misfire, misfires, direct):
    return {
        "coverage": coverage,
        "misfire_rate": misfire,
        "misfires": misfires,
        "direct": direct,
        "fast_coverage": 0.7591,
        "fast_misfire": 0.0142,
        "oos_leak": 0.0,
        "n": 539,
    }


def make_metrics(root: Path, version: str = VERSION, accuracy: float = 0.9332096) -> Path:
    path = root / "metrics.json"
    write_json(
        path,
        {
            "bundle": {"version": version},
            "reports": {
                "onnx-int8": {
                    "n": 539,
                    "accuracy": accuracy,
                    "macro_f1": 0.9275655,
                    "per_intent": per_intent(),
                    "pairs": [
                        {"pair": "ASK / REPLAY", "a_as_b": 3, "b_as_a": 0, "support_a": 29, "support_b": 29},
                        {
                            "pair": "VOLUME / SPEED",
                            "a_as_b": 0,
                            "b_as_a": 0,
                            "support_a": 27,
                            "support_b": 25,
                        },
                    ],
                }
            },
            "styles": {
                "onnx-int8": {
                    "en": {"n": 130, "accuracy": 0.9308},
                    "hi_pure": {"n": 49, "accuracy": 0.8776},
                    "external": {"n": 57, "accuracy": 0.9825},
                }
            },
            "data": {
                "rows": {"train": 3874, "val": 437, "test": 539},
                "per_kind": {"test": {"base": 163, "para": 319, "external": 57}},
            },
        },
    )
    return path


@pytest.fixture
def bundle_dir(tmp_path):
    return make_bundle(tmp_path / "saved")


@pytest.fixture
def metrics_path(tmp_path):
    return make_metrics(tmp_path)


def run(*args: str) -> None:
    pb.main(list(args))


def refusal(*args: str) -> str:
    with pytest.raises(SystemExit) as exc:
        run(*args)
    return str(exc.value)


# ------------------------------------------------------------------------------------ the lock


def test_file_list_is_the_one_install_bundle_uses():
    assert (
        pb.FILES
        == INSTALL_FILES
        == ("model.onnx", "tokenizer.json", "labels.json", "calibration.json", "meta.json")
    )


def test_lock_matches_the_contract_byte_for_byte(bundle_dir, tmp_path):
    lock_path = tmp_path / "bundle.lock.json"
    run("--bundle", str(bundle_dir), "--repo", REPO, "--lock", str(lock_path), "--write-lock")
    raw = lock_path.read_bytes()
    text = raw.decode("utf-8")
    assert text.endswith("}\n") and not text.endswith("\n\n")
    assert b"\r" not in raw, "LF only"
    assert text.splitlines()[1] == '  "schema": 1,', "indent 2"
    lock = json.loads(text)
    assert list(lock) == ["schema", "repo", "revision", "version", "files"]
    assert (
        lock["schema"] == 1
        and lock["repo"] == REPO
        and lock["revision"] is None
        and lock["version"] == VERSION
    )
    assert list(lock["files"]) == [
        "model.onnx",
        "tokenizer.json",
        "labels.json",
        "calibration.json",
        "meta.json",
    ]
    for name, info in lock["files"].items():
        data = (bundle_dir / name).read_bytes()
        assert list(info) == ["bytes", "sha256"]
        assert info == {"bytes": len(data), "sha256": hashlib.sha256(data).hexdigest()}
    assert text == json.dumps(lock, indent=2) + "\n"
    assert pb.lock_problems(lock) == []


def test_default_repo_and_lock_location():
    assert pb.DEFAULT_REPO == "rishiigupta04/studyloop-intent"
    assert pb.DEFAULT_LOCK.parent.name == "backend" and pb.DEFAULT_LOCK.name == "bundle.lock.json"
    assert pb.parse_args(["--write-lock"]).repo == pb.DEFAULT_REPO


def test_the_lock_is_written_atomically(bundle_dir, tmp_path, monkeypatch):
    lock_path = tmp_path / "bundle.lock.json"
    lock_path.write_text("previous lock\n", encoding="utf-8")

    def boom(src, dst):
        raise OSError("disk went away")

    monkeypatch.setattr(pb.os, "replace", boom)
    message = refusal("--bundle", str(bundle_dir), "--repo", REPO, "--lock", str(lock_path), "--write-lock")
    assert "disk went away" in message
    assert lock_path.read_text(encoding="utf-8") == "previous lock\n", "the old lock survives a failed write"
    assert not list(tmp_path.glob("*.tmp")), "no temp file left behind"
    monkeypatch.undo()

    run("--bundle", str(bundle_dir), "--repo", REPO, "--lock", str(lock_path), "--write-lock")
    assert json.loads(lock_path.read_text(encoding="utf-8"))["version"] == VERSION
    assert not list(tmp_path.glob("*.tmp"))


def test_write_lock_never_touches_the_network(bundle_dir, tmp_path, monkeypatch):
    def no_network(*args, **kwargs):
        raise AssertionError("--write-lock opened a connection")

    monkeypatch.setattr(socket, "create_connection", no_network)
    monkeypatch.setattr(socket.socket, "connect", no_network)
    monkeypatch.setitem(sys.modules, "huggingface_hub", None)  # importing it would raise ImportError
    run("--bundle", str(bundle_dir), "--repo", REPO, "--lock", str(tmp_path / "l.json"), "--write-lock")


# ------------------------------------------------------------------------------------ revision rule


def published_lock(bundle_dir, tmp_path, revision=REVISION, repo=REPO) -> Path:
    lock_path = tmp_path / "bundle.lock.json"
    bundle = pb.inspect_bundle(bundle_dir)
    pb.write_lock(lock_path, pb.build_lock(bundle, repo, revision))
    return lock_path


def current_revision(lock_path: Path):
    return json.loads(lock_path.read_text(encoding="utf-8"))["revision"]


def test_an_unchanged_bundle_keeps_its_published_revision(bundle_dir, tmp_path):
    lock_path = published_lock(bundle_dir, tmp_path)
    run("--bundle", str(bundle_dir), "--repo", REPO, "--lock", str(lock_path), "--write-lock")
    assert current_revision(lock_path) == REVISION


def test_a_changed_file_resets_the_revision(bundle_dir, tmp_path):
    lock_path = published_lock(bundle_dir, tmp_path)
    calibration = json.loads((bundle_dir / "calibration.json").read_text(encoding="utf-8"))
    calibration["tau"] = 0.95  # a recalibration: same version string, different bytes
    write_json(bundle_dir / "calibration.json", calibration)
    run("--bundle", str(bundle_dir), "--repo", REPO, "--lock", str(lock_path), "--write-lock")
    lock = json.loads(lock_path.read_text(encoding="utf-8"))
    assert lock["revision"] is None
    assert lock["files"]["calibration.json"]["sha256"] == sha((bundle_dir / "calibration.json").read_bytes())


def test_a_changed_repo_resets_the_revision(bundle_dir, tmp_path):
    lock_path = published_lock(bundle_dir, tmp_path)
    run("--bundle", str(bundle_dir), "--repo", "other/repo-name", "--lock", str(lock_path), "--write-lock")
    lock = json.loads(lock_path.read_text(encoding="utf-8"))
    assert lock["revision"] is None and lock["repo"] == "other/repo-name"


def test_a_new_version_resets_the_revision(tmp_path):
    first = make_bundle(tmp_path / "saved", VERSION)
    lock_path = published_lock(first, tmp_path)
    second = make_bundle(tmp_path / "saved", "intent-20990102-tiny-s1")
    run("--bundle", str(second), "--repo", REPO, "--lock", str(lock_path), "--write-lock")
    lock = json.loads(lock_path.read_text(encoding="utf-8"))
    assert lock["revision"] is None and lock["version"] == "intent-20990102-tiny-s1"


@pytest.mark.parametrize(
    "existing",
    [
        "not json at all",
        '["a list"]',
        json.dumps({"schema": 1, "repo": REPO, "revision": "abc123", "version": VERSION}),
    ],
)
def test_an_unusable_existing_lock_is_replaced_not_trusted(bundle_dir, tmp_path, existing):
    lock_path = tmp_path / "bundle.lock.json"
    lock_path.write_text(existing, encoding="utf-8")
    run("--bundle", str(bundle_dir), "--repo", REPO, "--lock", str(lock_path), "--write-lock")
    assert current_revision(lock_path) is None


# ------------------------------------------------------------------------------------ refusals


@pytest.mark.parametrize("name", pb.FILES)
def test_a_missing_file_is_refused_and_no_lock_is_written(bundle_dir, tmp_path, name):
    (bundle_dir / name).unlink()
    lock_path = tmp_path / "bundle.lock.json"
    message = refusal("--bundle", str(bundle_dir), "--repo", REPO, "--lock", str(lock_path), "--write-lock")
    assert name in message and "missing" in message
    assert not lock_path.exists()


def test_a_version_that_is_not_the_directory_name_is_refused(bundle_dir, tmp_path):
    renamed = bundle_dir.rename(bundle_dir.parent / "intent-something-else")
    message = refusal(
        "--bundle", str(renamed), "--repo", REPO, "--lock", str(tmp_path / "l.json"), "--write-lock"
    )
    assert VERSION in message and "intent-something-else" in message


@pytest.mark.parametrize("name", ["model.onnx", "tokenizer.json"])
def test_a_file_that_differs_from_meta_json_is_refused(bundle_dir, tmp_path, name):
    with open(bundle_dir / name, "ab") as f:
        f.write(b" ")  # one byte after export
    lock_path = tmp_path / "bundle.lock.json"
    message = refusal("--bundle", str(bundle_dir), "--repo", REPO, "--lock", str(lock_path), "--write-lock")
    assert name in message and "meta.json" in message
    assert not lock_path.exists()


def test_a_wrong_hash_in_meta_json_is_refused(bundle_dir, tmp_path):
    meta = json.loads((bundle_dir / "meta.json").read_text(encoding="utf-8"))
    meta["files"]["model.onnx"]["sha256"] = "0" * 64
    write_json(bundle_dir / "meta.json", meta)
    assert "model.onnx" in refusal(
        "--bundle", str(bundle_dir), "--lock", str(tmp_path / "l.json"), "--write-lock"
    )


def test_meta_json_without_the_hashes_is_refused(bundle_dir, tmp_path):
    meta = json.loads((bundle_dir / "meta.json").read_text(encoding="utf-8"))
    del meta["files"]
    write_json(bundle_dir / "meta.json", meta)
    assert "sha256" in refusal(
        "--bundle", str(bundle_dir), "--lock", str(tmp_path / "l.json"), "--write-lock"
    )


@pytest.mark.parametrize("drop", ["tau", "temperature"])
def test_a_calibration_without_tau_or_temperature_is_refused(bundle_dir, tmp_path, drop):
    calibration = json.loads((bundle_dir / "calibration.json").read_text(encoding="utf-8"))
    del calibration[drop]
    write_json(bundle_dir / "calibration.json", calibration)
    lock_path = tmp_path / "bundle.lock.json"
    message = refusal("--bundle", str(bundle_dir), "--lock", str(lock_path), "--write-lock")
    assert drop in message and "calibration.json" in message
    assert not lock_path.exists()


@pytest.mark.parametrize("tau, temperature", [(0, 1.2), (-0.1, 1.2), (1.5, 1.2), (0.9, 0), (0.9, -1.0)])
def test_an_out_of_range_tau_or_temperature_is_refused(tmp_path, tau, temperature):
    bundle = make_bundle(tmp_path / "saved", tau=tau, temperature=temperature)
    lock_path = tmp_path / "bundle.lock.json"
    message = refusal("--bundle", str(bundle), "--lock", str(lock_path), "--write-lock")
    assert "tau must be in (0, 1]" in message
    assert not lock_path.exists()


def test_labels_that_disagree_with_meta_are_refused(bundle_dir, tmp_path):
    write_json(bundle_dir / "labels.json", list(reversed(INTENTS)))
    assert "label" in refusal("--bundle", str(bundle_dir), "--lock", str(tmp_path / "l.json"), "--write-lock")


def test_a_bad_repo_name_is_refused(bundle_dir, tmp_path):
    assert "--repo" in refusal(
        "--bundle", str(bundle_dir), "--repo", "no-owner", "--lock", str(tmp_path / "l"), "--write-lock"
    )


def test_it_needs_a_mode(bundle_dir):
    with pytest.raises(SystemExit) as exc:
        run("--bundle", str(bundle_dir))
    assert exc.value.code == 2


def test_the_default_bundle_is_the_latest_one(tmp_path, monkeypatch):
    root = tmp_path / "saved"
    make_bundle(root / "intent-onnx", VERSION)
    (root / "intent-onnx" / "LATEST").write_text(VERSION + "\n", encoding="utf-8")
    monkeypatch.setattr(pb, "SAVED", root)
    run("--repo", REPO, "--lock", str(tmp_path / "l.json"), "--write-lock")
    assert json.loads((tmp_path / "l.json").read_text(encoding="utf-8"))["version"] == VERSION


# ------------------------------------------------------------------------------------ the model card


def card_for(bundle_dir: Path, metrics_path: Path) -> str:
    bundle = pb.inspect_bundle(bundle_dir)
    metrics = pb.load_metrics(metrics_path, bundle.meta)
    lock = pb.build_lock(bundle, REPO, None)
    return pb.build_model_card(bundle, lock, metrics, REPO)


def test_the_card_says_real_speech_is_not_measured(bundle_dir, metrics_path):
    card = card_for(bundle_dir, metrics_path)
    assert pb.REAL_SPEECH_CAVEAT in card
    for phrase in ("not measured yet", "real speech", "real-speech test set", "held-out speakers", "CO4"):
        assert phrase in card, phrase
    assert "per speech-to-text provider" in card and "none from real speech" in card
    assert card.index("not measured yet") < card.index("## Labels"), "the caveat comes before any number"


def test_the_card_numbers_are_the_computed_ones(bundle_dir, metrics_path):
    card = card_for(bundle_dir, metrics_path)
    for expected in (
        "0.933",  # INT8 accuracy 0.9332096
        "93.3 %",
        "0.928",  # macro-F1 0.9275655
        "0.931",  # fp32 accuracy 0.9313
        "539 held-out",
        "163 hand-written",
        "3,874 training",
        "T = 1.234",
        "tau = 0.97",
        "1.0 %",  # misfire budget
        "67.7 %",  # test coverage 0.6767
        "(3 of 293)",
        "0.025",  # ECE after scaling
        "hi_pure",
        "0.878",
    ):
        assert expected in card, expected
    for label in INTENTS:
        assert f"`{label}`" in card
    # the weakest three come from the F1 column, not from memory
    assert "`ASK` (F1 0.712), `SUMMARIZE` (F1 0.800), `REPLAY` (F1 0.846)" in card
    assert "ASK / REPLAY" in card and "VOLUME / SPEED" not in card, "only pairs with errors are listed"
    assert "`hi_pure` (0.878, n = 49)" in card


def test_the_card_changes_when_the_numbers_change(tmp_path):
    a = card_for(make_bundle(tmp_path / "a"), make_metrics(tmp_path))
    b = card_for(make_bundle(tmp_path / "b", tau=0.9, temperature=2.0), make_metrics(tmp_path))
    assert "tau = 0.97" in a and "tau = 0.9 " in b and "T = 2.000" in b and a != b


def test_the_card_is_deterministic_and_has_no_license_claim(bundle_dir, metrics_path):
    card = card_for(bundle_dir, metrics_path)
    assert card == card_for(bundle_dir, metrics_path)
    front = card.split("---")[1]
    assert "license" not in front, "no licence is asserted in the metadata"
    assert (
        card.startswith("---\n")
        and "library_name: onnx" in front
        and "base_model: distilbert-base-uncased" in front
    )
    assert "Apache-2.0" in card and "distilbert-base-uncased" in card
    assert "CLINC150" in card and "SNIPS" in card and "their own licences" in card
    assert (
        "CC BY" not in card and "CC0" not in card
    ), "we cannot verify those licences, so we do not state them"
    assert "no training text" in card.lower() or "not published here" in card


def test_the_card_has_no_paths_secrets_or_training_text(bundle_dir, metrics_path):
    card = card_for(bundle_dir, metrics_path)
    assert "\\" not in card and "D:/" not in card and "C:/" not in card
    assert not re.search(r"hf_[A-Za-z0-9]{8,}", card) and "@" not in card
    assert "\r" not in card


def test_a_stale_report_is_never_turned_into_a_card(bundle_dir, tmp_path):
    bundle = pb.inspect_bundle(bundle_dir)
    stale = make_metrics(tmp_path, version="intent-19990101-older-s1")
    with pytest.raises(pb.PublishError, match="describes bundle"):
        pb.load_metrics(stale, bundle.meta)
    other_model = make_metrics(tmp_path, accuracy=0.5)
    with pytest.raises(pb.PublishError, match="another export"):
        pb.load_metrics(other_model, bundle.meta)
    with pytest.raises(pb.PublishError, match="evaluate.py"):
        pb.load_metrics(tmp_path / "missing.json", bundle.meta)


def test_the_override_note_flags_a_test_informed_choice(bundle_dir, metrics_path):
    calibration = json.loads((bundle_dir / "calibration.json").read_text(encoding="utf-8"))
    calibration["override"] = {"mode": "global", "why": "per-intent failed on test (4.9 % misfires)"}
    write_json(bundle_dir / "calibration.json", calibration)
    card = card_for(bundle_dir, metrics_path)
    assert (
        "set by hand (global): per-intent failed on test" in card and "not a clean held-out estimate" in card
    )


def test_write_card_writes_the_card_push_would_upload_and_nothing_else(bundle_dir, metrics_path, tmp_path):
    card_path = tmp_path / "out" / "README.md"
    lock_path = tmp_path / "bundle.lock.json"
    run("--bundle", str(bundle_dir), "--repo", REPO, "--lock", str(lock_path), "--metrics", str(metrics_path),
        "--write-card", str(card_path))  # fmt: skip
    raw = card_path.read_bytes()
    assert raw.decode("utf-8") == card_for(bundle_dir, metrics_path) and b"\r" not in raw
    assert not lock_path.exists(), "--write-card alone does not write a lock"


def test_write_card_refuses_a_stale_report(bundle_dir, tmp_path):
    stale = make_metrics(tmp_path, version="intent-19990101-older-s1")
    message = refusal(
        "--bundle", str(bundle_dir), "--metrics", str(stale), "--write-card", str(tmp_path / "c.md")
    )
    assert "describes bundle" in message and not (tmp_path / "c.md").exists()


# ------------------------------------------------------------------------------------ --push


class FakeHub:
    """Stands in for huggingface_hub: records the calls and snapshots what upload_folder was given."""

    def __init__(
        self, lock_path: Path, *, upload_error: Exception | None = None, repo_error: Exception | None = None
    ):
        self.lock_path = lock_path
        self.upload_error, self.repo_error = upload_error, repo_error
        self.create_repo_calls: list[dict] = []
        self.upload_folder_calls: list[dict] = []
        self.uploaded: dict[str, bytes] = {}
        self.lock_existed_at_upload: bool | None = None

    def create_repo(self, repo_id, **kwargs):
        self.create_repo_calls.append({"repo_id": repo_id, **kwargs})
        if self.repo_error:
            raise self.repo_error
        return SimpleNamespace(repo_id=repo_id)

    def upload_folder(self, *, repo_id, folder_path, **kwargs):
        self.upload_folder_calls.append({"repo_id": repo_id, "folder_path": folder_path, **kwargs})
        self.lock_existed_at_upload = self.lock_path.exists()
        self.uploaded = {p.name: p.read_bytes() for p in Path(folder_path).iterdir()}
        if self.upload_error:
            raise self.upload_error
        return SimpleNamespace(oid=REVISION, commit_url="https://example.invalid/commit")


STUB_FETCHER = """
import argparse, hashlib, json, os, shutil, sys
from pathlib import Path

ap = argparse.ArgumentParser()
ap.add_argument("--lock", required=True)
ap.add_argument("--dest", required=True)
args = ap.parse_args()
for name in ("HF_WRITE_TOKEN", "HF_TOKEN", "HUGGING_FACE_HUB_TOKEN"):
    if os.environ.get(name):
        sys.exit(f"{name} leaked into the fetcher's environment")
lock = json.loads(Path(args.lock).read_text(encoding="utf-8"))
if lock["revision"] != os.environ["EXPECTED_REVISION"]:
    sys.exit("the lock handed to the fetcher has the wrong revision")
if os.environ.get("STUB_COUNT"):
    with open(os.environ["STUB_COUNT"], "a", encoding="utf-8") as f:
        f.write("run" + chr(10))
if os.environ.get("STUB_FAIL"):
    print("stub fetch failed on purpose", file=sys.stderr)
    sys.exit(int(os.environ["STUB_FAIL"]))
for name, info in lock["files"].items():
    data = Path(os.environ["STUB_SOURCE"], name).read_bytes()
    assert hashlib.sha256(data).hexdigest() == info["sha256"], name
    Path(args.dest, name).write_bytes(data)
print("fetched", len(lock["files"]), "files")
"""


@pytest.fixture
def push_env(tmp_path, bundle_dir, metrics_path, monkeypatch):
    """A fake Hub, a stub fetcher that 'downloads' from the bundle directory, the token in the environment."""
    lock_path = tmp_path / "backend" / "bundle.lock.json"
    hub = FakeHub(lock_path)
    monkeypatch.setitem(
        sys.modules,
        "huggingface_hub",
        SimpleNamespace(create_repo=hub.create_repo, upload_folder=hub.upload_folder),
    )
    stub = tmp_path / "fetch_stub.py"
    stub.write_text(STUB_FETCHER, encoding="utf-8")
    monkeypatch.setattr(pb, "FETCHER", stub)
    monkeypatch.setattr(pb, "ROUND_TRIP_RETRY_SECONDS", 0)
    monkeypatch.setenv("HF_WRITE_TOKEN", TOKEN)
    monkeypatch.setenv(
        "HF_TOKEN", "hf_dummy_read_token"
    )  # Render's embedding token: must not reach the fetcher
    monkeypatch.setenv("HUGGING_FACE_HUB_TOKEN", "hf_dummy_hub_token")
    monkeypatch.setenv("EXPECTED_REVISION", REVISION)
    monkeypatch.setenv("STUB_SOURCE", str(bundle_dir))
    monkeypatch.delenv("STUB_FAIL", raising=False)
    args = [
        "--bundle",
        str(bundle_dir),
        "--repo",
        REPO,
        "--lock",
        str(lock_path),
        "--metrics",
        str(metrics_path),
        "--push",
    ]
    return SimpleNamespace(hub=hub, lock_path=lock_path, args=args, bundle_dir=bundle_dir)


def all_output(capsys) -> str:
    out = capsys.readouterr()
    return out.out + out.err


def test_push_refuses_without_the_token_and_never_calls_the_hub(push_env, monkeypatch, capsys):
    monkeypatch.delenv("HF_WRITE_TOKEN")
    assert "HF_WRITE_TOKEN" in refusal(*push_env.args)
    assert not push_env.hub.create_repo_calls and not push_env.hub.upload_folder_calls
    assert not push_env.lock_path.exists()
    monkeypatch.setenv("HF_WRITE_TOKEN", "   ")  # blank is absent
    assert "HF_WRITE_TOKEN" in refusal(*push_env.args)
    assert not push_env.hub.create_repo_calls


@pytest.mark.parametrize("flag", ["--token", "--hf-token", "--token=" + SECRETISH])
def test_the_token_cannot_be_given_as_an_argument_and_is_not_echoed(push_env, flag, capsys):
    args = [*push_env.args, flag] if "=" in flag else [*push_env.args, flag, SECRETISH]
    with pytest.raises(SystemExit) as exc:
        run(*args)
    assert exc.value.code == 2
    shown = all_output(capsys)
    assert SECRETISH not in shown and "HF_WRITE_TOKEN" in shown
    assert not push_env.hub.create_repo_calls


def test_push_makes_one_public_repo_call_and_one_commit_then_writes_the_lock(push_env, capsys):
    run(*push_env.args)
    hub = push_env.hub
    assert len(hub.create_repo_calls) == 1 and len(hub.upload_folder_calls) == 1
    create, upload = hub.create_repo_calls[0], hub.upload_folder_calls[0]
    assert create["repo_id"] == REPO and create["private"] is False
    assert create["repo_type"] == "model" and create["exist_ok"] is True and create["token"] == TOKEN
    assert upload["repo_id"] == REPO and upload["repo_type"] == "model" and upload["token"] == TOKEN
    assert set(hub.uploaded) == {*pb.FILES, "README.md"}, "the five files plus the model card, one commit"
    for name in pb.FILES:
        assert hub.uploaded[name] == (push_env.bundle_dir / name).read_bytes()
    assert b"not measured yet" in hub.uploaded["README.md"] and b"\r" not in hub.uploaded["README.md"]
    assert hub.lock_existed_at_upload is False, "the lock is written only after the round trip"

    lock = json.loads(push_env.lock_path.read_text(encoding="utf-8"))
    assert lock["revision"] == REVISION and lock["repo"] == REPO and lock["version"] == VERSION
    assert lock["files"]["model.onnx"]["sha256"] == sha((push_env.bundle_dir / "model.onnx").read_bytes())
    assert list(lock) == ["schema", "repo", "revision", "version", "files"]
    # the README on the Hub lists the same hashes the lock does
    readme = hub.uploaded["README.md"].decode("utf-8")
    assert all(info["sha256"] in readme for info in lock["files"].values())

    shown = all_output(capsys)
    assert REVISION in shown and TOKEN not in shown
    assert TOKEN not in push_env.lock_path.read_text(encoding="utf-8") and TOKEN not in readme


def test_push_of_an_unpublished_lock_over_an_old_revision_replaces_it(push_env):
    old = push_env.lock_path
    old.parent.mkdir(parents=True)
    pb.write_lock(old, pb.build_lock(pb.inspect_bundle(push_env.bundle_dir), REPO, OTHER_REVISION))
    run(*push_env.args)
    assert json.loads(old.read_text(encoding="utf-8"))["revision"] == REVISION


def test_a_failed_upload_scrubs_the_token_and_leaves_the_lock_alone(push_env, capsys):
    push_env.hub.upload_error = RuntimeError(f"401 Unauthorized for token {TOKEN} (Bearer {TOKEN})")
    message = refusal(*push_env.args)
    assert TOKEN not in message and "upload failed" in message and "[hf-token]" in message
    assert TOKEN not in all_output(capsys)
    assert not push_env.lock_path.exists()


def test_a_failed_repo_creation_scrubs_the_token(push_env, capsys):
    push_env.hub.repo_error = ConnectionError(f"could not reach the hub with {SECRETISH}")
    message = refusal(*push_env.args)
    assert SECRETISH not in message and TOKEN not in message
    assert not push_env.hub.upload_folder_calls and not push_env.lock_path.exists()


def test_a_failed_round_trip_prints_the_revision_and_keeps_the_old_lock(
    push_env, monkeypatch, capsys, tmp_path
):
    old = push_env.lock_path
    pb.write_lock(old, pb.build_lock(pb.inspect_bundle(push_env.bundle_dir), REPO, OTHER_REVISION))
    before = old.read_bytes()
    counter = tmp_path / "runs.txt"
    monkeypatch.setenv("STUB_COUNT", str(counter))
    monkeypatch.setenv("STUB_FAIL", "1")
    message = refusal(*push_env.args)
    assert REVISION in message and "COMMIT EXISTS" in message and "NOT updated" in message
    assert TOKEN not in message and TOKEN not in all_output(capsys)
    assert old.read_bytes() == before, "the previous lock is untouched"
    assert len(counter.read_text().split()) == pb.ROUND_TRIP_ATTEMPTS, "a transient failure is retried"


def test_a_fetcher_that_rejects_the_lock_is_not_retried(push_env, monkeypatch, tmp_path):
    counter = tmp_path / "runs.txt"
    monkeypatch.setenv("STUB_COUNT", str(counter))
    monkeypatch.setenv("STUB_FAIL", "2")  # the fetcher's exit code for an unusable lock
    message = refusal(*push_env.args)
    assert REVISION in message and "rejected the lock" in message
    assert len(counter.read_text().split()) == 1
    assert not push_env.lock_path.exists()


def test_a_missing_fetcher_fails_after_the_commit_with_the_revision(push_env, monkeypatch, tmp_path):
    monkeypatch.setattr(pb, "FETCHER", tmp_path / "does_not_exist.py")
    message = refusal(*push_env.args)
    assert REVISION in message and "not found" in message and "COMMIT EXISTS" in message
    assert not push_env.lock_path.exists()


def test_a_fetcher_that_lies_is_caught_by_the_publisher(push_env, monkeypatch, tmp_path):
    """A fetcher that exits 0 but writes the wrong bytes must not get its revision into the lock."""
    liar = tmp_path / "liar.py"
    liar.write_text(
        "import argparse, os\nfrom pathlib import Path\n"
        "ap = argparse.ArgumentParser(); ap.add_argument('--lock'); ap.add_argument('--dest'); a = ap.parse_args()\n"
        "[Path(a.dest, n).write_bytes(b'junk') for n in ('model.onnx','tokenizer.json','labels.json','calibration.json','meta.json')]\n",
        encoding="utf-8",
    )
    monkeypatch.setattr(pb, "FETCHER", liar)
    message = refusal(*push_env.args)
    assert REVISION in message and "does not match the lock" in message
    assert not push_env.lock_path.exists()


def test_a_bundle_that_changes_while_staging_is_not_uploaded(push_env, monkeypatch):
    real_stage = pb._stage

    def tampering_stage(src, staging):
        real_stage(src, staging)
        with open(staging / "model.onnx", "ab") as f:
            f.write(b"\x00")  # the staged copy is no longer what meta.json hashed

    monkeypatch.setattr(pb, "_stage", tampering_stage)
    message = refusal(*push_env.args)
    assert "model.onnx" in message and "meta.json" in message
    assert not push_env.hub.create_repo_calls and not push_env.hub.upload_folder_calls


def test_push_refuses_a_stale_report_before_touching_the_hub(push_env, tmp_path):
    make_metrics(tmp_path, version="intent-19990101-older-s1")
    assert "describes bundle" in refusal(*push_env.args)
    assert not push_env.hub.create_repo_calls


def test_push_without_huggingface_hub_says_what_to_install(push_env, monkeypatch):
    monkeypatch.setitem(sys.modules, "huggingface_hub", None)
    assert "huggingface_hub" in refusal(*push_env.args)


def test_scrub_removes_the_token_in_every_shape():
    text = f"{TOKEN} and hf_ABCDEFGH12345 and Authorization: Bearer abc.DEF-123"
    cleaned = pb.scrub(text, TOKEN)
    assert TOKEN not in cleaned and "hf_ABCDEFGH12345" not in cleaned and "abc.DEF-123" not in cleaned


# ------------------------------------------------------------------------------------ the real fetcher


REAL_FETCHER = pb.BACKEND / "scripts" / "fetch_intent_bundle.py"


class _Handler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args):  # silence
        pass


@pytest.mark.skipif(not REAL_FETCHER.is_file(), reason="the consumer-side fetcher is not in the tree")
def test_the_real_fetcher_accepts_the_lock_we_write(bundle_dir, tmp_path):
    """Producer and consumer agree: our lock + a local server shaped like Hugging Face's /resolve/ URLs."""
    served = tmp_path / "www" / REPO / "resolve" / REVISION
    served.mkdir(parents=True)
    for name in pb.FILES:
        shutil.copy2(bundle_dir / name, served / name)
    lock_path = tmp_path / "bundle.lock.json"
    pb.write_lock(lock_path, pb.build_lock(pb.inspect_bundle(bundle_dir), REPO, REVISION))

    handler = lambda *a, **k: _Handler(*a, directory=str(tmp_path / "www"), **k)  # noqa: E731
    server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    proxies = {
        "HTTP_PROXY",
        "HTTPS_PROXY",
        "ALL_PROXY",
        "NO_PROXY",
    }  # the fetcher honours them: keep it local
    env = {k: v for k, v in os.environ.items() if k not in pb.SECRET_ENV and k.upper() not in proxies}
    env["NO_PROXY"] = "127.0.0.1"
    base = f"http://127.0.0.1:{server.server_address[1]}"
    dest = tmp_path / "out"

    def fetch() -> subprocess.CompletedProcess:
        cmd = [sys.executable, str(REAL_FETCHER), "--lock", str(lock_path), "--dest", str(dest)]
        cmd += ["--base-url", base, "--backoff", "0"]
        return subprocess.run(cmd, capture_output=True, text=True, env=env, timeout=120)

    try:
        good = fetch()
        assert good.returncode == 0, good.stdout + good.stderr
        for name in pb.FILES:
            assert (dest / name).read_bytes() == (bundle_dir / name).read_bytes()
        # a poisoned file on the server must fail the build and leave no bundle behind
        (served / "model.onnx").write_bytes(b"tampered" * 400)
        shutil.rmtree(dest)
        bad = fetch()
        assert bad.returncode == 1 and "model.onnx" in bad.stderr
        assert not dest.exists()
    finally:
        server.shutdown()
