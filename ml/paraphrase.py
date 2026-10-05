"""Generate LLM paraphrases of every base utterance → data/paraphrases.jsonl (committed).

    ml/.venv/Scripts/python ml/paraphrase.py            # resumes: bases already in the file are skipped
    ml/.venv/Scripts/python ml/paraphrase.py --dry-run  # print one prompt, call nothing
    ml/.venv/Scripts/python ml/paraphrase.py --gen gemini-3.8-flash,gemini-3.7-flash,qwen/qwen3.8-27b --hours 6

Each base gets k paraphrases in explicit target styles (en / hinglish / hi = Sarvam code-mix / hi_pure), so after
`normalize()` the set looks like what hosted STT produces, not only Groq's romanized text. k is chosen per intent
so every intent lands near TARGET rows before dedup. Batches are deterministic (sorted by base id) and each is
sent with its own seed; the model, seed and prompt version are stored on every row. Rerunning the rest of the
pipeline never needs an LLM: dataset.py reads this file.
"""

from __future__ import annotations

import argparse
import math
import re
import sys
import time
from collections import Counter, defaultdict

from common import DATA, INTENTS, read_jsonl, stable_hash, write_jsonl
from intent_guide import DEFINITIONS, NEIGHBOURS, PITFALLS, RULES, STYLES
from sources import detect_style, load_bases

OUT = DATA / "paraphrases.jsonl"
SEED = 20260928
PROMPT_V = 3
# v4 = v3 + NO_ECHO. gpt-oss-20b (29 Sep, approved for the last bases) returned the base itself or the base in the
# other script for half its rows, which normalize() maps straight back onto the base; v3 rows are unchanged.
NO_ECHO = (
    "\nNever return the original utterance, the original written in another script (Devanagari <-> Latin), or the "
    "original with only punctuation or one word changed: every paraphrase must be a genuinely different sentence."
)
# Gemini 3.6 Flash wrote the first batches (best Hindi) until its free tier ran out (20 requests/day/model); the
# one Groq model the app never calls wrote the middle (the live app's gpt-oss quota is never touched) until its
# 200K tokens/day ran out; Gemini 3.6 Flash wrote the rest in bigger batches (its limit is requests, not tokens).
GENERATOR = "qwen/qwen3.8-27b"
OTPM = 1000  # that model's output tokens per minute on this key: the real bottleneck, so requests are paced to it
TEMPERATURE = 0.9
# rows per intent before dedup (bases + paraphrases): ~300-500 per intent after dedup, plus the OOS negatives
TARGET = 340
K_MIN, K_MAX = 2, 6
BATCH = 14  # Groq: sized to the 1,000 output tokens/min; Gemini takes --batch 40 (20 requests/day/model)

# the order styles are handed out in, per base style (first k are used). Sarvam-style code-mix comes first for
# every Latin base: with the WAV fix that is what hosted STT now produces, and the corpus has almost none of it.
PLAN = {
    "en": ["hi", "en", "hinglish", "hi_pure", "en", "hi"],
    "hinglish": ["hi", "hinglish", "en", "hi_pure", "hinglish", "hi"],
    "hi": ["hinglish", "hi", "en", "hi_pure", "hi", "hinglish"],
}

_ALLOWED = re.compile(r"^[\sA-Za-z0-9ऀ-ॿ.,:;!?'\"%()\-]+$")
_DEVANAGARI = re.compile("[ऀ-ॿ]")

PROMPT = """You write training data for StudyLoop's voice-command classifier. A student watching a long lecture video \
holds a key and talks to the app in English, Hindi or Hinglish; speech-to-text turns it into text.

Intent: {intent}. Meaning: {definition}.
It must NOT drift into: {neighbours}.
Watch out: {pitfalls}
Labeling rules the data follows:
{rules}

For each utterance below write the requested paraphrases. Each one must be something a real student would SAY \
out loud (casual, sometimes with a filler or a polite word, sometimes very short), keep exactly the same intent \
({intent}), and follow the rules above. Vary the wording and word order, not just one word. You may change a \
number, a time or a lecture topic to another plausible one. No emojis, no quotes, no explanations.{extra}

Styles:
{styles}

Return JSON mapping each id to its paraphrases, one per requested style, in the requested order: \
{{"b1": ["...", "..."], "b2": ["...", "..."]}}

Utterances:
{items}"""


def ks_per_intent(bases: list[dict]) -> dict[str, int]:
    n = Counter(b["intent"] for b in bases)
    return {i: max(K_MIN, min(K_MAX, math.ceil(TARGET / n[i]) - 1)) for i in INTENTS}


def build_prompt(intent: str, batch: list[dict], k: int, prompt_v: int = PROMPT_V) -> str:
    # short ids: Groq meters this model's OUTPUT tokens (1,000/min), and every echoed id is output
    items = "\n".join(
        f"- b{n + 1} | styles: {', '.join(PLAN[b['style']][:k])} | text: {b['text']}"
        for n, b in enumerate(batch)
    )
    return PROMPT.format(
        intent=intent,
        definition=DEFINITIONS[intent],
        neighbours="; ".join(f"{n} ({DEFINITIONS[n]})" for n in NEIGHBOURS[intent]),
        pitfalls=PITFALLS[intent],
        rules=RULES,
        styles="\n".join(f"- {s}: {d}" for s, d in STYLES.items()),
        items=items,
        extra=NO_ECHO if prompt_v >= 4 else "",
    )


def clean(text: str, want: str) -> str | None:
    """Drop empty, rambling or wrong-alphabet (e.g. CJK) answers. A style mismatch is kept: the requested style
    only steers the mix, the row records the style it really is (actual_style), and the judge gates the label."""
    t = " ".join(str(text or "").split()).strip(" \"'")
    if not t or len(t.split()) > 30 or not _ALLOWED.match(t):
        return None
    return t


def actual_style(text: str, want: str) -> str:
    """The style the text really is: Devanagari with or without Latin words, romanized Hindi, or English."""
    if _DEVANAGARI.search(text):
        return "hi" if re.search("[A-Za-z]", text) or want == "hi" else "hi_pure"
    return detect_style(text)


def _rows_for(
    batch: list[dict], intent: str, k: int, out: dict, seed: int, gen: str, prompt_v: int = PROMPT_V
) -> list[dict]:
    by_short = {f"b{n + 1}": b["base_id"] for n, b in enumerate(batch)}
    got = {by_short[k]: v for k, v in out.items() if k in by_short and isinstance(v, list)}
    rows: list[dict] = []
    for b in batch:
        styles = PLAN[b["style"]][:k]
        for want, text in zip(styles, got.get(b["base_id"], []), strict=False):
            t = clean(text if isinstance(text, str) else "", want)
            if t is not None:
                rows.append(
                    {
                        "base_id": b["base_id"],
                        "intent": intent,
                        "base_style": b["style"],
                        "style": actual_style(t, want),
                        "text": t,
                        "gen": gen,
                        "seed": seed,
                        "prompt_v": prompt_v,
                    }
                )
        if b["base_id"] not in got:  # answered without this id: a rerun retries it
            rows.append({"base_id": b["base_id"], "intent": intent, "skipped": True, "seed": seed})
    return rows


def _save(rows: list[dict]) -> None:
    order = {s: k for k, s in enumerate(("en", "hinglish", "hi", "hi_pure"))}
    rows.sort(
        key=lambda r: (
            r["intent"],
            r["base_id"],
            r.get("skipped", False),
            order.get(r.get("style"), 9),
            r.get("text", ""),
        )
    )
    write_jsonl(OUT, rows)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--limit", type=int, default=0, help="max batches this run (0 = all)")
    ap.add_argument("--otpm", type=int, default=OTPM, help="output tokens/min this run may use (Groq cap)")
    ap.add_argument(
        "--gen",
        default=GENERATOR,
        help="model, or a comma-separated preference list: each request goes to the first one not cooling down",
    )
    ap.add_argument("--batch", type=int, default=40, help="bases per Gemini request (limit: requests/day)")
    ap.add_argument(
        "--groq-batch", type=int, default=BATCH, help="bases per Groq request (limit: tokens/min)"
    )
    ap.add_argument(
        "--overload-cooldown", type=float, default=600, help="seconds to rest a model after a 503"
    )
    ap.add_argument("--hours", type=float, default=0, help="give up after this long (0 = until done)")
    ap.add_argument("--reasoning", default="", help="gpt-oss reasoning_effort (low | medium | high)")
    ap.add_argument("--prompt-v", type=int, default=PROMPT_V, help="4 = v3 + NO_ECHO (for gpt-oss)")
    ap.add_argument(
        "--allow-live",
        action="store_true",
        help="allow the live app's gpt-oss models in --gen (Rishi approved gpt-oss-20b for the last ~445 bases, 29 Sep)",
    )
    args = ap.parse_args()

    bases = load_bases()
    ks = ks_per_intent(bases)
    existing = [r for r in read_jsonl(OUT)] if OUT.exists() else []
    done = {r["base_id"] for r in existing if not r.get("skipped")}
    existing = [r for r in existing if not r.get("skipped")]  # skipped bases get another try
    review = DATA / "label_review.jsonl"
    dropped = {r["text"] for r in read_jsonl(review) if r["decision"] == "drop"} if review.exists() else set()
    todo: dict[str, list[dict]] = defaultdict(list)
    for b in sorted(bases, key=lambda b: b["base_id"]):
        if (
            b["base_id"] not in done and b["text"] not in dropped
        ):  # a base dropped in review isn't paraphrased
            todo[b["intent"]].append(b)
    left = sum(len(v) for v in todo.values())
    print(f"{len(bases)} bases, {len(done)} done, {left} to go; k per intent: {ks}", flush=True)
    if args.dry_run:
        first = next((i for i in INTENTS if todo[i]), None)
        if first:
            print(build_prompt(first, todo[first][: args.batch], ks[first]))
        return

    from llm import Overloaded, QuotaExhausted, chat_for

    # Scheduler: every request goes to the most preferred model that isn't cooling down. One attempt each —
    # on Gemini's free tier even a 503 costs one of the day's 20 requests — then the model rests: after a 503 for
    # --overload-cooldown, after an empty daily bucket for exactly the refill time the API reports. It only ever
    # spends quota as it refills, and never the live app's gpt-oss models (chat_for refuses them) unless
    # --allow-live says a human approved it.
    chats = [
        chat_for(
            m.strip(), otpm=args.otpm if m.strip().startswith("qwen/") else 0, allow_live=args.allow_live
        )
        for m in args.gen.split(",")
    ]
    for c in chats:
        if args.reasoning and c.provider == "groq" and not c.model.startswith("qwen/"):
            c.extra = {"reasoning_effort": args.reasoning}
        c.overload_retries = 1
        c.max_wait_s = 5  # Groq: don't sleep inside a call on a tokens/day 429, cool the model down instead
    ready_at = {c.model: 0.0 for c in chats}
    skips: Counter[str] = Counter()
    deadline = time.monotonic() + args.hours * 3600 if args.hours else float("inf")
    n = 0
    while any(todo.values()) and (not args.limit or n < args.limit):
        now = time.monotonic()
        free = [c for c in chats if ready_at[c.model] <= now]
        if not free:
            wake = min(ready_at.values())
            if wake > deadline:
                print("deadline: stopping with bases still to do (rerun resumes)", flush=True)
                break
            time.sleep(max(1.0, wake - now))
            continue
        chat = free[0]
        intent = next(i for i in INTENTS if todo[i])
        batch = todo[intent][: args.batch if chat.provider == "gemini" else args.groq_batch]
        k = ks[intent]
        seed = (SEED + stable_hash(batch[0]["base_id"])) % 2**31
        try:
            # ~15 output tokens a paraphrase; the cap only has to cover the batch, not the model's default.
            # gpt-oss spends part of max_tokens on its reasoning, so it gets headroom for that.
            reasoning = 1500 if "gpt-oss" in chat.model else 0
            out = chat.json(
                build_prompt(intent, batch, k, args.prompt_v),
                temperature=TEMPERATURE,
                seed=seed,
                max_tokens=300 + 30 * k * len(batch) + reasoning,
            )
        except QuotaExhausted as exc:
            ready_at[chat.model] = time.monotonic() + exc.retry_after + 5
            print(f"  {chat.model}: bucket empty, next try in {exc.retry_after / 60:.0f} min", flush=True)
            continue
        except Overloaded:
            ready_at[chat.model] = time.monotonic() + args.overload_cooldown
            continue
        except RuntimeError as exc:  # bad JSON / network after retries
            ready_at[chat.model] = time.monotonic() + 120
            print(f"  {chat.model}: failed ({exc}); resting 2 min", file=sys.stderr, flush=True)
            continue
        rows = _rows_for(batch, intent, k, out, seed, f"{chat.provider}/{chat.model}", args.prompt_v)
        existing += [r for r in rows if not r.get("skipped")]
        _save(existing)  # after every batch: safe to interrupt, deterministic file order
        answered = {r["base_id"] for r in rows if not r.get("skipped")}
        for b in batch:
            if b["base_id"] not in answered:
                skips[b["base_id"]] += 1
        todo[intent] = [
            b for b in todo[intent] if b["base_id"] not in answered and skips[b["base_id"]] < 3
        ]  # a base a model keeps ignoring is left for a rerun rather than retried forever
        n += 1
        left = sum(len(v) for v in todo.values())
        print(
            f"[{n}] {chat.model:22} {intent:14} +{len(rows) - (len(batch) - len(answered)):3}  "
            f"{left} bases left  usage={ {c.model: c.usage for c in chats if c.usage['requests']} }",
            flush=True,
        )


if __name__ == "__main__":
    main()
