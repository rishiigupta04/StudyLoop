"""Fine-tuned intent classifier (Tier 1c, CO4) served on CPU with onnxruntime, behind CLASSIFIER=onnx.

Same contract as regex_classifier: classify(normalized_text) -> (Intent, confidence), where the input already went
through `studyloop_nlp.normalize()` (the graph's normalize_input node), exactly like the training data (ml/).

The bundle is built by ml/export_onnx.py + ml/calibrate.py:
    model.onnx        DistilBERT, dynamic INT8
    tokenizer.json    fast tokenizer (the `tokenizers` package reads it: no transformers, no torch)
    labels.json       logit order
    calibration.json  temperature T (fitted on validation) and τ (the routing threshold, global or per intent)
    meta.json         provenance: base model, normalize() version, metrics, sha256
Confidence is softmax(logits / T) of the top intent, so the τ chosen on the calibrated sweep applies as is.

Loaded once at startup (`load`). If loading fails the graph keeps using the regex classifier and /health says why;
CLASSIFIER=regex is the rollback.
"""

from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Any

from app.orchestration.intents import Intent

log = logging.getLogger("studyloop.classifier")

DEFAULT_DIR = Path(__file__).resolve().parents[2] / "models" / "intent"


class OnnxIntentClassifier:
    def __init__(self, model_dir: str | Path, threads: int = 1) -> None:
        import numpy as np  # imported here so CLASSIFIER=regex never pays for numpy / onnxruntime
        import onnxruntime as ort
        from tokenizers import Tokenizer

        self._np = np
        d = Path(model_dir)
        self.meta: dict = json.loads((d / "meta.json").read_text(encoding="utf-8"))
        self.labels = [Intent(x) for x in json.loads((d / "labels.json").read_text(encoding="utf-8"))]
        calib: dict = json.loads((d / "calibration.json").read_text(encoding="utf-8"))
        self.temperature = float(calib["temperature"])
        self.tau = float(calib["tau"])
        self.tau_per_intent = {
            k: float(v) for k, v in (calib.get("tau_per_intent") or {}).items() if k != "*"
        }
        self.version = str(self.meta.get("version", d.name))

        self.tokenizer = Tokenizer.from_file(str(d / "tokenizer.json"))
        self.tokenizer.enable_truncation(max_length=int(self.meta.get("max_len", 40)))
        self.tokenizer.no_padding()
        so = ort.SessionOptions()
        so.intra_op_num_threads = (
            threads  # the fast path is one short utterance: more threads only add overhead
        )
        so.inter_op_num_threads = 1
        so.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL
        self.session = ort.InferenceSession(str(d / "model.onnx"), so, providers=["CPUExecutionProvider"])
        self._inputs = {i.name for i in self.session.get_inputs()}

    def logits(self, text: str) -> Any:
        np = self._np
        enc = self.tokenizer.encode(text)
        feed = {"input_ids": np.array([enc.ids], dtype=np.int64)}
        if "attention_mask" in self._inputs:
            feed["attention_mask"] = np.array([enc.attention_mask], dtype=np.int64)
        return self.session.run(None, feed)[0][0]

    def probabilities(self, text: str) -> Any:
        z = self.logits(text) / self.temperature
        e = self._np.exp(z - z.max())
        return e / e.sum()

    def classify(self, text: str) -> tuple[Intent, float]:
        t = (text or "").strip()
        if not t:
            return Intent.OOS, 0.0
        p = self.probabilities(t)
        k = int(p.argmax())
        return self.labels[k], float(p[k])

    def threshold(self, intent: Intent | str) -> float:
        """τ for this predicted intent: below it the turn goes to llm_router instead of acting."""
        name = intent.value if isinstance(intent, Intent) else str(intent)
        return self.tau_per_intent.get(name, self.tau)


_active: OnnxIntentClassifier | None = None
_status = "regex"


def load(model_dir: str | Path | None = None, threads: int = 1) -> str:
    """Load the bundle once (startup). Returns the /health description: "onnx" or "regex (onnx failed: …)"."""
    global _active, _status
    d = Path(model_dir) if model_dir else DEFAULT_DIR
    try:
        model = OnnxIntentClassifier(d, threads=threads)
        model.classify("pause")  # first run allocates; do it before the first real turn
    except Exception as exc:  # missing bundle, missing onnxruntime, corrupt file: keep serving with the regex
        _active = None
        _status = f"regex (onnx failed: {type(exc).__name__}: {exc})"[:300]
        log.error("ONNX classifier unavailable, using regex: %s", exc)
        return _status
    from studyloop_nlp import __version__ as nlp_version

    if model.meta.get("nlp_version") not in (None, nlp_version):
        log.warning(
            "classifier %s was trained on normalize() %s but this server runs %s: retrain before trusting it",
            model.version,
            model.meta.get("nlp_version"),
            nlp_version,
        )
    _active, _status = model, "onnx"
    log.info(
        "ONNX classifier %s loaded from %s (τ=%s, T=%.3f)", model.version, d, model.tau, model.temperature
    )
    return _status


def unload() -> None:
    global _active, _status
    _active, _status = None, "regex"


def active() -> OnnxIntentClassifier | None:
    return _active


def status() -> str:
    return _status
