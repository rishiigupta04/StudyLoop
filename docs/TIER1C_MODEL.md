# Tier 1c — the trained intent classifier (CO4)

`CLASSIFIER=onnx` serves a fine-tuned DistilBERT, exported to ONNX and quantized to dynamic INT8, on CPU with
onnxruntime + tokenizers (no torch). `CLASSIFIER=regex` is the rollback, unchanged. Code: `ml/` (pipeline,
reproduction steps in `ml/README.md`) and `backend/app/orchestration/onnx_classifier.py` (serving).

> **What is and isn't measured yet.** Every number below is on **synthetic** data (hand-written bases the regex
> never saw, their LLM paraphrases, held-out CLINC150/SNIPS negatives). The CO4 headline — ≥90 % on the
> **real-speech** test set, per STT provider, on held-out speakers — needs the first Collect sessions
> (`docs/TIER1C_COLLECT.md`); `ml/eval_real_speech.py` is ready for them and only runs on a fixture today.

## Results — synthetic test split, 5 Oct 2026 (not the CO4 headline)

Full report: `ml/reports/RESULTS.md` (confusion matrices, per-style accuracy, τ sweep), `ml/reports/metrics.json`,
`ml/reports/corpus_regression*.md`, `ml/reports/serving_bench*.json`. Test = 539 rows (163 hand-written bases, 319
paraphrases, 57 CLINC negatives), every one reviewed; per intent 25–58 rows (OOS 106), so ±1 row ≈ ±2–4 F1 points.

### CO4 comparison

| model | params | file | CPU p50 / p95 ms (1 thread) | test accuracy | test macro-F1 |
|---|---:|---:|---:|---:|---:|
| regex baseline (`regex_classifier`, tuned on the corpus) | – | – | 0.03 / 0.08 | 0.770 | 0.804 |
| TF-IDF (char 2–5 + word 1–2) + LogReg, C from validation | – | 2.4 MB | 1.9 / 2.3 | 0.942 | 0.944 |
| DistilBERT (6 blocks), fp32 PyTorch — 3 seeds | 67 M | 268 MB | 32 / 48 | 0.936 ± 0.006 | 0.934 ± 0.008 |
| DistilBERT, first 3 blocks, fp32 — 3 seeds | 46 M | 183 MB | 17 / 27 | 0.939 ± 0.005 | 0.937 ± 0.007 |
| multilingual DistilBERT, fp32 — 1 seed | 135 M | 541 MB | 32 / 55 | 0.944 | 0.946 |
| MuRIL (`google/muril-base-cased`), fp32 — 1 seed | 238 M | 950 MB | 66 / 95 | 0.957 | 0.957 |
| ↳ DistilBERT 6 blocks, best-val seed (s2), ONNX fp32 | 67 M | 268 MB | 24 / 38 | 0.931 | 0.926 |
| ↳ **same, ONNX dynamic INT8 (installed, `CLASSIFIER=onnx`)** | 67 M | 67.5 MB | 7 / 16 | **0.933** | **0.928** |
| ↳ DistilBERT 3 blocks, best-val seed (s2), ONNX INT8 (candidate) | 46 M | 45.9 MB | 3 / 8 | 0.952 | 0.950 |

- **Every fine-tuned model beats the regex by ~16–17 points of accuracy, but TF-IDF matches DistilBERT on this
  synthetic set** (0.942 vs 0.936 ± 0.006). The test text is clean LLM/hand-written Hindi-English; the transformer's
  case rests on the real-speech set (STT noise, unseen phrasings) — the number that counts. MuRIL is the most
  accurate (+2 pts) but 238 M parameters is ~10× the 3-block model's CPU: not for a 0.1-CPU instance unless real
  speech shows the gap is real.
- The seed spread (±0.6 pt) is as large as the gaps between DistilBERT variants; the shipped seed is picked on
  validation (s2), which here happens to be the weakest of the three on test.
- **INT8:** per-tensor lost 0.53 pt validation F1 (budget 0.5), so per-channel ships: validation +0.9 pt, test
  +0.2 pt vs fp32 (noise-level; 4× smaller). The 3-block model passed per-tensor. Tokenizer parity 976/976; ONNX
  fp32 vs torch max |Δlogit| ≈ 2e-5.

### Per-intent F1 (test)

| intent | n | regex | TF-IDF | DistilBERT fp32 | ONNX INT8 |
|---|---:|---:|---:|---:|---:|
| PLAY | 47 | 0.891 | 0.989 | 0.979 | 0.989 |
| PAUSE | 32 | 0.881 | 0.938 | 0.918 | 0.918 |
| SEEK_BACK | 28 | 0.963 | 0.949 | 0.918 | 0.918 |
| SEEK_FORWARD | 31 | 0.969 | 0.984 | 0.984 | 0.984 |
| SEEK_ABSOLUTE | 30 | 0.857 | 0.983 | 0.983 | 0.983 |
| REPLAY | 29 | 0.852 | 0.909 | 0.839 | 0.867 |
| SPEED | 25 | 0.936 | 1.000 | 1.000 | 0.980 |
| VOLUME | 27 | 0.941 | 0.981 | 0.981 | 0.981 |
| SEMANTIC_SEEK | 58 | 0.852 | 0.975 | 0.959 | 0.959 |
| ASK | 29 | 0.404 | 0.721 | 0.764 | 0.764 |
| SUMMARIZE | 28 | 0.727 | 0.929 | 0.889 | 0.857 |
| TAKE_NOTE | 44 | 0.977 | 1.000 | 0.977 | 0.966 |
| STOP_SPEAKING | 25 | 0.438 | 0.960 | 0.852 | 0.889 |
| OOS | 106 | 0.565 | 0.903 | 0.926 | 0.931 |

ASK is the weak class for every model (precision: OOS small talk and REPLAY-like questions land on it). By input
style (ONNX INT8): en 0.931, hinglish 0.934, `hi` code-mix 0.934, `hi_pure` 0.878 (n = 49), CLINC negatives 0.982.

### Confusable pairs (data plan §4), test errors

| pair (a / b) | regex a→b / b→a | TF-IDF | ONNX INT8 |
|---|---|---|---|
| ASK / REPLAY | 1 / 1 | 1 / 0 | 3 / 0 |
| STOP_SPEAKING / PAUSE | 1 / 0 | 1 / 0 | 1 / 0 |
| SEMANTIC_SEEK / ASK | 1 / 2 | 0 / 1 | 0 / 1 |
| SUMMARIZE / ASK | 3 / 0 | 0 / 0 | 0 / 2 |
| TAKE_NOTE / ASK | 2 / 0 | 0 / 0 | 0 / 1 |
| SEEK_BACK / REPLAY | 0 / 0 | 0 / 3 | 0 / 3 |
| VOLUME / SPEED | 0 / 0 | 0 / 0 | 0 / 0 |
| SEEK_ABSOLUTE / SEEK_FORWARD | 0 / 0 | 1 / 0 | 1 / 0 |

The regex's big errors are elsewhere: it sends 39 of 106 OOS rows to ASK and 17 of 25 STOP_SPEAKING rows to OOS
(full matrices in RESULTS.md). The model's remaining pair errors are ASK → REPLAY (3) and REPLAY → SEEK_BACK (3).

### Calibration and routing (the served bundle)

T = 1.25 (validation), ECE test 0.042 → 0.025. Global τ = **0.92**: the lowest threshold with ≤ **2 %** misfires
among direct routes on validation (1.93 %, 6 of 311; `calibrate.py --budget 0.02`, no override). The budget was 1 %
(τ 0.98) until 5 Oct, when Rishi chose 2 %: at τ 0.98 about a third of in-scope test turns and 105 of the 743 corpus
commands waited for `llm_router` (~0.5–1.5 s) instead of the ~10 ms fast path.

| test split | regex (τ 0.85) | ONNX, global τ 0.92 (served) | ONNX, per-intent τ (not chosen) |
|---|---:|---:|---:|
| in-scope turns that skip `llm_router` | 0.864 | 0.905 | 0.882 |
| wrong actions among those | **0.157** | **0.025** (10 of 396) | 0.052 (20 of 386) |
| player turns acted on correctly (fast path) | 0.818 | 0.912 | 0.909 |
| wrong player actions | 0.047 | 0.031 | 0.042 |
| OOS turns that trigger an action | **0.387** | **0.038** (4 of 106) | 0.038 |

- **The 2 % budget holds on validation and is exceeded on test** (2.5 %, fast-path 3.1 %, 4 of 106 OOS turns act).
  With ~400 direct routes a 95 % interval around 2.5 % easily contains 2 %, and every τ from 0.92 to 0.96 is within
  3–4 rows of the others (10, 10, 10, 7, 6 test misfires): these splits cannot separate them. τ 0.95 is the next
  knee on test (7 misfires, ~2 OOS turns act, coverage 0.873) but it is not what the rule picks, and choosing it
  after looking at test would repeat the per-intent mistake below. The real-speech validation speakers re-pick τ.
- **Per-intent τ is not chosen** (out-of-fold on validation it covers less than global, 0.877 vs 0.899). On test it
  misfires 5.2 %, as it did at the 1 % budget (4.9 %): several intents get τ = 0.3 because validation shows them no
  errors. The 5 Oct 1 % calibration had to override the out-of-fold rule for the same reason; at 2 % the rule agrees.
- The budget is a product decision (wrong actions vs a ~1 s wait). A wrong seek can be undone with
  `SEEK_PREVIOUS`; an OOS turn that acts (small talk moves the video) is the same error with nothing the user
  meant behind it, which is why that column is in the table:

| global τ | test coverage | test misfire | test wrong player actions | test OOS turns that act | corpus commands deferred | corpus wrong actions |
|---:|---:|---:|---:|---:|---:|---:|
| 0.90 | 0.915 | 0.025 (10/400) | 0.031 | 0.038 | 1 | 0 |
| **0.92 (served)** | 0.905 | 0.025 (10/396) | 0.031 | 0.038 | 1 | 0 |
| 0.95 | 0.873 | 0.018 (7/380) | 0.028 | 0.019 | 6 | 0 |
| 0.97 | 0.811 | 0.014 (5/352) | 0.021 | 0.009 | 18 | 0 |
| 0.98 (the earlier 1 % budget) | 0.677 | 0.010 (3/293) | 0.014 | 0.000 | 105 | 0 |

### Voice-corpus regression (743 cases through the real graph, LLM/DB keys blanked)

At every τ above the model never picks a different intent or action than the regex on a corpus command: all
disagreements are deferrals to `llm_router` (1 at the served 0.92, "start again" at confidence 0.52, list in
`reports/corpus_regression.md`; 105 at 0.98; what-ifs in `corpus_regression_tau{0.9,0.95,0.97,0.98}.md`). A
regression check, not accuracy — the corpus is training data.

### Serving cost (this laptop, two runs each; `reports/serving_bench*.json`)

| | 6 blocks | 3 blocks |
|---|---:|---:|
| RSS: backend app ~95 MB, plus the model | +110 MB | +86 MB |
| load at startup | 0.35–0.6 s | 0.36 s |
| classify p50 / p95, uncapped | 5–6 / 11–12 ms | 3–4 / 6.5 ms |
| whole fast-path turn p95 (LangGraph + normalize + classify + slots), uncapped | 18–19 ms | 13–14 ms |
| 0.1-core hard cap, classify p95: back-to-back / one call per second | 529–537 / 12 ms | 445–466 / 7–8 ms |
| CFS 0.1-CPU model, whole turn p95, this laptop's speed / half of it | 108 / 307 ms | 104 / 207 ms |

Live, `backend-1c` (`CLASSIFIER=onnx`, the served bundle at τ 0.92, re-measured 5 Oct after the recalibration):
`/health` → `"classifier": "onnx"`, `"classifier_model": "intent-20261005-distilbert-s2"`; WS `ready` → onnx.
`probe_ws.py`, 14 commands × 3 repeats (EN / Hinglish / Hindi, text; `reports/probe_local_tau0.92.json`): every intent
and route as below, `classify_intent` p50 6.2 / p95 13.3 ms (n = 42), server fast path p50 5.9 / p95 12.5 ms (n = 30),
round trip 11–22 ms on the fast path. `--audio` (server TTS → Sarvam STT → classifier, synthetic speech): 14/14
transcribed, 14/14 intents and routes the same (this run STT heard "2D peak" correctly; the earlier run heard "Toddy
Peak", an STT miss that made the seek answer "topic not found": not the classifier).

| style | said | intent (conf) | route |
|---|---|---|---|
| en | go back 10 seconds | SEEK_BACK (0.99) | fast |
| en | pause the video | PAUSE (0.98) | fast |
| en | take me to where he explains binary search | SEMANTIC_SEEK (0.98) | seek |
| en | what did he just say about the peak | ASK (0.97) | rag |
| en | set the speed to 1.5 | SPEED (0.99) | fast |
| hinglish | thoda peeche le jao | SEEK_BACK (0.99) | fast |
| hinglish | das second aage karo | SEEK_FORWARD (0.99) | fast |
| hinglish | awaaz thodi badha do | VOLUME (0.99) | fast |
| hinglish | phir se bolo zara | REPLAY (0.98) | fast |
| hi | वीडियो को pause कर दो | PAUSE (0.98) | fast |
| hi | 30 सेकंड पीछे जाओ | SEEK_BACK (0.99) | fast |
| hi | speed 1.25 कर दीजिए | SPEED (0.99) | fast |
| hi | जहाँ उसने 2D peak समझाया वहाँ ले चलो | SEMANTIC_SEEK (0.98) | seek |
| hi | अब तक का सारांश बताइए | SUMMARIZE (0.98) | rag |

### Render CPU: 6 vs 3 blocks — recommendation: 3 blocks; **decided 5 Oct: Rishi keeps 6 blocks**

The 6-block bundle stays installed and is what gets published (`docs/TIER1C_DEPLOY.md`); the 3-block candidate stays in
`ml/saved_models/` (recalibrated at the same 2 % budget so the comparison stays like-for-like). The risk this accepts is
the CPU one below: on a 0.1-CPU instance the 6-block turn is modelled at ~108 ms (this laptop's speed) to ~307 ms
(half of it) against the 150 ms target, and nothing is proven until `probe_ws.py` runs against a deploy. If it misses,
switching is `install_bundle.py` + `publish_bundle.py` + a lock bump, no code change. The reasoning behind the
recommendation:

Accuracy is the same within seed noise (3 seeds each: 0.939 ± 0.005 vs 0.936 ± 0.006; shipped INT8 seeds 0.952 vs
0.933 on test), the file is 32 % smaller, RSS 24 MB lower, and the classifier costs about half the CPU: at this
laptop's speed it fits one 10 ms CFS quota (p95 ~8 ms) where the 6-block one doesn't (~11–12 ms). It does **not**
make the target safe on its own: the rest of a fast-path turn (LangGraph, normalize, slot parsing) is ~6 ms more, so
a whole turn still spills into a second 100 ms period at p95 — ~104 ms if Render's core matches this laptop, ~207 ms
if it is half as fast (6 blocks: ~108 / ~307 ms). 3 blocks is the one with a realistic chance at "p95 < 150 ms on
Render"; neither is proven until `probe_ws.py --url wss://<render>` runs against a deploy. To switch: `python
ml/install_bundle.py intent-20261005-distilbert-l3-s2` (and make it `LATEST`).

### Still open

- The CO4 headline itself: the real-speech test set (Collect sessions, held-out speakers, per STT provider) — no
  data yet. Re-pick τ on its validation speakers.
- A Hindi speaker's spot check of `data/label_review.jsonl` (the per-row review was Claude's).
- Publishing the bundle and the first deploy: wired (`docs/TIER1C_DEPLOY.md`), **not** pushed to Hugging Face, no
  `backend/bundle.lock.json` yet, nothing deployed. The p95 on Render (`probe_ws.py --url wss://… --repeat 5`) is
  recorded after that deploy.
- Licences before the HF repo goes public: CLINC150 / SNIPS (the licences in `ml/download_oos.py` are not checked
  against the sources), and the providers' terms for publishing a model trained on their LLM outputs; the model card
  declares no licence for the fine-tuned weights.

## How the data was made

| source | rows (before dedup) | split | labels |
|---|---|---|---|
| `backend/tests/voice_corpus.py` | 743 bases | **train only** (the regex was tuned on them) | gold |
| `ml/bases.py` (new) | 840 bases: 20 per intent × en / hinglish / hi | 20 % test, 15 % val, 65 % train per (intent, style), by base | written against the voice_corpus rules; blind-judged, disagreements reviewed |
| `data/paraphrases.jsonl` | 2–6 per base, in explicit target styles | inherits its base's split | judged or confident-learning-checked (train); every val/test row reviewed by two reviewers |
| CLINC150 / SNIPS (downloaded) | ~3 per CLINC intent, 10 per SNIPS intent, as OOS | split by source intent | excluded where they overlap our taxonomy (`download_oos.py`); confident-learning flags reviewed |

- **Every row goes through the backend's `normalize()`** (imported, never copied). The paraphrase styles are chosen
  for what hosted STT now produces: with the WAV fix Sarvam serves STT, writing Hindi in Devanagari, English terms
  in Latin and numbers as digits — after `normalize()` that is e.g. `video ko 10 seconds peeche karo`,
  `jahan usne binary search samjhaaya wahan le chalo`. The corpus is almost all Latin (the browser/Groq era), so
  the generator is asked for Sarvam-style code-mix first for every Latin base; pure Devanagari (`hi_pure`) and
  Groq-style romanization are the other two styles.
- **Split by base utterance**, dedup on the normalized string across splits (train > val > test): no paraphrase of
  a test base is trained on, and no test string appears in training. Guarded by `ml/tests/test_split.py`.
- **Generators.** Gemini 3.6 Flash wrote the first batches (best Hindi of the three models tried) until its free
  tier ran out; `qwen/qwen3.8-27b` on Groq wrote the middle — the one Groq model the app never calls, so the live
  app's `gpt-oss` quota was never touched — until its 200K tokens/day ran out; Gemini 3.8 Flash and the quota
  scheduler (below) wrote SEMANTIC_SEEK's last bases. The free quotas could not finish the rest in under ~10 hours,
  so **Rishi approved `openai/gpt-oss-20b` (the live router's model) for the last ~445 bases** (29 Sep, 00:55 IST;
  `--allow-live`, otherwise the scripts refuse it). With the v3 prompt it echoed the base or re-scripted it
  (Devanagari ↔ Latin) for half its rows, which `normalize()` maps straight back onto the base (54 % new after
  normalization vs 85 % for qwen and 96–99 % for Gemini), so those bases use **prompt v4** = v3 + an explicit
  "never return the original, in either script" line (93 % new), at `reasoning_effort=low` (~2K tokens a batch;
  medium cost twice as much for no gain). gpt-oss-20b wrote 302 bases (889 rows, ~35K tokens) before that session
  ended; when work resumed on 5 Oct the free quotas had refilled, so the last 143 bases went back to free models
  (Gemini 3.8 Flash 40, qwen 103) and no more live quota was used. Gemini 3.1 Flash Lite was tried and rejected as
  a generator: it mostly ignored the Devanagari styles (202 hinglish vs 33 `hi` rows out of 328) and echoed the
  bases, so its rows were deleted and regenerated. Model, seed and prompt version are on every row.
- **Final paraphrase set:** 3,771 rows — qwen3.8-27b 2,423, gpt-oss-20b 889, Gemini 3.8 Flash 240, Gemini 3.6 Flash
  219; styles `hi` (Sarvam-style code-mix) 1,365, hinglish 1,063, en 880, `hi_pure` 463.
- **Label QA, in layers.** LLM paraphrases drift (a REPLAY paraphrase gains "samajh nahi aaya", which the rules make
  ASK; a PLAY paraphrase gains "phir se", i.e. REPLAY). So:
  1. the prompt carries the labeling rules and per-intent pitfalls (`ml/intent_guide.py`);
  2. a **blind judge** labels the text without seeing the intended label. Candidates were scored on the same 140
     hand-written bases (10 per intent): qwen3.8-27b 137/140 = 97.9 %, **Gemini 3.1 Flash Lite 137/140 = 97.9 %**,
     gpt-oss-120b 95.7 %, gpt-oss-20b 92.1 % (the last two are the live app's quota; not used). qwen judged all
     840 hand-written bases (828 agree, 98.6 %); Flash Lite judged **all 3,771 paraphrases** (one request per 230
     rows): 97.9 % agree with their base's intent — Gemini 3.6 Flash rows 99.5 %, qwen 98.1 %, Gemini 3.8 Flash
     98.3 %, gpt-oss-20b 96.7 %;
  3. **confident learning** (`ml/label_noise.py`, Northcutt et al. 2021) as a second, model-based audit of the train
     split (built as the fallback for rows the judge couldn't reach; in the end the judge reached all of them):
     out-of-fold DistilBERT probabilities, 5 folds **grouped by base** (a paraphrase is scored by a model that never
     saw its base or siblings), per-class thresholds; rows off the diagonal of the confident joint are flagged.
     Final run: out-of-fold accuracy 92.3 %, 79 of 3,880 train rows flagged (mostly OOS ↔ ASK); the 39 not already
     reviewed or in the gold corpus were reviewed: 6 dropped (a SNIPS "Play … song" negative, garbled or ambiguous
     paraphrases), the rest kept — the flagger is wrong more often than right, it's a pointer, not a gate;
  4. **row-by-row review** (`data/label_review.jsonl`, `ml/review.py`, guide `ml/review_brief.md`): every judge
     disagreement, every confident-learning flag, and **every val/test row**, agreed or not. Val/test rows get two
     independent reviewers — A audits the current label (sees the judge's), B labels blind from the text alone — and
     a third decision settles any difference; A/B agreement is reported below. Policy: relabel only when certain;
     drop what is ambiguous even to a careful human, garbled, or unnatural. A base dropped as ambiguous takes its
     paraphrases with it. **Who reviewed:** Claude (Opus 5.5) did the per-row judgments (the `reviewer` field);
     Rishi's own decisions are marked in `note`. It is a careful, logged review against written rules, not a
     native-speaker annotation study: a spot check by a Hindi speaker is still worth doing before the CO4 write-up.
     **Numbers:** 1,192 decisions. Val/test: all 955 generated/hand-written rows (A/B agreement **946/955 = 99.1 %**;
     22 dropped) plus the 114 CLINC negatives that landed in val/test (all clearly off-topic, kept as OOS). Judge
     disagreements: 84 reviewed (bases 11, paraphrases 73; 44 kept, 6 relabeled, 34 dropped as ambiguous or garbled;
     A/B agreement on the hardest 56 was 68 %, which is why there's a third decision). Confident-learning flags: 39
     (33 kept, 6 dropped).
  A generated train row is trained on only if a review kept it, the judge agreed, or confident learning passed it;
  the dataset build counts any val/test row without a review (`valtest_unreviewed`, 0 in the final build).
- **Final dataset** (`data/build/stats.json`): train **3,874**, val **437**, test **539** rows after normalization and
  dedup (867 duplicates collapsed, 45 of them across splits — the train copy wins). Test = 163 hand-written bases,
  319 paraphrases, 57 CLINC negatives; per intent 25–58 rows (OOS 106). With 25–30 rows for some intents, one error
  moves that intent's F1 by ~2 points: per-intent numbers below are indicative.
- **Free-tier quota facts** (learned 28–29 Sep, they decide how long a data run takes):
  - both "per day" limits are **continuously refilling buckets**, not midnight resets: Groq qwen3.8-27b's 200K
    tokens/day refills ~139 tokens/min (a TPD 429 says exactly how long to wait); Gemini's 20 requests/day/model
    refills one request per ~72 min (its 429 carries a `retryDelay` for the next single request);
  - Groq also caps qwen at 1,000 output tokens a minute, checked per request against its expected output;
  - on Gemini's free tier **a 503 "high demand" answer still costs one of the day's 20 requests**: a retry loop over
    an overloaded model burned 3.8 Flash's whole day in minutes. `llm.py` therefore fails fast on 503 and
    `paraphrase.py` schedules instead of retrying: every request goes to the most preferred model that isn't
    resting, a 503 rests that model for 30 min, an empty bucket for exactly its refill time;
  - Gemini Flash models answer 503 for hours during US daytime; Gemma 4 (26B/31B) timed out or 500'd.
- **OOS negatives** exclude CLINC intents that are StudyLoop intents in disguise (`repeat` = REPLAY,
  `change_volume` = VOLUME, `thank_you` dismisses, `definition` is a lecture question, `next_song` reads like
  SEEK_FORWARD…) and CLINC's own `oos` split, which is full of academic questions — for a student watching a
  lecture those are ASK.

## Calibration and routing

Temperature scaling on the **INT8 model's** validation logits (the model that serves), then τ = the lowest
threshold whose misfire rate — wrong actions among turns that skip `llm_router` — is within the budget on validation
(`--budget`, default 1 %; **the served bundle uses 2 %**, Rishi's call on 5 Oct, recorded as `misfire_budget` in
`calibration.json`). Per-intent τ was tried and is compared **out-of-fold** (5 folds within validation), because
picking and judging thresholds on the same rows always flatters the option with more knobs; it is served only if it
wins out-of-fold — unless `calibrate.py --tau-mode global|per_intent --why "…"` overrides it, which `calibration.json`
records (`override`, `out_of_fold_choice`). The 1 % bundle of 5 Oct needed that override (the out-of-fold edge was 2
vs 3 misfires and per-intent misfired 4.9 % on test); at the 2 % budget the rule itself picks global, so there is none.
The graph uses the bundle's τ for the ONNX model (`graph._threshold`); `CONFIDENCE_THRESHOLD` still governs the regex.

τ should be re-picked on the real-speech validation speakers once they exist: synthetic validation text is cleaner
than STT output, so it under-estimates misfires.

## Serving

- `onnx_classifier.load()` runs once at startup (lifespan), before the warm-up turn. On any failure (missing bundle,
  corrupt file, no onnxruntime) the regex keeps serving and `/health` says `"classifier": "regex (onnx failed: …)"`;
  when it works `/health` says `"classifier": "onnx"` plus `"classifier_model": "<version>"`, and the WS `ready`
  message reports the classifier that really serves.
- numpy / onnxruntime / tokenizers are imported lazily: `CLASSIFIER=regex` doesn't load them.
- A bundle records the `normalize()` version it was trained on; a mismatch at load is logged (retrain).
- CI runs the real onnxruntime + tokenizers path on a 1.5 KB fixture bundle (`backend/tests/fixtures/`), plus the
  `ml/` tests (split leakage, normalize parity, the real-speech evaluator).

## Render CPU: how the 6- vs 3-block comparison is measured

Render's free instance is 0.1 CPU. Three views, because none of them is a measurement on Render itself:
- **Windows hard cap, saturated** (`bench_serving.py --cpu-cap 0.1`): calls back to back, so the process is always
  out of budget and p95 ≈ the throttle period (~450–540 ms for either model). A many-users worst case.
- **Windows hard cap, sparse** (same run, `--sparse-gap 1`): one call after a second of idle, the real single-user
  pattern (a voice turn every few seconds): classifier p95 12 ms (6 blocks) / 7–8 ms (3 blocks).
- **CFS model**: Docker/Linux `--cpus 0.1` is a quota of 10 ms CPU per 100 ms period; a call needing c ms of CPU
  that starts with a full quota takes c + (ceil(c/10) − 1) × 90 ms. Applied to every measured uncapped call, at this
  laptop's speed and at half of it (Render doesn't publish its CPU). The point it makes: what matters is whether a
  whole fast-path turn (normalize → classify → parse_slots → action_executor, plus LangGraph's own overhead) fits in
  one 10 ms quota — each quota it overflows adds ~90 ms.
The real number is `probe_ws.py --url wss://<render>` after a deploy: the server's own per-node timings.

## Deploy

`ml/saved_models/` and `backend/models/` are gitignored, so the ~68 MB bundle ships through a public Hugging Face model
repo, not git. `ml/publish_bundle.py --push` uploads the five files plus a generated model card in one commit and
writes `backend/bundle.lock.json` (repo, commit sha, size + sha256 of every file); the Dockerfile's fetch step
(`backend/scripts/fetch_intent_bundle.py`) downloads exactly that revision into `/app/models/intent` and fails the build
on any mismatch; `render.yaml` serves it with `CLASSIFIER=onnx`, and `CLASSIFIER=regex` rolls back without a rebuild.
Procedure, retrain-and-ship, both rollbacks, what is and is not verified, and the post-deploy measurement:
[`TIER1C_DEPLOY.md`](TIER1C_DEPLOY.md). **The real risk is CPU, not memory**: see the serving-cost and 6- vs 3-block
sections above; neither bundle is proven until `probe_ws.py` runs against a deploy.
