#!/usr/bin/env python3
"""Fetch the Tier 1c ONNX intent bundle from the Hugging Face Hub: pinned to a commit, checksummed, all or nothing.

Runs at Docker build time (backend/Dockerfile) and by hand. Python standard library only: the image has nothing else
at that build step.

    python scripts/fetch_intent_bundle.py                 # lock = ../bundle.lock.json, dest = ../models/intent
    python scripts/fetch_intent_bundle.py --verify-only   # check dest against the lock, download nothing

backend/bundle.lock.json (written by ml/publish_bundle.py) names the repo, the commit sha and the size + sha256 of
the five bundle files. Each file is fetched from <base-url>/<repo>/resolve/<revision>/<file> (public repo: no
token), streamed to dest/.<file>.part while hashing, and only moved into place once EVERY file has passed its size and
sha256 check. A failed run therefore never leaves a half bundle behind: it removes its .part files (and dest, if it
created it) and a bundle that was already in dest is untouched. Files already in dest with the right sha256 are
skipped, so a rerun is free.

Exit codes: 0 ready, 1 download/verification failed (one line per failure on stderr), 2 unusable lock or arguments
(nothing was downloaded).
"""

from __future__ import annotations

import argparse
import hashlib
import http.client
import json
import os
import re
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

SCHEMA = 1
BUNDLE_FILES = ("model.onnx", "tokenizer.json", "labels.json", "calibration.json", "meta.json")
ROOT = Path(__file__).resolve().parent.parent  # backend/ locally, /app in the image
DEFAULT_LOCK = ROOT / "bundle.lock.json"
DEFAULT_DEST = ROOT / "models" / "intent"  # = app.orchestration.onnx_classifier.DEFAULT_DIR
DEFAULT_BASE_URL = "https://huggingface.co"
USER_AGENT = "studyloop-intent-bundle-fetch/1"
ATTEMPTS = 4  # per file; waits backoff, 2 x backoff, 4 x backoff in between
CHUNK = 1 << 20

NOT_PUBLISHED = (
    "bundle not published yet (revision is null): run ml/publish_bundle.py --push "
    "and commit the updated bundle.lock.json"
)
_REPO_RE = re.compile(r"[A-Za-z0-9._-]+/[A-Za-z0-9._-]+")
_REVISION_RE = re.compile(r"[0-9a-f]{40}")
_SHA256_RE = re.compile(r"[0-9a-f]{64}")


class LockError(ValueError):
    """The lock file is unusable. Raised before any network access (exit 2)."""


class FetchError(Exception):
    """One download or verification failure; `retryable` marks transient ones (429, 5xx, network, truncation)."""

    def __init__(self, message: str, retryable: bool = False) -> None:
        super().__init__(message)
        self.retryable = retryable


# --- the lock ------------------------------------------------------------------------------------------------------


def _is_int(value: object) -> bool:
    return isinstance(value, int) and not isinstance(value, bool)


def _bare_name(name: object) -> bool:
    return (
        isinstance(name, str)
        and bool(name)
        and "/" not in name
        and "\\" not in name
        and ".." not in name
        and not name.startswith(".")
    )


def validate_lock(lock: object) -> dict:
    """Return the lock if it is a usable schema-1 lock, else raise LockError with one clear line."""
    if not isinstance(lock, dict):
        raise LockError("lock must be a JSON object")
    if not _is_int(lock.get("schema")) or lock["schema"] != SCHEMA:
        raise LockError(f"unsupported lock schema {lock.get('schema')!r} (expected {SCHEMA})")

    repo = lock.get("repo")
    if not (isinstance(repo, str) and _REPO_RE.fullmatch(repo)) or {".", ".."} & set(repo.split("/")):
        raise LockError(f"repo must look like owner/name (got {repo!r})")

    if "revision" not in lock:
        raise LockError("revision is missing (null means 'not published yet', the key must still be there)")
    revision = lock["revision"]
    if revision is None:
        raise LockError(NOT_PUBLISHED)
    if not (isinstance(revision, str) and _REVISION_RE.fullmatch(revision)):
        raise LockError(f"revision must be a 40-character lowercase hex commit sha (got {revision!r})")

    version = lock.get("version")
    if not (isinstance(version, str) and version.strip()):
        raise LockError(f"version must be a non-empty string (got {version!r})")

    files = lock.get("files")
    if not isinstance(files, dict):
        raise LockError("files must be an object mapping file name to {bytes, sha256}")
    for name in files:
        if not _bare_name(name):
            raise LockError(f"unsafe file name in files: {name!r} (a bare file name is required)")
    missing = [n for n in BUNDLE_FILES if n not in files]
    extra = [n for n in files if n not in BUNDLE_FILES]
    if missing or extra:
        detail = []
        if missing:
            detail.append(f"missing {', '.join(missing)}")
        if extra:
            detail.append(f"unexpected {', '.join(extra)}")
        raise LockError(f"files must be exactly {', '.join(BUNDLE_FILES)} ({'; '.join(detail)})")
    for name in BUNDLE_FILES:
        entry = files[name]
        if not isinstance(entry, dict):
            raise LockError(f"{name}: entry must be an object with bytes and sha256")
        if not _is_int(entry.get("bytes")) or entry["bytes"] <= 0:
            raise LockError(f"{name}: bytes must be an integer > 0 (got {entry.get('bytes')!r})")
        sha = entry.get("sha256")
        if not (isinstance(sha, str) and _SHA256_RE.fullmatch(sha)):
            raise LockError(f"{name}: sha256 must be 64 lowercase hex characters (got {sha!r})")
    return lock


def load_lock(path: Path) -> dict:
    """Read and validate the lock file (strict UTF-8 JSON)."""
    try:
        text = Path(path).read_bytes().decode("utf-8")
    except OSError as exc:
        raise LockError(f"cannot read lock {path}: {exc.strerror or exc}") from exc
    except UnicodeDecodeError as exc:
        raise LockError(f"lock {path} is not UTF-8") from exc
    try:
        lock = json.loads(text)
    except ValueError as exc:
        raise LockError(f"lock {path} is not valid JSON: {exc}") from exc
    return validate_lock(lock)


# --- files on disk -------------------------------------------------------------------------------------------------


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with open(path, "rb") as fh:
        while chunk := fh.read(CHUNK):
            digest.update(chunk)
    return digest.hexdigest()


def file_problem(path: Path, entry: dict) -> str | None:
    """None if `path` is a regular file with the lock's size and sha256, else what is wrong with it."""
    try:
        if not path.is_file():
            return "missing"
        size = path.stat().st_size
        if size != entry["bytes"]:
            return f"{size} bytes on disk, the lock says {entry['bytes']}"
        actual = sha256_file(path)
    except OSError as exc:
        return f"unreadable ({exc.strerror or exc})"
    if actual != entry["sha256"]:
        return f"sha256 {actual[:12]}... on disk, the lock says {entry['sha256'][:12]}..."
    return None


def verify_dir(dest: Path, files: dict) -> list[str]:
    """One 'name: problem' line per file of the bundle that does not match the lock."""
    problems = []
    for name in BUNDLE_FILES:
        problem = file_problem(dest / name, files[name])
        if problem:
            problems.append(f"{name}: {problem}")
    return problems


def _mkdirs(path: Path) -> list[Path]:
    """mkdir -p; returns the directories this call created, outermost first (to undo them on failure)."""
    created = []
    probe = path
    while not probe.exists():
        created.append(probe)
        probe = probe.parent
    path.mkdir(parents=True, exist_ok=True)
    return created[::-1]


# --- downloading ---------------------------------------------------------------------------------------------------


def _copy_verified(resp, part: Path, size: int, sha256: str) -> None:
    """Stream `resp` into `part`, hashing as it goes. Stops the moment more than `size` bytes arrive. On any problem
    the .part file is deleted and a FetchError says what happened."""
    digest = hashlib.sha256()
    received = 0
    ok = False
    try:
        with open(part, "wb") as out:
            while chunk := resp.read(CHUNK):
                received += len(chunk)
                if received > size:
                    raise FetchError(f"body exceeds the {size} bytes in the lock")
                digest.update(chunk)
                out.write(chunk)
        if received != size:
            raise FetchError(f"truncated: got {received} of {size} bytes", retryable=True)
        if digest.hexdigest() != sha256:
            raise FetchError(
                f"sha256 mismatch: got {digest.hexdigest()[:12]}..., the lock says {sha256[:12]}..."
            )
        ok = True
    finally:
        if not ok:
            part.unlink(missing_ok=True)


def _download(url: str, part: Path, entry: dict, timeout: float) -> None:
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT, "Accept-Encoding": "identity"})
    try:
        with urllib.request.urlopen(request, timeout=timeout) as resp:  # follows the Hub's 302 to its CDN
            _copy_verified(resp, part, entry["bytes"], entry["sha256"])
    except urllib.error.HTTPError as exc:
        exc.close()
        transient = exc.code == 429 or exc.code >= 500  # any other 4xx will not change on a retry
        raise FetchError(f"HTTP {exc.code} {exc.reason}", retryable=transient) from exc
    except (OSError, http.client.HTTPException) as exc:
        # URLError, timeouts, resets, a dropped connection: all treated as transient
        raise FetchError(f"network error: {exc}", retryable=True) from exc


def _download_with_retries(url: str, part: Path, entry: dict, timeout: float, backoff: float) -> None:
    for attempt in range(1, ATTEMPTS + 1):
        try:
            _download(url, part, entry, timeout)
            return
        except FetchError as exc:
            if not exc.retryable:
                raise
            if attempt == ATTEMPTS:
                raise FetchError(f"{exc} (gave up after {ATTEMPTS} attempts)") from exc
            time.sleep(backoff * 2 ** (attempt - 1))


def _summary(lock: dict) -> str:
    total = sum(entry["bytes"] for entry in lock["files"].values())
    return f"{len(BUNDLE_FILES)} files, {total / 1e6:.1f} MB total, revision {lock['revision'][:12]}"


def install(lock: dict, dest: Path, base_url: str, timeout: float, backoff: float) -> int:
    files = lock["files"]
    parts: dict[str, Path] = {}  # name -> its .part file, for every file this run downloads
    placed: list[Path] = []  # files this run moved into place
    created: list[Path] = []  # directories this run created
    ok = False
    try:
        todo = [name for name in BUNDLE_FILES if file_problem(dest / name, files[name])]
        if todo:
            created = _mkdirs(dest)
            for name in BUNDLE_FILES:  # leftovers of a killed earlier run
                (dest / f".{name}.part").unlink(missing_ok=True)
            # smallest first: a bad small file fails the run before the 67 MB model is downloaded
            for name in sorted(todo, key=lambda n: files[n]["bytes"]):
                parts[name] = dest / f".{name}.part"
                url = f"{base_url.rstrip('/')}/{lock['repo']}/resolve/{lock['revision']}/{name}"
                try:
                    _download_with_retries(url, parts[name], files[name], timeout, backoff)
                except FetchError as exc:
                    raise FetchError(f"{name}: {exc} [{url}]") from exc
            # every file passed its size + sha256 check: only now does anything become visible in dest
            for name, part in parts.items():
                os.replace(part, dest / name)
                placed.append(dest / name)
        problems = verify_dir(dest, files)  # re-hash everything from disk
        for line in problems:
            print(f"error: {line}", file=sys.stderr)
        ok = not problems
    except (FetchError, OSError) as exc:
        print(f"error: {exc}", file=sys.stderr)
    finally:
        if not ok:
            for path in (*parts.values(), *placed):
                path.unlink(missing_ok=True)
            for directory in reversed(created):
                try:
                    directory.rmdir()
                except OSError:
                    break
    if ok:
        print(f"intent bundle {lock['version']} ready: {_summary(lock)}")
    return 0 if ok else 1


def verify_only(lock: dict, dest: Path) -> int:
    problems = verify_dir(dest, lock["files"])
    for line in problems:
        print(f"error: {line}", file=sys.stderr)
    if not problems:
        print(f"intent bundle {lock['version']} verified: {_summary(lock)}")
    return 1 if problems else 0


def _parse_args(argv: list[str] | None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        prog="fetch_intent_bundle", description="Fetch the pinned, checksummed ONNX intent bundle."
    )
    parser.add_argument("--lock", type=Path, default=DEFAULT_LOCK, help="lock file (default: %(default)s)")
    parser.add_argument(
        "--dest", type=Path, default=DEFAULT_DEST, help="bundle directory (default: %(default)s)"
    )
    parser.add_argument("--base-url", default=DEFAULT_BASE_URL, help="Hub base URL (default: %(default)s)")
    parser.add_argument(
        "--verify-only", action="store_true", help="check dest against the lock, download nothing"
    )
    parser.add_argument(
        "--backoff", type=float, default=2.0, metavar="SECONDS", help="first retry wait, doubles"
    )
    parser.add_argument("--timeout", type=float, default=30.0, metavar="SECONDS", help="per socket operation")
    args = parser.parse_args(argv)
    if not args.base_url.startswith(("http://", "https://")):
        parser.error("--base-url must start with http:// or https://")
    if args.timeout <= 0 or args.backoff < 0:
        parser.error("--timeout must be > 0 and --backoff >= 0")
    return args


def main(argv: list[str] | None = None) -> int:
    args = _parse_args(argv)
    try:
        lock = load_lock(args.lock)
    except LockError as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 2
    if args.verify_only:
        return verify_only(lock, args.dest)
    return install(lock, args.dest, args.base_url, args.timeout, args.backoff)


if __name__ == "__main__":
    sys.exit(main())
