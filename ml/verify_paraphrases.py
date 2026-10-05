"""Blind second-model check of every paraphrase → data/paraphrase_checks.jsonl (committed).

    ml/.venv/Scripts/python ml/verify_paraphrases.py              # label everything not yet checked
    ml/.venv/Scripts/python ml/verify_paraphrases.py --bases      # also judge the hand-written bases
    ml/.venv/Scripts/python ml/verify_paraphrases.py --only bases --max-wait 1800   # qwen, waiting out its TPD
    ml/.venv/Scripts/python ml/verify_paraphrases.py --judge gemini-3.6-flash --batch 200 --only paraphrases
    ml/.venv/Scripts/python ml/verify_paraphrases.py --pick --judge gemini-3.6-flash   # score a candidate judge

The judge sees only the text and the labeling guide, never the intent the generator was asked for. A paraphrase
whose judged label differs from its base's intent is not trained on unless a human review (data/label_review.jsonl)
keeps or relabels it (dataset.py). Candidate judges are scored by agreement with the hand-written labels (--pick,
the same 140-row sample for every candidate); each check row records its judge. Train paraphrases are judged
first: every val/test row is reviewed by hand anyway, so there the judge is only a second opinion.
"""

from __future__ import annotations

import argparse
import random
import time
from collections import Counter

from common import DATA, INTENTS, read_jsonl, write_jsonl
from intent_guide import DEFINITIONS, RULES, taxonomy_block
from metrics import ABBR

OUT = DATA / "paraphrase_checks.jsonl"
# 97.9 % agreement with bases.py (--pick); gpt-oss-120b 95.7 %, gpt-oss-20b 92.1 % (those are the live app's quota)
JUDGE = ("groq", "qwen/qwen3.8-27b", {"reasoning_effort": "none"})
BATCH = 80
SEED = 20260928

PROMPT = """You label utterances for StudyLoop, a voice-controlled lecture-video app. A student says something \
while watching a lecture (in English, Hindi or Hinglish; speech-to-text wrote it down). Pick the ONE intent the \
app should act on.

Intents:
{taxonomy}

Labeling rules:
{rules}

Label every utterance, in order. Return JSON: {answer} ({n} labels), using exactly these labels: {names}.

Utterances:
{items}"""
LIST_ANSWER = '{{"labels": ["<LABEL>", ...]}} with exactly one label per utterance'
# a model without an output-token cap answers by number: a skipped line then costs one label, not every one after it
NUMBERED_ANSWER = '{{"labels": {{"1": "<LABEL>", "2": "<LABEL>", ...}}}} with one label per utterance number'


def judge(chat, texts: list[str], codes: bool = True) -> dict[str, str]:
    """Blind labels for `texts`. Groq caps qwen at 1,000 OUTPUT tokens a minute, so there the output format sets the
    pace: an ordered list of 4-letter codes (PAUS, RPLY, SEM…) costs ~20 % fewer tokens than the full names and
    agrees with the hand-written labels exactly as often (137/140, --pick). A single space-separated string would be
    cheaper still, but it dropped a label in testing — and a miscount shifts every label after it. Gemini's limit is
    requests, not tokens, so it gets big batches and answers by utterance number."""
    items = "\n".join(f"{k + 1}. {t}" for k, t in enumerate(texts))
    if codes:
        taxonomy = "\n".join(f"- {ABBR[k]} ({k}): {v}" for k, v in DEFINITIONS.items())
        names, decode = [ABBR[i] for i in INTENTS], {ABBR[i]: i for i in INTENTS}
    else:
        taxonomy, names, decode = taxonomy_block(), INTENTS, {i: i for i in INTENTS}
    numbered = chat.provider == "gemini"
    prompt = PROMPT.format(
        taxonomy=taxonomy,
        rules=RULES,
        names=", ".join(names),
        n=len(texts),
        items=items,
        answer=(NUMBERED_ANSWER if numbered else LIST_ANSWER).format(),
    )
    labels = (
        chat.json(prompt, temperature=0.0, seed=SEED, max_tokens=100 + 10 * len(texts)).get("labels") or []
    )
    if numbered:
        if not isinstance(labels, dict):
            raise RuntimeError(f"judge answered {type(labels).__name__}, not a numbered mapping")
        missing = [k for k in range(1, len(texts) + 1) if str(k) not in labels]
        if len(missing) > len(texts) // 20:  # a few gaps are re-asked next run; many = a broken answer
            raise RuntimeError(f"judge skipped {len(missing)} of {len(texts)} utterances")
        return {
            t: decode.get(str(labels[str(k + 1)]).strip().upper(), "?")
            for k, t in enumerate(texts)
            if str(k + 1) in labels
        }
    if len(labels) != len(texts):  # a dropped or doubled line would shift every label after it: don't guess
        raise RuntimeError(f"judge returned {len(labels)} labels for {len(texts)} utterances")
    return {t: decode.get(str(lab).strip().upper(), "?") for t, lab in zip(texts, labels, strict=True)}


def pick(models: list[str], n_per_intent: int = 10, codes: bool = True, batch: int = BATCH) -> None:
    """Score each candidate judge against the hand-written labels (bases.py) on the same sample."""
    from llm import chat_for
    from sources import load_bases

    hw = [b for b in load_bases() if b["source"] == "hw"]
    rng = random.Random(SEED)
    sample = []
    for intent in INTENTS:
        rows = [b for b in hw if b["intent"] == intent]
        sample += rng.sample(rows, n_per_intent)
    rng.shuffle(sample)
    texts = [b["text"] for b in sample]
    gold = {b["text"]: b["intent"] for b in sample}
    for model in models:
        chat = chat_for(model)
        got: dict[str, str] = {}
        try:
            for i in range(0, len(texts), batch):
                got.update(judge(chat, texts[i : i + batch], codes=codes))
        except RuntimeError as exc:
            print(f"{model:24} unavailable: {exc}")
            continue
        agree = sum(got.get(t) == gold[t] for t in texts)
        confused = Counter((gold[t], got.get(t)) for t in texts if got.get(t) != gold[t])
        print(f"{model:24} agreement {agree}/{len(texts)} = {agree / len(texts):.1%}  tokens={chat.usage}")
        print("   most confused:", confused.most_common(8))


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--pick", action="store_true", help="score --judge model(s) on the hand-written bases")
    ap.add_argument("--bases", action="store_true", help="also judge the hand-written bases (first)")
    ap.add_argument("--only", choices=("bases", "paraphrases"), help="judge just this group")
    ap.add_argument("--judge", default=JUDGE[1], help="model (comma-separated candidates with --pick)")
    ap.add_argument("--batch", type=int, default=BATCH)
    ap.add_argument("--otpm", type=int, default=1000, help="output tokens/min this run may use (Groq cap)")
    ap.add_argument("--max-wait", type=float, default=90, help="seconds to wait out Groq's tokens/day refill")
    ap.add_argument("--hours", type=float, default=0, help="keep waiting out quota/overload this long")
    ap.add_argument("--overload-cooldown", type=float, default=1800)
    args = ap.parse_args()
    if args.pick:
        pick([m.strip() for m in args.judge.split(",")], batch=args.batch)
        return

    from dataset import _split_bases
    from llm import Overloaded, QuotaExhausted, chat_for
    from paraphrase import OUT as PARAPHRASES
    from sources import load_bases

    bases = load_bases()
    split = _split_bases(bases)
    checks = list(read_jsonl(OUT)) if OUT.exists() else []
    done = {c["text"] for c in checks}
    paras = [r for r in read_jsonl(PARAPHRASES) if not r.get("skipped")]
    groups = []
    if args.only == "bases" or (args.bases and args.only is None):
        groups.append([b["text"] for b in bases if b["source"] == "hw"])
    if args.only != "bases":  # train first: val/test rows all get a human review whatever the judge says
        groups.append([r["text"] for r in paras if split.get(r["base_id"]) == "train"])
        groups.append([r["text"] for r in paras if split.get(r["base_id"]) != "train"])
    todo: list[str] = []
    for group in groups:  # each group shuffled: every batch mixes intents, so the judge can't guess a label
        pending = sorted({t for t in group if t not in done} - set(todo))  # from its neighbours
        random.Random(SEED).shuffle(pending)
        todo += pending
    chat = chat_for(args.judge, otpm=args.otpm)
    chat.max_wait_s = args.max_wait
    chat.overload_retries = 1  # a Gemini 503 still costs a request: one attempt, then rest (below)
    deadline = time.monotonic() + args.hours * 3600
    print(f"{len(todo)} to judge with {chat.model}", flush=True)
    i = 0
    while i < len(todo):
        batch = todo[i : i + args.batch]
        try:
            got = judge(chat, batch)
        except (QuotaExhausted, Overloaded) as exc:
            wait = exc.retry_after + 5 if isinstance(exc, QuotaExhausted) else args.overload_cooldown
            if time.monotonic() + wait > deadline:
                print(f"stopping ({exc}); a rerun resumes", flush=True)
                break
            print(f"  {exc}: resting {wait / 60:.0f} min", flush=True)
            time.sleep(wait)
            continue
        except RuntimeError as exc:
            print(f"batch {i // args.batch} failed: {exc}", flush=True)
            i += args.batch
            continue
        i += args.batch
        checks += [
            {"text": t, "judge": f"{chat.provider}/{chat.model}", "label": got[t]} for t in batch if t in got
        ]
        write_jsonl(OUT, checks)
        print(f"[{i // args.batch}/{-(-len(todo) // args.batch)}] usage={chat.usage}", flush=True)


if __name__ == "__main__":
    main()
