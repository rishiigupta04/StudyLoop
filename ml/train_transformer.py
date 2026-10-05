"""Fine-tune a transformer intent classifier on the normalized text (GPU for training only; serving is ONNX on CPU).

    ml/.venv/Scripts/python ml/train_transformer.py --model distilbert-base-uncased --seed 1
    ml/.venv/Scripts/python ml/train_transformer.py --model distilbert-base-multilingual-cased --seed 1
    ml/.venv/Scripts/python ml/train_transformer.py --model google/muril-base-cased --seed 1

A plain PyTorch loop (AdamW, linear warmup/decay, fp16 autocast), the best epoch picked by validation macro-F1.
Saves the checkpoint to saved_models/<tag>/ and validation/test logits to runs/<tag>/{val,test}.jsonl.
"""

from __future__ import annotations

import argparse
import json
import random
import time

import numpy as np
import torch
from torch.utils.data import DataLoader

from common import INTENTS, LABEL2ID, NLP_VERSION, RUNS, SAVED
from dataset import load_split
from metrics import classification_report, softmax
from train_classic import save_run

MAX_LEN = 40  # normalized commands are short; the longest dictated notes fit in ~35 word pieces


def set_seed(seed: int) -> None:
    random.seed(seed)
    np.random.seed(seed)
    torch.manual_seed(seed)
    torch.cuda.manual_seed_all(seed)


def encode(tokenizer, rows: list[dict]) -> dict:
    enc = tokenizer([r["norm"] for r in rows], truncation=True, max_length=MAX_LEN)
    return {"input_ids": enc["input_ids"], "attention_mask": enc["attention_mask"]}


def batches(tokenizer, enc: dict, labels: list[int] | None, batch_size: int, shuffle: bool, seed: int):
    idx = list(range(len(enc["input_ids"])))

    def collate(ids: list[int]):
        feats = [{"input_ids": enc["input_ids"][i], "attention_mask": enc["attention_mask"][i]} for i in ids]
        out = tokenizer.pad(feats, return_tensors="pt")
        if labels is not None:
            out["labels"] = torch.tensor([labels[i] for i in ids])
        return out

    g = torch.Generator()
    g.manual_seed(seed)
    return DataLoader(idx, batch_size=batch_size, shuffle=shuffle, collate_fn=collate, generator=g)


@torch.no_grad()
def predict_logits(model, tokenizer, rows: list[dict], device: str) -> np.ndarray:
    model.eval()
    out = []
    for b in batches(tokenizer, encode(tokenizer, rows), None, 128, False, 0):
        b = {k: v.to(device) for k, v in b.items()}
        with torch.autocast(device_type="cuda", dtype=torch.float16, enabled=device == "cuda"):
            out.append(model(**b).logits.float().cpu().numpy())
    return np.concatenate(out)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--model", default="distilbert-base-uncased")
    ap.add_argument("--seed", type=int, default=1)
    ap.add_argument("--epochs", type=int, default=8)
    ap.add_argument("--lr", type=float, default=5e-5)
    ap.add_argument("--batch", type=int, default=32)
    ap.add_argument("--warmup", type=float, default=0.1)
    ap.add_argument("--weight-decay", type=float, default=0.01)
    ap.add_argument("--tag", default="")
    ap.add_argument("--layers", type=int, default=0, help="DistilBERT only: keep the first N of its 6 blocks")
    args = ap.parse_args()

    from transformers import (
        AutoModelForSequenceClassification,
        AutoTokenizer,
        get_linear_schedule_with_warmup,
    )

    set_seed(args.seed)
    tag = args.tag or f"{args.model.split('/')[-1]}-s{args.seed}"
    device = "cuda" if torch.cuda.is_available() else "cpu"
    splits = {s: load_split(s) for s in ("train", "val", "test")}
    tokenizer = AutoTokenizer.from_pretrained(args.model)
    model = AutoModelForSequenceClassification.from_pretrained(
        args.model,
        num_labels=len(INTENTS),
        id2label=dict(enumerate(INTENTS)),
        label2id=LABEL2ID,
    )
    if args.layers:  # keep the first N transformer blocks: ~N/6 of the CPU cost (Render's 0.1 CPU)
        blocks = model.distilbert.transformer.layer
        model.distilbert.transformer.layer = torch.nn.ModuleList(list(blocks)[: args.layers])
        model.config.n_layers = args.layers
    model = model.to(device)

    train = splits["train"]
    enc = encode(tokenizer, train)
    y = [LABEL2ID[r["intent"]] for r in train]
    loader = batches(tokenizer, enc, y, args.batch, True, args.seed)
    steps = len(loader) * args.epochs
    no_decay = ("bias", "LayerNorm.weight", "layer_norm.weight")
    groups = [
        {
            "params": [p for n, p in model.named_parameters() if not any(k in n for k in no_decay)],
            "weight_decay": args.weight_decay,
        },
        {
            "params": [p for n, p in model.named_parameters() if any(k in n for k in no_decay)],
            "weight_decay": 0.0,
        },
    ]
    opt = torch.optim.AdamW(groups, lr=args.lr)
    sched = get_linear_schedule_with_warmup(opt, int(steps * args.warmup), steps)
    scaler = torch.amp.GradScaler(enabled=device == "cuda")

    best = (-1.0, -1, None)
    history = []
    t0 = time.time()
    for epoch in range(1, args.epochs + 1):
        model.train()
        total = 0.0
        for b in loader:
            b = {k: v.to(device) for k, v in b.items()}
            with torch.autocast(device_type="cuda", dtype=torch.float16, enabled=device == "cuda"):
                loss = model(**b).loss
            opt.zero_grad(set_to_none=True)
            scaler.scale(loss).backward()
            scaler.unscale_(opt)
            torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
            scaler.step(opt)
            scaler.update()
            sched.step()
            total += loss.item()
        val_logits = predict_logits(model, tokenizer, splits["val"], device)
        rep = classification_report(
            [r["intent"] for r in splits["val"]], [INTENTS[k] for k in val_logits.argmax(1)]
        )
        history.append(
            {
                "epoch": epoch,
                "loss": total / len(loader),
                "val_acc": rep["accuracy"],
                "val_f1": rep["macro_f1"],
            }
        )
        print(
            f"[{tag}] epoch {epoch} loss={total / len(loader):.4f} val acc={rep['accuracy']:.4f} f1={rep['macro_f1']:.4f}"
        )
        if rep["macro_f1"] > best[0]:
            best = (
                rep["macro_f1"],
                epoch,
                {k: v.detach().cpu().clone() for k, v in model.state_dict().items()},
            )

    model.load_state_dict(best[2])
    out_dir = SAVED / tag
    model.save_pretrained(out_dir)
    tokenizer.save_pretrained(out_dir)
    meta = {
        "base_model": args.model,
        "seed": args.seed,
        "best_epoch": best[1],
        "val_macro_f1": best[0],
        "history": history,
        "args": vars(args),
        "max_len": MAX_LEN,
        "labels": INTENTS,
        "nlp_version": NLP_VERSION,
        "train_rows": len(train),
        "train_seconds": round(time.time() - t0, 1),
        "params": sum(p.numel() for p in model.parameters()),
    }
    (out_dir / "train_meta.json").write_text(json.dumps(meta, indent=2), encoding="utf-8")
    for split in ("val", "test"):
        logits = predict_logits(model, tokenizer, splits[split], device)
        probs = softmax(logits)
        save_run(tag, split, splits[split], [INTENTS[k] for k in probs.argmax(1)], probs.max(1), probs)
        np.save(RUNS / tag / f"{split}_logits.npy", logits)
    print(f"[{tag}] best epoch {best[1]} (val macro-F1 {best[0]:.4f}); saved to {out_dir}")


if __name__ == "__main__":
    main()
