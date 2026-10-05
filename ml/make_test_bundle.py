"""Build the tiny ONNX intent bundle the backend tests load (backend/tests/fixtures/tiny_intent_bundle/).

    ml/.venv/Scripts/python ml/make_test_bundle.py

A few KB instead of the ~65 MB model, but the same file layout, the same input/output names, a real
`tokenizers` tokenizer.json and a real ONNX graph — so CI runs the actual serving path (onnxruntime + tokenizers,
calibration, per-intent τ, /health, graph routing) without the trained artifact. The "model" is a bag of words:
logits = mean over tokens of an embedding row that votes for one intent.
"""

from __future__ import annotations

import json

import numpy as np
import onnx
from onnx import TensorProto, helper, numpy_helper
from tokenizers import Tokenizer
from tokenizers.models import WordLevel
from tokenizers.pre_tokenizers import Whitespace
from tokenizers.processors import TemplateProcessing

from common import BACKEND, INTENTS, NLP_VERSION

OUT = BACKEND / "tests" / "fixtures" / "tiny_intent_bundle"
SPECIAL = ["[PAD]", "[UNK]", "[CLS]", "[SEP]"]
WORDS = {
    "pause": "PAUSE",
    "ruko": "PAUSE",
    "play": "PLAY",
    "chalao": "PLAY",
    "peeche": "SEEK_BACK",
    "rewind": "SEEK_BACK",
    "aage": "SEEK_FORWARD",
    "skip": "SEEK_FORWARD",
    "speed": "SPEED",
    "awaaz": "VOLUME",
    "volume": "VOLUME",
    "note": "TAKE_NOTE",
    "summary": "SUMMARIZE",
    "explain": "ASK",
    "hello": "OOS",
}
VOTE = 12.0


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    vocab = {w: k for k, w in enumerate(SPECIAL + list(WORDS))}
    emb = np.zeros((len(vocab), len(INTENTS)), dtype=np.float32)
    for w, intent in WORDS.items():
        emb[vocab[w], INTENTS.index(intent)] = VOTE
    emb[vocab["[UNK]"], INTENTS.index("OOS")] = 1.0

    nodes = [
        helper.make_node("Gather", ["emb", "input_ids"], ["e"], axis=0),
        helper.make_node("Cast", ["attention_mask"], ["m"], to=TensorProto.FLOAT),
        helper.make_node("Unsqueeze", ["m", "ax2"], ["m3"]),
        helper.make_node("Mul", ["e", "m3"], ["em"]),
        helper.make_node("ReduceSum", ["em", "ax1"], ["s"], keepdims=0),
        helper.make_node("ReduceSum", ["m", "ax1"], ["n"], keepdims=1),
        helper.make_node("Div", ["s", "n"], ["logits"]),
    ]
    graph = helper.make_graph(
        nodes,
        "tiny_intent",
        [
            helper.make_tensor_value_info("input_ids", TensorProto.INT64, ["batch", "seq"]),
            helper.make_tensor_value_info("attention_mask", TensorProto.INT64, ["batch", "seq"]),
        ],
        [helper.make_tensor_value_info("logits", TensorProto.FLOAT, ["batch", len(INTENTS)])],
        [
            numpy_helper.from_array(emb, "emb"),
            numpy_helper.from_array(np.array([1], dtype=np.int64), "ax1"),
            numpy_helper.from_array(np.array([2], dtype=np.int64), "ax2"),
        ],
    )
    model = helper.make_model(
        graph, opset_imports=[helper.make_opsetid("", 17)], producer_name="studyloop-ml-test"
    )
    model.ir_version = 8
    onnx.checker.check_model(model)
    onnx.save(model, str(OUT / "model.onnx"))

    tok = Tokenizer(WordLevel(vocab, unk_token="[UNK]"))
    tok.pre_tokenizer = Whitespace()
    tok.post_processor = TemplateProcessing(
        single="[CLS] $A [SEP]", special_tokens=[("[CLS]", vocab["[CLS]"]), ("[SEP]", vocab["[SEP]"])]
    )
    tok.save(str(OUT / "tokenizer.json"))

    (OUT / "labels.json").write_text(json.dumps(INTENTS), encoding="utf-8")
    calib = {"temperature": 1.0, "tau": 0.5, "tau_per_intent": {"SEEK_BACK": 0.95}}
    (OUT / "calibration.json").write_text(json.dumps(calib, indent=2), encoding="utf-8")
    meta = {
        "version": "tiny-test",
        "base_model": "bag-of-words fixture",
        "max_len": 16,
        "nlp_version": NLP_VERSION,
    }
    (OUT / "meta.json").write_text(json.dumps(meta, indent=2), encoding="utf-8")
    print(f"wrote {OUT} ({(OUT / 'model.onnx').stat().st_size} bytes)")


if __name__ == "__main__":
    main()
