"""scripts/fetch_intent_bundle.py: the build-time fetch of the Tier 1c ONNX bundle from the Hugging Face Hub.

A stdlib http.server on 127.0.0.1 (ephemeral port, daemon thread) plays huggingface.co: it serves
/<repo>/resolve/<revision>/<file>, one file behind a 302 hop, and can be told to fail, truncate, overshoot or
corrupt any file. Nothing here touches the network or the real bundle; locks are built in tmp_path.
"""

from __future__ import annotations

import fnmatch
import hashlib
import importlib.util
import json
import os
import socket
import subprocess
import sys
import threading
from collections import Counter
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

import pytest

from app.orchestration import onnx_classifier

BACKEND = Path(__file__).resolve().parents[1]
SCRIPT = BACKEND / "scripts" / "fetch_intent_bundle.py"
REPO = "someone/studyloop-intent"
REVISION = "ab" * 20
VERSION = "intent-test-1"
FILES = ("model.onnx", "tokenizer.json", "labels.json", "calibration.json", "meta.json")
SIZES = {
    "model.onnx": 40_000,
    "tokenizer.json": 3_000,
    "labels.json": 200,
    "calibration.json": 500,
    "meta.json": 700,
}
NOT_PUBLISHED = "bundle not published yet (revision is null)"


def _load_script():
    spec = importlib.util.spec_from_file_location("fetch_intent_bundle", SCRIPT)
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


fetch = _load_script()


def make_files(tag: str = "v1") -> dict[str, bytes]:
    """Deterministic fake bundle; model.onnx is the biggest, so the fetcher downloads it last."""
    out = {}
    for name, size in SIZES.items():
        seed = hashlib.sha256(f"{tag}/{name}".encode()).digest()
        out[name] = (seed * (size // len(seed) + 1))[:size]
    return out


def corrupt(path: Path) -> None:
    """Flip one byte, keeping the size."""
    data = bytearray(path.read_bytes())
    data[0] ^= 0xFF
    path.write_bytes(bytes(data))


class Hub:
    """The fake huggingface.co plus the knobs each test turns."""

    def __init__(self, files: dict[str, bytes]) -> None:
        self.files = dict(files)
        self.url = ""
        self.requests: list[str] = []  # every request path, in order (the CDN hop included)
        self.headers: list[dict[str, str]] = []
        self.attempts: Counter[str] = Counter()  # resolve requests per file
        self.redirect = {"tokenizer.json"}  # files served through a 302 to /cdn/...
        self.first: dict[str, list[int]] = {}  # file -> statuses to answer with before serving it normally
        self.status: dict[
            str, int
        ] = {}  # file -> a status to answer with every time (0 = drop the connection)
        self.body: dict[
            str, object
        ] = {}  # file -> f(true bytes, attempt) -> (declared length, bytes to send)

    def lock(self, **override) -> dict:
        lock = {
            "schema": 1,
            "repo": REPO,
            "revision": REVISION,
            "version": VERSION,
            "files": {
                n: {"bytes": len(self.files[n]), "sha256": hashlib.sha256(self.files[n]).hexdigest()}
                for n in FILES
            },
        }
        lock.update(override)
        return lock

    def fetched(self) -> list[str]:
        """Names of the files asked for at the resolve URL (the CDN hop excluded), sorted."""
        prefix = f"/{REPO}/resolve/{REVISION}/"
        return sorted({p[len(prefix) :] for p in self.requests if p.startswith(prefix)})


class _Server(ThreadingHTTPServer):
    def handle_error(self, request, client_address):  # the client hanging up mid-body is part of the tests
        pass


class _Handler(BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass

    def _send(self, status: int, body: bytes = b"", declared: int | None = None, headers=()) -> None:
        self.send_response(status)
        self.send_header("Content-Length", str(len(body) if declared is None else declared))
        for key, value in headers:
            self.send_header(key, value)
        self.end_headers()
        try:
            self.wfile.write(body)
            self.wfile.flush()
        except (BrokenPipeError, ConnectionError):
            pass
        self.close_connection = True

    def _reply(self, status: int) -> None:
        """An error answer; status 0 = hang up without answering (the client sees a dropped connection)."""
        if status == 0:
            self.close_connection = True
        else:
            self._send(status, b"error body")

    def do_GET(self):
        hub: Hub = self.server.hub
        hub.requests.append(self.path)
        hub.headers.append(dict(self.headers))
        resolve, cdn = f"/{REPO}/resolve/{REVISION}/", f"/cdn/{REVISION}/"
        if self.path.startswith(resolve):
            name, hop = self.path[len(resolve) :], False
        elif self.path.startswith(cdn):
            name, hop = self.path[len(cdn) :], True
        else:
            return self._send(404, b"no such repo")
        if name not in hub.files:
            return self._send(404, b"no such file")
        if not hop:
            hub.attempts[name] += 1
            if hub.first.get(name):
                return self._reply(hub.first[name].pop(0))
            if name in hub.status:
                return self._reply(hub.status[name])
            if name in hub.redirect:
                return self._send(302, headers=[("Location", f"{cdn}{name}")])
        data = hub.files[name]
        declared, body = hub.body[name](data, hub.attempts[name]) if name in hub.body else (len(data), data)
        self._send(200, body, declared)


@pytest.fixture
def hub(monkeypatch):
    # a developer's proxy settings must not swallow requests to 127.0.0.1
    for var in ("HTTP_PROXY", "http_proxy", "HTTPS_PROXY", "https_proxy", "ALL_PROXY", "all_proxy"):
        monkeypatch.delenv(var, raising=False)
    for var in ("NO_PROXY", "no_proxy"):
        monkeypatch.setenv(var, "127.0.0.1,localhost")
    h = Hub(make_files())
    server = _Server(("127.0.0.1", 0), _Handler)
    server.hub = h
    h.url = f"http://127.0.0.1:{server.server_address[1]}"
    thread = threading.Thread(target=server.serve_forever, kwargs={"poll_interval": 0.01}, daemon=True)
    thread.start()
    yield h
    server.shutdown()
    server.server_close()
    thread.join(5)


@pytest.fixture
def dest(tmp_path) -> Path:
    return (
        tmp_path / "models" / "intent"
    )  # neither level exists: the fetcher creates (and on failure removes) both


@pytest.fixture
def cli(hub, tmp_path, dest, capsys):
    """cli(*extra, lock=None) -> (exit code, stdout, stderr)."""

    def run(*extra: str, lock=None) -> tuple[int, str, str]:
        lock_path = tmp_path / "bundle.lock.json"
        lock_path.write_text(
            json.dumps(hub.lock() if lock is None else lock, indent=2) + "\n", encoding="utf-8"
        )
        argv = [
            "--lock",
            str(lock_path),
            "--dest",
            str(dest),
            "--base-url",
            hub.url,
            "--backoff",
            "0",
            *extra,
        ]
        code = fetch.main(argv)
        out, err = capsys.readouterr()
        return code, out, err

    return run


def assert_nothing_left(tmp_path: Path) -> None:
    """A failed run leaves no models/ directory, no .part file, nothing."""
    assert not (tmp_path / "models").exists()
    assert not list(tmp_path.rglob("*.part"))


def assert_installed(dest: Path, hub: Hub) -> None:
    assert sorted(p.name for p in dest.iterdir()) == sorted(FILES)
    for name in FILES:
        assert (dest / name).read_bytes() == hub.files[name]


# --- the happy path ------------------------------------------------------------------------------------------------


def test_downloads_the_bundle(cli, hub, dest):
    code, out, err = cli()
    assert code == 0, err
    assert err == ""
    assert out.strip().splitlines() == [
        f"intent bundle {VERSION} ready: 5 files, {sum(SIZES.values()) / 1e6:.1f} MB total, revision {REVISION[:12]}"
    ]
    assert_installed(dest, hub)
    assert hub.fetched() == sorted(FILES)
    assert f"/cdn/{REVISION}/tokenizer.json" in hub.requests  # the 302 hop was followed
    assert len(hub.requests) == len(FILES) + 1
    for headers in hub.headers:  # a User-Agent, and no credentials of any kind
        assert headers.get("User-Agent")
        assert not {"Authorization", "Cookie"} & set(headers)


def test_defaults_match_the_serving_code():
    assert fetch.DEFAULT_LOCK == BACKEND / "bundle.lock.json"
    assert fetch.DEFAULT_DEST == onnx_classifier.DEFAULT_DIR  # /app/models/intent in the image
    assert fetch.BUNDLE_FILES == FILES


# --- corrupted or wrong bodies -------------------------------------------------------------------------------------


def test_sha256_mismatch_fails_without_retry(cli, hub, tmp_path):
    # the lock describes the real model.onnx; the server hands out the same number of bytes with one flipped
    hub.body["model.onnx"] = lambda data, n: (len(data), bytes([data[0] ^ 0xFF]) + data[1:])
    code, out, err = cli()
    assert code == 1
    assert out == ""
    assert "model.onnx" in err and "sha256 mismatch" in err
    assert hub.attempts["model.onnx"] == 1  # a checksum mismatch is never retried
    assert_nothing_left(tmp_path)


def test_truncated_body_is_retried_then_fails(cli, hub, tmp_path):
    hub.body["model.onnx"] = lambda data, n: (len(data), data[: len(data) // 2])
    code, out, err = cli()
    assert code == 1
    assert "truncated" in err and "model.onnx" in err
    assert hub.attempts["model.onnx"] == 4
    assert_nothing_left(tmp_path)


def test_truncated_once_then_complete_succeeds(cli, hub, dest):
    hub.body["model.onnx"] = lambda data, n: (len(data), data[:100]) if n == 1 else (len(data), data)
    code, out, err = cli()
    assert code == 0, err
    assert hub.attempts["model.onnx"] == 2
    assert_installed(dest, hub)


def test_body_larger_than_the_lock_is_refused(cli, hub, tmp_path):
    hub.body["model.onnx"] = lambda data, n: (len(data) + 5_000, data + b"x" * 5_000)
    code, out, err = cli()
    assert code == 1
    assert "exceeds the 40000 bytes in the lock" in err
    assert hub.attempts["model.onnx"] == 1  # not retried
    assert_nothing_left(tmp_path)


def test_size_cap_stops_reading_early(tmp_path):
    """The cap acts while streaming: a body far bigger than the lock is abandoned after the first chunk."""

    class Big:
        def __init__(self):
            self.reads = 0

        def read(self, n):
            self.reads += 1
            return b"x" * 4096 if self.reads <= 1000 else b""

    resp = Big()
    part = tmp_path / ".model.onnx.part"
    with pytest.raises(fetch.FetchError, match="exceeds"):
        fetch._copy_verified(resp, part, size=1000, sha256="0" * 64)
    assert resp.reads == 1
    assert not part.exists()


# --- HTTP failures -------------------------------------------------------------------------------------------------


@pytest.mark.parametrize("failures", [[503], [429], [500, 502], [503, 503, 503], [0], [0, 503, 0]])
def test_transient_http_errors_are_retried(cli, hub, dest, failures):
    hub.first["model.onnx"] = list(failures)
    code, out, err = cli()
    assert code == 0, err
    assert hub.attempts["model.onnx"] == len(failures) + 1
    assert_installed(dest, hub)


def test_gives_up_after_four_attempts(cli, hub, tmp_path):
    hub.first["model.onnx"] = [503] * 10
    code, out, err = cli()
    assert code == 1
    assert "HTTP 503" in err and "4 attempts" in err
    assert hub.attempts["model.onnx"] == 4
    assert_nothing_left(tmp_path)


@pytest.mark.parametrize("status", [404, 403, 401, 410])
def test_other_client_errors_are_permanent(cli, hub, tmp_path, status):
    hub.status["tokenizer.json"] = status
    code, out, err = cli()
    assert code == 1
    assert f"HTTP {status}" in err and "tokenizer.json" in err
    assert err.strip().count("\n") == 0  # one line for the one failure
    assert hub.attempts["tokenizer.json"] == 1
    assert_nothing_left(tmp_path)


def test_dropped_connection_is_a_retried_network_error(cli, hub, tmp_path):
    hub.status["model.onnx"] = 0  # the server hangs up without answering, every time
    code, out, err = cli()
    assert code == 1
    assert "network error" in err and "4 attempts" in err
    assert hub.attempts["model.onnx"] == 4
    assert_nothing_left(tmp_path)


# --- the lock is validated before any network access -------------------------------------------------------------


def test_revision_null_downloads_nothing(cli, hub, dest, tmp_path):
    code, out, err = cli(lock=hub.lock(revision=None))
    assert code == 2
    assert (
        "bundle not published yet (revision is null): run ml/publish_bundle.py --push "
        "and commit the updated bundle.lock.json" in err
    )
    assert hub.requests == []
    assert not (tmp_path / "models").exists()


@pytest.mark.parametrize(
    "bad", ["../labels.json", "sub/labels.json", "sub\\labels.json", ".labels.json", "la..bels.json"]
)
def test_traversal_name_in_the_lock_is_refused(cli, hub, tmp_path, bad):
    lock = hub.lock()
    lock["files"][bad] = lock["files"].pop("labels.json")
    code, out, err = cli(lock=lock)
    assert code == 2
    assert "unsafe file name" in err
    assert hub.requests == []
    assert not (tmp_path / "models").exists() and not (tmp_path.parent / "labels.json").exists()


def test_lock_missing_one_of_the_five_files(cli, hub, tmp_path):
    lock = hub.lock()
    del lock["files"]["meta.json"]
    code, out, err = cli(lock=lock)
    assert code == 2
    assert "missing meta.json" in err
    assert hub.requests == []


def test_lock_with_an_extra_file(cli, hub):
    lock = hub.lock()
    lock["files"]["extra.bin"] = dict(lock["files"]["labels.json"])
    code, out, err = cli(lock=lock)
    assert code == 2
    assert "unexpected extra.bin" in err
    assert hub.requests == []


MALFORMED_LOCKS = {
    "schema 2": (lambda lock: lock.update(schema=2), "schema"),
    "schema true": (lambda lock: lock.update(schema=True), "schema"),
    "schema missing": (lambda lock: lock.pop("schema"), "schema"),
    "repo without owner": (lambda lock: lock.update(repo="no-slash"), "repo"),
    "repo with three parts": (lambda lock: lock.update(repo="a/b/c"), "repo"),
    "repo dot-dot owner": (lambda lock: lock.update(repo="../x"), "repo"),
    "repo with a space": (lambda lock: lock.update(repo="owner/has space"), "repo"),
    "repo missing": (lambda lock: lock.pop("repo"), "repo"),
    "revision is a branch": (lambda lock: lock.update(revision="main"), "revision"),
    "revision uppercase": (lambda lock: lock.update(revision="AB" * 20), "revision"),
    "revision too short": (lambda lock: lock.update(revision="ab" * 19), "revision"),
    "revision not a string": (lambda lock: lock.update(revision=7), "revision"),
    "revision missing": (lambda lock: lock.pop("revision"), "revision"),
    "version empty": (lambda lock: lock.update(version=""), "version"),
    "version not a string": (lambda lock: lock.update(version=3), "version"),
    "version missing": (lambda lock: lock.pop("version"), "version"),
    "bytes zero": (lambda lock: lock["files"]["model.onnx"].update(bytes=0), "bytes"),
    "bytes negative": (lambda lock: lock["files"]["model.onnx"].update(bytes=-5), "bytes"),
    "bytes a string": (lambda lock: lock["files"]["model.onnx"].update(bytes="40000"), "bytes"),
    "bytes a bool": (lambda lock: lock["files"]["model.onnx"].update(bytes=True), "bytes"),
    "bytes a float": (lambda lock: lock["files"]["model.onnx"].update(bytes=1.5), "bytes"),
    "sha256 uppercase": (lambda lock: lock["files"]["model.onnx"].update(sha256="A" * 64), "sha256"),
    "sha256 too short": (lambda lock: lock["files"]["model.onnx"].update(sha256="a" * 63), "sha256"),
    "sha256 missing": (lambda lock: lock["files"]["model.onnx"].pop("sha256"), "sha256"),
    "files not an object": (lambda lock: lock.update(files=[]), "files"),
}


@pytest.mark.parametrize("case", list(MALFORMED_LOCKS))
def test_malformed_lock_is_refused(cli, hub, case):
    mutation, fragment = MALFORMED_LOCKS[case]
    lock = hub.lock()
    mutation(lock)
    code, out, err = cli(lock=lock)
    assert code == 2
    assert fragment in err
    assert hub.requests == []


def test_unreadable_lock_is_refused(tmp_path, hub):
    for content in (None, b"not json", b"\xff\xfe", b"\xef\xbb\xbf{}", b"[]"):
        lock = tmp_path / "lock.json"
        lock.unlink(missing_ok=True)
        if content is not None:
            lock.write_bytes(content)
        assert fetch.main(["--lock", str(lock), "--dest", str(tmp_path / "d"), "--base-url", hub.url]) == 2
    assert hub.requests == []


# --- idempotence and cleanup --------------------------------------------------------------------------------------


def test_rerun_downloads_only_what_is_missing_or_wrong(cli, hub, dest):
    assert cli()[0] == 0
    hub.requests.clear()
    hub.attempts.clear()

    code, out, err = cli()
    assert code == 0, err
    assert hub.requests == []  # everything already good: not a single request
    assert "ready" in out

    (dest / "labels.json").unlink()
    corrupt(dest / "meta.json")
    code, out, err = cli()
    assert code == 0, err
    assert hub.fetched() == ["labels.json", "meta.json"]
    assert_installed(dest, hub)


def test_failed_run_leaves_dest_absent(cli, hub, tmp_path):
    """model.onnx is downloaded last: the other four are already on disk as .part files when it fails."""
    hub.status["model.onnx"] = 404
    code, out, err = cli()
    assert code == 1
    assert hub.fetched() == sorted(FILES)
    assert_nothing_left(tmp_path)


def test_failed_run_leaves_an_existing_dest_as_it_found_it(cli, hub, dest):
    dest.mkdir(parents=True)
    (dest / "notes.txt").write_text("mine")
    hub.status["model.onnx"] = 404
    code, out, err = cli()
    assert code == 1
    assert [p.name for p in dest.iterdir()] == ["notes.txt"]


def test_failed_update_leaves_the_previous_bundle_intact(cli, hub, dest):
    assert cli()[0] == 0
    v1 = {n: (dest / n).read_bytes() for n in FILES}

    hub.files = make_files("v2")  # a new revision; its model.onnx will not download
    hub.status["model.onnx"] = 404
    code, out, err = cli()
    assert code == 1
    assert {n: (dest / n).read_bytes() for n in FILES} == v1  # no half-new, half-old bundle
    assert sorted(p.name for p in dest.iterdir()) == sorted(FILES)  # and no .part files


def test_final_rehash_catches_damage_and_removes_what_this_run_wrote(cli, hub, tmp_path, monkeypatch):
    real_replace = fetch.os.replace

    def replace_then_damage(src, dst):
        real_replace(src, dst)
        if Path(dst).name == "labels.json":
            corrupt(Path(dst))

    monkeypatch.setattr(fetch.os, "replace", replace_then_damage)
    code, out, err = cli()
    assert code == 1
    assert out == ""
    lines = err.strip().splitlines()
    assert len(lines) == 1 and lines[0].startswith("error: labels.json: sha256 ")
    assert_nothing_left(tmp_path)  # the files this run moved into place are deleted again, and so is dest


def test_stale_part_files_from_a_killed_run_are_removed(cli, hub, dest):
    dest.mkdir(parents=True)
    (dest / ".model.onnx.part").write_bytes(b"half a model")
    code, out, err = cli()
    assert code == 0, err
    assert_installed(dest, hub)


# --- --verify-only ------------------------------------------------------------------------------------------------


def test_verify_only_on_a_good_bundle(cli, hub, dest):
    assert cli()[0] == 0
    hub.requests.clear()
    code, out, err = cli("--verify-only")
    assert code == 0, err
    assert f"intent bundle {VERSION} verified: 5 files" in out
    assert hub.requests == []


def test_verify_only_reports_every_bad_file_and_changes_nothing(cli, hub, dest):
    assert cli()[0] == 0
    hub.requests.clear()
    corrupt(dest / "model.onnx")
    (dest / "labels.json").unlink()
    (dest / "meta.json").write_bytes(b"short")
    before = {p.name: p.read_bytes() for p in dest.iterdir()}

    code, out, err = cli("--verify-only")
    assert code == 1
    assert out == ""
    lines = err.strip().splitlines()
    assert len(lines) == 3
    assert any(line.startswith("error: model.onnx: sha256") for line in lines)
    assert any(line.startswith("error: labels.json: missing") for line in lines)
    assert any(line.startswith("error: meta.json: 5 bytes on disk") for line in lines)
    assert hub.requests == []  # nothing downloaded
    assert {p.name: p.read_bytes() for p in dest.iterdir()} == before  # nothing repaired


def test_verify_only_without_a_bundle(cli, hub, tmp_path):
    code, out, err = cli("--verify-only")
    assert code == 1
    assert err.count("missing") == 5
    assert not (tmp_path / "models").exists()  # --verify-only never creates dest


# --- the CLI as the Dockerfile runs it ----------------------------------------------------------------------------


def test_cli_exit_codes(hub, tmp_path, dest):
    def lock_file(name: str, lock: dict) -> str:
        path = tmp_path / name
        path.write_text(json.dumps(lock, indent=2) + "\n", encoding="utf-8")
        return str(path)

    def run(*args: str) -> subprocess.CompletedProcess:
        return subprocess.run(
            [sys.executable, str(SCRIPT), *args], capture_output=True, text=True, timeout=60, check=False
        )

    good = lock_file("good.lock.json", hub.lock())
    ok = run("--lock", good, "--dest", str(dest), "--base-url", hub.url, "--backoff", "0")
    assert ok.returncode == 0, ok.stderr
    assert f"intent bundle {VERSION} ready: 5 files" in ok.stdout
    assert_installed(dest, hub)

    assert run("--lock", good, "--dest", str(dest), "--verify-only").returncode == 0

    hub.status["tokenizer.json"] = 404
    broken = tmp_path / "other" / "intent"
    failed = run("--lock", good, "--dest", str(broken), "--base-url", hub.url, "--backoff", "0")
    assert failed.returncode == 1
    assert "tokenizer.json" in failed.stderr and not broken.exists()

    unpublished = lock_file("null.lock.json", hub.lock(revision=None))
    refused = run("--lock", unpublished, "--dest", str(tmp_path / "x"), "--base-url", hub.url)
    assert refused.returncode == 2
    assert NOT_PUBLISHED in refused.stderr

    bad = run("--lock", good, "--dest", str(tmp_path / "y"), "--base-url", "ftp://example.com")
    assert (
        bad.returncode == 2
    )  # bad arguments, argparse's own exit code, from the scheme check (the lock is valid)
    assert "--base-url must start with http:// or https://" in bad.stderr


def test_a_stalled_server_times_out_instead_of_hanging_the_build(hub, tmp_path, dest):
    """A server that accepts and never answers must cost ATTEMPTS x --timeout, not hang the Render build forever."""
    lock_path = tmp_path / "stall.lock.json"
    lock_path.write_text(json.dumps(hub.lock(), indent=2) + "\n", encoding="utf-8")
    with socket.socket() as stalled:
        stalled.bind(("127.0.0.1", 0))
        stalled.listen(8)  # the kernel completes the handshake; nobody ever reads or replies
        done = subprocess.run(
            [
                sys.executable,
                str(SCRIPT),
                *("--lock", str(lock_path), "--dest", str(dest)),
                *("--base-url", f"http://127.0.0.1:{stalled.getsockname()[1]}"),
                *("--timeout", "0.5", "--backoff", "0"),
            ],
            capture_output=True,
            text=True,
            timeout=30,  # a regression fails this test instead of hanging CI
            check=False,
        )
    assert done.returncode == 1, done.stderr
    assert "network error" in done.stderr and "4 attempts" in done.stderr
    assert not dest.exists()


# --- the committed lock and the Docker build ----------------------------------------------------------------------


def test_committed_lock_is_valid():
    path = BACKEND / "bundle.lock.json"
    if not path.exists():
        if os.environ.get("CI") and "COPY bundle.lock.json" in (BACKEND / "Dockerfile").read_text(
            encoding="utf-8"
        ):
            pytest.fail(  # green here would mean a broken Render build: the Dockerfile COPYs a file git doesn't have
                "backend/bundle.lock.json is missing but the Dockerfile COPYs it, so the image cannot build. "
                "Run ml/publish_bundle.py --push and commit the lock (docs/TIER1C_DEPLOY.md)."
            )
        pytest.skip("backend/bundle.lock.json has not been generated yet (ml/publish_bundle.py --write-lock)")
    lock = fetch.load_lock(
        path
    )  # the very validator the build uses: a null revision fails the build, so fails here
    assert list(json.loads(path.read_text(encoding="utf-8"))) == [
        "schema",
        "repo",
        "revision",
        "version",
        "files",
    ]
    assert list(lock["files"]) == list(FILES)


def _dockerfile_instructions() -> list[str]:
    text = (BACKEND / "Dockerfile").read_text(encoding="utf-8")
    return [line.strip() for line in text.splitlines() if line.strip() and not line.lstrip().startswith("#")]


def test_dockerfile_fetches_the_bundle_before_the_app_code():
    lines = _dockerfile_instructions()

    def at(prefix: str) -> int:
        return next(i for i, line in enumerate(lines) if line.startswith(prefix))

    assert (
        "WORKDIR /app" in lines
    )  # the script's defaults (../bundle.lock.json, ../models/intent) are relative to it
    steps = [
        at("RUN pip install"),
        at("COPY bundle.lock.json"),
        at("COPY scripts/fetch_intent_bundle.py"),
        at("RUN python scripts/fetch_intent_bundle.py"),
        at("COPY app "),
        at("COPY studyloop_nlp"),
    ]
    assert steps == sorted(
        steps
    ), "pip, lock, script, fetch, app, studyloop_nlp: app edits must not redo the fetch"
    assert "COPY bundle.lock.json ./bundle.lock.json" in lines
    assert "COPY scripts/fetch_intent_bundle.py ./scripts/fetch_intent_bundle.py" in lines
    # exactly this line: no `|| true` / `; exit 0` (a failed fetch must fail the build) and no flags (the defaults
    # put the bundle in /app/models/intent, where onnx_classifier.DEFAULT_DIR looks)
    assert "RUN python scripts/fetch_intent_bundle.py" in lines


def test_dockerignore_keeps_the_local_bundle_out_and_the_fetcher_in():
    text = (BACKEND / ".dockerignore").read_text(encoding="utf-8")
    patterns = [
        line.strip().rstrip("/") for line in text.splitlines() if line.strip() and not line.startswith("#")
    ]

    def ignored(path: str) -> bool:
        return any(path == p or path.startswith(p + "/") or fnmatch.fnmatch(path, p) for p in patterns)

    assert ignored("models/intent/model.onnx")  # the 67 MB local bundle never enters the build context
    for needed in (
        "bundle.lock.json",
        "scripts/fetch_intent_bundle.py",
        "app/main.py",
        "studyloop_nlp/__init__.py",
    ):
        assert not ignored(needed), needed
