# Tier 1c intent classifier — results (synthetic test split)

_Generated 2026-10-05 15:02 UTC by `ml/evaluate.py`. normalize() version 1.0.0. Bundle: `intent-20261005-distilbert-s2`._

> **Not the CO4 headline.** These are synthetic numbers: the test split is hand-written bases (never seen by
> the regex, which was tuned on `voice_corpus.py`) plus their LLM paraphrases and held-out CLINC150/SNIPS
> negatives. The ≥90 % target is for the real-speech test set (`ml/eval_real_speech.py`), which has no data yet.

## Data

- rows: train 3874, val 437, test 539 (split by base utterance; the 743-case voice corpus is train-only)
- per style in test: {"hinglish": 151, "hi": 152, "en": 187, "hi_pure": 49}; per kind: {"para": 319, "base": 163, "external": 57}
- labels: 4275 blind-judge labels, 1192 review decisions (every val/test row; unreviewed val/test rows: {}), confident learning {"flag": 79, "pass": 3801}; paraphrases admitted by {"judge_agrees": 2895, "review": 873}
- dropped: {"base_dropped_in_review": 2, "paraphrase_of_dropped_base": 3, "external_dropped_in_review": 1, "duplicate": 867, "cross_split_duplicate": 45}

## CO4 comparison (test split)

| model | params | size | CPU p50 / p95 ms (1 thread) | accuracy | macro-F1 | notes |
|---|---:|---:|---:|---:|---:|---|
| Regex baseline (backend `regex_classifier`) | – | – | 0.03 / 0.08 | 0.770 | 0.804 |  |
| TF-IDF (char 2-5 + word 1-2) + LogReg | – | 2.4 MB | 1.91 / 2.30 | 0.942 | 0.944 |  |
| DistilBERT (distilbert-base-uncased), fp32 PyTorch | 67 M | 267.9 MB | 31.75 / 48.49 | 0.931 | 0.926 | 3 seed(s): acc 0.936 ± 0.006, F1 0.934 ± 0.008 |
| DistilBERT, first 3 of its 6 blocks (`--layers 3`), fp32 PyTorch | 46 M | 182.8 MB | 16.88 / 26.59 | 0.944 | 0.943 | 3 seed(s): acc 0.939 ± 0.005, F1 0.937 ± 0.007 |
| multilingual DistilBERT (distilbert-base-multilingual-cased), fp32 PyTorch | 135 M | 541.4 MB | 31.79 / 55.22 | 0.944 | 0.946 | 1 seed(s): acc 0.944 ± 0.000, F1 0.946 ± 0.000 |
| MuRIL (google/muril-base-cased), fp32 PyTorch | 238 M | 950.3 MB | 66.27 / 94.58 | 0.957 | 0.957 | 1 seed(s): acc 0.957 ± 0.000, F1 0.957 ± 0.000 |
| ↳ exported to ONNX fp32 | 67 M | 268.0 MB | 23.56 / 38.39 | 0.931 | 0.926 |  |
| ↳ **ONNX dynamic INT8 (deployed, CLASSIFIER=onnx)** | 67 M | 67.5 MB | 6.63 / 16.07 | 0.933 | 0.928 | quantization: per-channel |

INT8 vs fp32 (per-channel): validation Δacc -0.92 pt, ΔF1 -0.90 pt; test Δacc -0.19 pt, ΔF1 -0.13 pt (budget 0.5 pt, chosen on validation: within).

## Per-intent F1 (test)

| intent | support | regex | tfidf | distilbert-base-uncased | onnx-int8 |
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

## Accuracy by input style (test)

| style | n | regex | tfidf | distilbert-base-uncased | onnx-int8 |
|---|---:|---:|---:|---:|---:|
| en | 130 | 0.831 | 0.908 | 0.931 | 0.931 |
| hinglish | 151 | 0.801 | 0.960 | 0.927 | 0.934 |
| hi | 152 | 0.757 | 0.947 | 0.928 | 0.934 |
| hi_pure | 49 | 0.857 | 0.918 | 0.898 | 0.878 |
| external | 57 | 0.509 | 0.982 | 0.982 | 0.982 |

`hi` = Sarvam-style code-mix (Devanagari Hindi, Latin English terms, digits); `hi_pure` = all Devanagari (Chrome hi-IN,
or Sarvam spelling an English term in Devanagari); `hinglish` = romanized (Groq Whisper); `external` = CLINC150/SNIPS OOS.

## Confusable pairs (data plan §4), errors on test

| pair | regex | tfidf | distilbert-base-uncased | onnx-int8 |
|---|---|---|---|---|
| ASK / REPLAY | 1 → / 1 ← | 1 → / 0 ← | 4 → / 0 ← | 3 → / 0 ← |
| STOP_SPEAKING / PAUSE | 1 → / 0 ← | 1 → / 0 ← | 1 → / 0 ← | 1 → / 0 ← |
| SEMANTIC_SEEK / ASK | 1 → / 2 ← | 0 → / 1 ← | 0 → / 1 ← | 0 → / 1 ← |
| SUMMARIZE / ASK | 3 → / 0 ← | 0 → / 0 ← | 0 → / 1 ← | 0 → / 2 ← |
| TAKE_NOTE / ASK | 2 → / 0 ← | 0 → / 0 ← | 0 → / 1 ← | 0 → / 1 ← |
| SEEK_BACK / REPLAY | 0 → / 0 ← | 0 → / 3 ← | 0 → / 3 ← | 0 → / 3 ← |
| VOLUME / SPEED | 0 → / 0 ← | 0 → / 0 ← | 0 → / 0 ← | 0 → / 0 ← |
| SEEK_ABSOLUTE / SEEK_FORWARD | 0 → / 0 ← | 1 → / 0 ← | 1 → / 0 ← | 1 → / 0 ← |

(`a → b` = true first intent predicted as the second; supports differ per intent, see the per-intent table.)

**Confusion matrix — onnx-int8 (rows true, columns predicted; §4 pairs in bold)**

| true \ pred | PLAY | PAUS | BACK | FWD | ABS | RPLY | SPD | VOL | SEM | ASK | SUM | NOTE | STOP | OOS |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| PLAY | 46 | · | 1 | · | · | · | · | · | · | · | · | · | · | · |
| PAUS | · | 28 | 1 | · | · | · | · | · | 2 | · | · | · | · | 1 |
| BACK | · | · | 28 | · | · | · | · | · | · | · | · | · | · | · |
| FWD | · | · | · | 31 | · | · | · | · | · | · | · | · | · | · |
| ABS | · | · | · | **1** | 29 | · | · | · | · | · | · | · | · | · |
| RPLY | · | · | **3** | · | · | 26 | · | · | · | · | · | · | · | · |
| SPD | · | · | · | · | · | · | 25 | · | · | · | · | · | · | · |
| VOL | · | · | · | · | · | · | · | 26 | · | · | · | · | 1 | · |
| SEM | · | · | · | · | · | · | · | · | 58 | · | · | · | · | · |
| ASK | · | · | · | · | · | **3** | · | · | **1** | 21 | **2** | **1** | · | 1 |
| SUM | · | · | · | · | · | 2 | · | · | 1 | · | 24 | · | · | 1 |
| NOTE | · | · | · | · | · | · | 1 | · | · | · | 1 | 42 | · | · |
| STOP | · | **1** | · | · | · | · | · | · | · | · | · | · | 24 | · |
| OOS | · | · | · | · | · | · | · | · | 1 | 5 | 1 | · | 4 | 95 |

**Confusion matrix — regex (rows true, columns predicted; §4 pairs in bold)**

| true \ pred | PLAY | PAUS | BACK | FWD | ABS | RPLY | SPD | VOL | SEM | ASK | SUM | NOTE | STOP | OOS |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| PLAY | 41 | · | · | 2 | · | 1 | · | · | · | · | · | · | · | 3 |
| PAUS | 1 | 26 | · | · | · | · | · | · | · | · | · | · | · | 5 |
| BACK | · | · | 26 | · | · | · | · | · | 1 | · | · | · | · | 1 |
| FWD | · | · | · | 31 | · | · | · | · | · | · | · | · | · | · |
| ABS | 2 | · | · | · | 24 | · | · | · | 3 | · | · | · | · | 1 |
| RPLY | 1 | · | · | · | · | 23 | · | · | 1 | **1** | · | · | · | 3 |
| SPD | · | · | · | · | · | · | 22 | · | · | · | · | · | · | 3 |
| VOL | · | · | · | · | · | · | · | 24 | · | · | · | · | · | 3 |
| SEM | · | · | · | · | 1 | · | · | · | 49 | **1** | · | · | · | 7 |
| ASK | · | · | · | · | · | **1** | · | · | **2** | 19 | · | · | · | 7 |
| SUM | · | · | · | · | · | · | · | · | · | **3** | 16 | · | · | 9 |
| NOTE | · | · | · | · | · | · | · | · | · | **2** | · | 42 | · | · |
| STOP | · | **1** | · | · | · | · | · | · | · | · | · | · | 7 | 17 |
| OOS | · | · | · | · | 1 | · | · | · | 1 | 39 | · | · | · | 65 |

Abbreviations: PLAY = PLAY, PAUS = PAUSE, BACK = SEEK_BACK, FWD = SEEK_FORWARD, ABS = SEEK_ABSOLUTE, RPLY = REPLAY, SPD = SPEED, VOL = VOLUME, SEM = SEMANTIC_SEEK, ASK = ASK, SUM = SUMMARIZE, NOTE = TAKE_NOTE, STOP = STOP_SPEAKING, OOS = OOS

## Calibration and routing threshold τ

- temperature T = 1.252 (fitted on validation logits of the INT8 model); ECE val 0.031 → 0.018, test 0.042 → 0.025
- global τ = 0.92: the lowest threshold with ≤ 2% misfires among direct routes on validation.
- out-of-fold on validation chose **global**; served: **global**. Full sweep: `ml/reports/tau_sweep.csv`.

| on the test split | regex (τ 0.85) | ONNX INT8, global τ | ONNX INT8, per-intent τ |
|---|---:|---:|---:|
| coverage: in-scope turns that skip llm_router | 0.864 | 0.905 | 0.882 |
| misfire rate among those direct routes | 0.157 | 0.025 | 0.052 |
| fast path: player-intent turns acted on correctly | 0.818 | 0.912 | 0.909 |
| fast path: wrong player actions among fast-path actions | 0.047 | 0.031 | 0.042 |
| OOS turns that trigger a direct action | 0.387 | 0.038 | 0.038 |

Fast-path intents: PAUSE, PLAY, REPLAY, SEEK_ABSOLUTE, SEEK_BACK, SEEK_FORWARD, SPEED, STOP_SPEAKING, VOLUME.

The misfire budget is a product choice — wrong actions vs turns that wait for `llm_router` (~0.5–1.5 s):

| global τ | val coverage | val misfire | test coverage | test misfire | test fast-path misfire | test OOS turns that act |
|---:|---:|---:|---:|---:|---:|---:|
| 0.8 | 0.931 | 0.028 | 0.945 | 0.039 | 0.038 | 0.057 |
| 0.9 | 0.899 | 0.025 | 0.915 | 0.025 | 0.031 | 0.038 |
| **0.92** (served) | 0.891 | 0.019 | 0.905 | 0.025 | 0.031 | 0.038 |
| 0.95 | 0.871 | 0.017 | 0.873 | 0.018 | 0.028 | 0.019 |
| 0.97 | 0.807 | 0.011 | 0.811 | 0.014 | 0.021 | 0.009 |
| 0.98 | 0.667 | 0.000 | 0.677 | 0.010 | 0.014 | 0.000 |

## Render CPU: 6 vs 3 transformer blocks (both INT8 ONNX, each with its own calibrated τ)

| model | params | model.onnx | val acc / F1 | test acc / F1 | test coverage / misfire | classify p50 / p95 ms, uncapped | whole fast-path turn p95, uncapped | 0.1-core cap, classify p95: saturated / sparse | CFS 0.1 CPU, whole turn p95 at 1× / 2× | RSS +MB | bench runs |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 6 blocks (DistilBERT) | 67 M | 67.5 MB | 0.952 / 0.950 | 0.933 / 0.928 | 0.905 / 0.025 | 6.82 / 16.51 | 18–19 | 529–537 / 12 | 108–109 / 306–308 | 109–110 | 2 |
| 3 blocks (DistilBERT `--layers 3`) | 46 M | 45.9 MB | 0.941 / 0.939 | 0.952 / 0.950 | 0.917 / 0.022 | 3.24 / 8.45 | 13–14 | 445–466 / 7–8 | 103–104 / 207–208 | 86 | 2 |

All latencies in ms on this laptop (ranges = repeated runs). The cap is a Windows Job Object hard cap (`bench_serving.py --cpu-cap 0.1`): *saturated* = calls back to back, so p95 is the throttle period; *sparse* = one call after 1 s idle, how one user talks to it. *CFS* = a model, not a measurement: Docker/Linux `--cpus 0.1` gives 10 ms CPU per 100 ms period, so a turn needing c ms takes c + (ceil(c/10) − 1) × 90 ms; 2× = a server core half this laptop's speed. The whole fast-path turn includes LangGraph, normalize and slot parsing (~6 ms of it is not the classifier). None of this is a measurement on Render: `probe_ws.py` against the deployed server is.
