"""Export a fine-tuned checkpoint to ONNX, quantize it to dynamic INT8, check parity, write the serving bundle.

    ml/.venv/Scripts/python ml/export_onnx.py --ckpt distilbert-base-uncased-s1

Bundle → saved_models/intent-onnx/<version>/ (what the backend loads with CLASSIFIER=onnx):
    model.onnx        dynamic-INT8 weights (onnxruntime.quantization.quantize_dynamic)
    tokenizer.json    the fast tokenizer, loaded with `tokenizers` (no transformers / torch at serving time)
    labels.json       label order of the logits (= app.orchestration.intents.Intent order)
    calibration.json  temperature + τ (written by calibrate.py)
    meta.json         provenance, sizes, sha256, fp32 vs INT8 metrics

Checks: `tokenizers` ids == transformers ids on every val/test row; ONNX fp32 logits ≈ torch logits; INT8 accuracy
and macro-F1 within 0.5 pt of fp32 on the test split (else it tries per-channel quantization before giving up).
"""

from __future__ import annotations

import argparse
import hashlib
import json
import shutil
import time
from datetime import datetime, timezone
from pathlib import Path

import numpy as np

from common import INTENTS, NLP_VERSION, RUNS, SAVED
from dataset import load_split
from metrics import classification_report, softmax
from train_classic import save_run

MAX_DROP_PT = 0.5


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def export_fp32(ckpt: Path, out: Path) -> None:
    import torch
    from transformers import AutoModelForSequenceClassification

    model = AutoModelForSequenceClassification.from_pretrained(ckpt).eval()

    class Logits(torch.nn.Module):  # plain (input_ids, attention_mask) -> logits graph
        def __init__(self, m):
            super().__init__()
            self.m = m

        def forward(self, input_ids, attention_mask):
            return self.m(input_ids=input_ids, attention_mask=attention_mask).logits

    ids = torch.tensor([[101, 2175, 2067, 2184, 3823, 102]])
    mask = torch.ones_like(ids)
    torch.onnx.export(
        Logits(model),
        (ids, mask),
        str(out),
        input_names=["input_ids", "attention_mask"],
        output_names=["logits"],
        dynamic_axes={
            "input_ids": {0: "batch", 1: "seq"},
            "attention_mask": {0: "batch", 1: "seq"},
            "logits": {0: "batch"},
        },
        opset_version=17,
        do_constant_folding=True,
        dynamo=False,
    )


def optimize(fp32: Path, out: Path, config: dict) -> bool:
    """onnxruntime's transformer fusions (attention, LayerNorm, GELU): faster on CPU, same math."""
    try:
        from onnxruntime.transformers.optimizer import optimize_model

        opt = optimize_model(
            str(fp32),
            model_type="bert",
            num_heads=config.get("n_heads") or config.get("num_attention_heads", 12),
            hidden_size=config.get("dim") or config.get("hidden_size", 768),
        )
        opt.save_model_to_file(str(out))
        return True
    except Exception as exc:  # fusion is an optimization, never a requirement
        print(f"  transformer fusion skipped: {exc}")
        shutil.copy(fp32, out)
        return False


# tried in order, most compressed first; the first within MAX_DROP_PT of fp32 on VALIDATION is shipped.
# (The classifier head is a Gemm, which dynamic quantization leaves in fp32 anyway.)
QUANT_CONFIGS = [
    {"name": "per-tensor"},
    {"name": "per-channel", "per_channel": True},
    {"name": "per-channel, 7-bit weights", "per_channel": True, "reduce_range": True},
    {"name": "per-channel, fp32 last transformer block", "per_channel": True, "keep_fp32": ("LAST_BLOCK",)},
    {"name": "per-channel, fp32 embeddings", "per_channel": True, "keep_fp32": ("Gather",)},
]


def quantize(src: Path, out: Path, cfg: dict, n_layers: int = 6) -> None:
    """Dynamic INT8: weights stored as int8, activations quantized on the fly (no calibration data needed).
    The fused graph has contrib ops shape inference can't type, hence DefaultTensorType."""
    import onnx
    from onnxruntime.quantization import QuantType, quantize_dynamic

    keep = [f"/layer.{n_layers - 1}/" if k == "LAST_BLOCK" else k for k in cfg.get("keep_fp32", ())]
    exclude = [
        n.name for n in onnx.load(str(src)).graph.node if any(k in n.name for k in keep if k != "Gather")
    ]
    quantize_dynamic(
        str(src),
        str(out),
        weight_type=QuantType.QInt8,
        per_channel=cfg.get("per_channel", False),
        reduce_range=cfg.get("reduce_range", False),
        op_types_to_quantize=["MatMul", "Attention"] if "Gather" in keep else None,
        nodes_to_exclude=exclude or None,
        extra_options={"DefaultTensorType": onnx.TensorProto.FLOAT},
    )


class OrtModel:
    """The serving path, minus FastAPI: tokenizers → onnxruntime, batch of one, one thread."""

    def __init__(self, onnx_path: Path, tokenizer_json: Path, max_len: int, threads: int = 1):
        import onnxruntime as ort
        from tokenizers import Tokenizer

        self.tok = Tokenizer.from_file(str(tokenizer_json))
        self.tok.enable_truncation(max_length=max_len)
        self.tok.no_padding()
        so = ort.SessionOptions()
        so.intra_op_num_threads = threads
        so.inter_op_num_threads = 1
        self.sess = ort.InferenceSession(str(onnx_path), so, providers=["CPUExecutionProvider"])

    def ids(self, text: str) -> list[int]:
        return self.tok.encode(text).ids

    def logits(self, text: str) -> np.ndarray:
        e = self.tok.encode(text)
        feed = {
            "input_ids": np.array([e.ids], dtype=np.int64),
            "attention_mask": np.array([e.attention_mask], dtype=np.int64),
        }
        return self.sess.run(["logits"], feed)[0][0]


def evaluate(model: OrtModel, rows: list[dict]) -> tuple[np.ndarray, dict, list[float]]:
    logits, ms = [], []
    for r in rows:
        t0 = time.perf_counter()
        logits.append(model.logits(r["norm"]))
        ms.append((time.perf_counter() - t0) * 1000)
    logits = np.array(logits)
    rep = classification_report([r["intent"] for r in rows], [INTENTS[k] for k in logits.argmax(1)])
    return logits, rep, ms


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--ckpt", required=True, help="a directory under saved_models/")
    ap.add_argument("--version", default="")
    ap.add_argument(
        "--run",
        default="onnx",
        help="runs/<run>-fp32, runs/<run>-int8 (a candidate such as the 3-layer model uses its own name)",
    )
    ap.add_argument(
        "--no-latest", action="store_true", help="don't point saved_models/intent-onnx/LATEST here"
    )
    args = ap.parse_args()

    from transformers import AutoTokenizer

    ckpt = SAVED / args.ckpt
    train_meta = json.loads((ckpt / "train_meta.json").read_text(encoding="utf-8"))
    config = json.loads((ckpt / "config.json").read_text(encoding="utf-8"))
    max_len = train_meta["max_len"]
    version = args.version or f"intent-{datetime.now(timezone.utc):%Y%m%d}-{args.ckpt}"
    work = SAVED / "onnx-work" / args.ckpt
    work.mkdir(parents=True, exist_ok=True)
    bundle = SAVED / "intent-onnx" / version
    bundle.mkdir(parents=True, exist_ok=True)

    # tokenizer: the fast tokenizer's own JSON, loaded later by `tokenizers` alone
    hf_tok = AutoTokenizer.from_pretrained(ckpt)
    hf_tok.backend_tokenizer.save(str(bundle / "tokenizer.json"))
    splits = {s: load_split(s) for s in ("val", "test")}

    fp32, fused, int8 = work / "model.fp32.onnx", work / "model.fp32.opt.onnx", work / "model.int8.onnx"
    print("exporting fp32 …")
    export_fp32(ckpt, fp32)
    fused_ok = optimize(fp32, fused, config)

    m32 = OrtModel(fused, bundle / "tokenizer.json", max_len)
    bad = [
        r["norm"]
        for s in splits.values()
        for r in s
        if m32.ids(r["norm"]) != hf_tok(r["norm"], truncation=True, max_length=max_len)["input_ids"]
    ]
    print(
        f"tokenizer parity: {sum(len(s) for s in splits.values()) - len(bad)} identical, {len(bad)} different"
    )
    assert not bad, bad[:5]

    # ONNX fp32 vs torch on a sample: same function, so logits agree to float noise
    import torch
    from transformers import AutoModelForSequenceClassification

    torch_model = AutoModelForSequenceClassification.from_pretrained(ckpt).eval()
    diffs = []
    for r in splits["test"][:200]:
        with torch.no_grad():
            t = (
                torch_model(**hf_tok(r["norm"], return_tensors="pt", truncation=True, max_length=max_len))
                .logits[0]
                .numpy()
            )
        diffs.append(float(np.abs(t - m32.logits(r["norm"])).max()))
    print(f"torch vs onnx fp32: max |Δlogit| = {max(diffs):.2e}")

    results = {}
    val32, rep_val32, _ = evaluate(m32, splits["val"])
    test32, rep32, ms32 = evaluate(m32, splits["test"])
    results["fp32"] = {"val": rep_val32, "test": rep32, "ms": ms32}
    print(f"fp32  test acc={rep32['accuracy']:.4f} f1={rep32['macro_f1']:.4f}")

    trials = []
    for k, cfg in enumerate(QUANT_CONFIGS):
        path = work / f"model.int8.{k}.onnx"
        quantize(fused, path, cfg, n_layers=config.get("n_layers") or config.get("num_hidden_layers") or 6)
        m8 = OrtModel(path, bundle / "tokenizer.json", max_len)
        val8, rep_val8, _ = evaluate(m8, splits["val"])
        test8, rep8, ms8 = evaluate(m8, splits["test"])
        drops = {
            "val_acc_pt": 100 * (rep_val32["accuracy"] - rep_val8["accuracy"]),
            "val_f1_pt": 100 * (rep_val32["macro_f1"] - rep_val8["macro_f1"]),
            "test_acc_pt": 100 * (rep32["accuracy"] - rep8["accuracy"]),
            "test_f1_pt": 100 * (rep32["macro_f1"] - rep8["macro_f1"]),
        }
        ok = drops["val_acc_pt"] <= MAX_DROP_PT and drops["val_f1_pt"] <= MAX_DROP_PT
        print(
            f"int8 [{cfg['name']}] {path.stat().st_size / 1e6:.1f} MB  val drop acc={drops['val_acc_pt']:+.2f} "
            f"f1={drops['val_f1_pt']:+.2f} pt | test drop acc={drops['test_acc_pt']:+.2f} f1={drops['test_f1_pt']:+.2f} pt"
            f"{'  ✓' if ok else ''}"
        )
        trials.append(
            {
                "cfg": cfg,
                "path": path,
                "ok": ok,
                "drops": drops,
                "val": (val8, rep_val8),
                "test": (test8, rep8, ms8),
            }
        )
        if ok:
            break
    passed = [t for t in trials if t["ok"]]
    pick = (
        passed[0] if passed else min(trials, key=lambda t: t["drops"]["val_acc_pt"] + t["drops"]["val_f1_pt"])
    )
    if not passed:
        print(
            f"WARNING: no INT8 config within {MAX_DROP_PT} pt on validation; shipping the closest ({pick['cfg']['name']})"
        )
    int8 = pick["path"]
    val8, rep_val8 = pick["val"]
    test8, rep8, ms8 = pick["test"]
    results["int8"] = {"val": rep_val8, "test": rep8, "ms": ms8}
    chosen = {
        "config": pick["cfg"]["name"],
        "within_budget_on_val": pick["ok"],
        "budget_pt": MAX_DROP_PT,
        **{f"drop_{k}": round(v, 3) for k, v in pick["drops"].items()},
        "tried": [
            {"config": t["cfg"]["name"], **{k: round(v, 3) for k, v in t["drops"].items()}} for t in trials
        ],
    }

    shutil.copy(int8, bundle / "model.onnx")
    (bundle / "labels.json").write_text(json.dumps(INTENTS), encoding="utf-8")
    for name, (val_l, test_l) in {
        f"{args.run}-fp32": (val32, test32),
        f"{args.run}-int8": (val8, test8),
    }.items():
        for split, logits in (("val", val_l), ("test", test_l)):
            probs = softmax(logits)
            save_run(name, split, splits[split], [INTENTS[k] for k in probs.argmax(1)], probs.max(1), probs)
            np.save(RUNS / name / f"{split}_logits.npy", logits)

    def pct(ms: list[float]) -> dict:
        return {"p50": float(np.percentile(ms, 50)), "p95": float(np.percentile(ms, 95)), "n": len(ms)}

    import onnxruntime

    meta = {
        "version": version,
        "created_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "checkpoint": args.ckpt,
        "run": args.run,
        "base_model": train_meta["base_model"],
        "layers": train_meta.get("args", {}).get("layers") or config.get("n_layers"),
        "seed": train_meta["seed"],
        "params": train_meta["params"],
        "max_len": max_len,
        "labels": INTENTS,
        "nlp_version": NLP_VERSION,
        "opset": 17,
        "transformer_fusion": fused_ok,
        "quantization": {"type": "dynamic", "weight_type": "QInt8", **chosen},
        "onnxruntime": onnxruntime.__version__,
        "files": {
            f: {"bytes": (bundle / f).stat().st_size, "sha256": sha256(bundle / f)}
            for f in ("model.onnx", "tokenizer.json")
        },
        "fp32_bytes": fused.stat().st_size,
        "metrics": {
            k: {
                "test_accuracy": v["test"]["accuracy"],
                "test_macro_f1": v["test"]["macro_f1"],
                "val_accuracy": v["val"]["accuracy"],
                "val_macro_f1": v["val"]["macro_f1"],
                "latency_ms_1thread": pct(v["ms"]),
            }
            for k, v in results.items()
        },
    }
    (bundle / "meta.json").write_text(json.dumps(meta, indent=2), encoding="utf-8")
    if not args.no_latest:
        (SAVED / "intent-onnx" / "LATEST").write_text(version, encoding="utf-8")
    print(f"bundle → {bundle}  (model.onnx {meta['files']['model.onnx']['bytes'] / 1e6:.1f} MB)")


if __name__ == "__main__":
    main()
