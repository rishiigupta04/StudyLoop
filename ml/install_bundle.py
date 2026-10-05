"""Copy an exported bundle to backend/models/intent — where the backend looks when INTENT_MODEL_DIR is empty.

    ml/.venv/Scripts/python ml/install_bundle.py [version]     # default: saved_models/intent-onnx/LATEST

backend/models/ is gitignored; a deploy puts the same five files at the same path inside the image. The copy is
verified against the sha256 in meta.json, and a bundle without calibration.json is refused (it would serve with no
τ).
"""

from __future__ import annotations

import hashlib
import json
import shutil
import sys

from common import BACKEND, SAVED

FILES = ("model.onnx", "tokenizer.json", "labels.json", "calibration.json", "meta.json")


def main() -> None:
    version = (
        sys.argv[1]
        if len(sys.argv) > 1
        else (SAVED / "intent-onnx" / "LATEST").read_text(encoding="utf-8").strip()
    )
    src = SAVED / "intent-onnx" / version
    missing = [f for f in FILES if not (src / f).exists()]
    if missing:
        raise SystemExit(f"{src} is missing {missing} (run export_onnx.py, then calibrate.py)")
    dst = BACKEND / "models" / "intent"
    if dst.exists():
        shutil.rmtree(dst)
    dst.mkdir(parents=True)
    for f in FILES:
        shutil.copy2(src / f, dst / f)
    meta = json.loads((dst / "meta.json").read_text(encoding="utf-8"))
    for f, info in meta["files"].items():
        digest = hashlib.sha256((dst / f).read_bytes()).hexdigest()
        assert digest == info["sha256"], f"{f}: sha256 mismatch"
    print(
        f"installed {version} → {dst} ({meta['files']['model.onnx']['bytes'] / 1e6:.1f} MB, sha256 verified)"
    )


if __name__ == "__main__":
    main()
