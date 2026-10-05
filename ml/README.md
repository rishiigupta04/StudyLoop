# ml/ — Tier 1c intent classifier (CO4)

Trains and evaluates the voice-command intent classifier behind `CLASSIFIER=onnx`: a fine-tuned DistilBERT,
exported to ONNX and quantized to dynamic INT8, served on CPU by `backend/app/orchestration/onnx_classifier.py`
(onnxruntime + tokenizers, no torch). The regex classifier stays the rollback (`CLASSIFIER=regex`).

Results: [`reports/RESULTS.md`](reports/RESULTS.md) (synthetic test split — **not** the CO4 headline, which is the
real-speech set), [`reports/corpus_regression.md`](reports/corpus_regression.md), `reports/serving_bench*.json`.
Design notes, deploy proposal and what is still open: [`docs/TIER1C_MODEL.md`](../docs/TIER1C_MODEL.md).

## Non-negotiables this code keeps

- Every row goes through the backend's own `studyloop_nlp.normalize()` (imported from `backend/`, never copied);
  `tests/test_normalize_parity.py` checks the built data, the graph node and the bundle's recorded version.
- Split by **base utterance**: a base and all its paraphrases share one split; the 743-case voice corpus (which the
  regex was tuned on) is train-only; a normalized string never appears in two splits (`tests/test_split.py`).
- No GPU and no torch at serving time. Training uses a GPU when there is one.

## Reproduce

```bash
# once: an ML venv (torch with CUDA for training; CPU works, slower)
uv venv ml/.venv --python 3.12
uv pip install --python ml/.venv/Scripts/python.exe torch --index-url https://download.pytorch.org/whl/cu128
uv pip install --python ml/.venv/Scripts/python.exe -r ml/requirements.txt
```

| step | command | needs an LLM? | output (committed?) |
|---|---|---|---|
| bases | edit `bases.py` (20 per intent × en / hinglish / hi) | – | yes |
| paraphrases | `python ml/paraphrase.py --gen gemini-3.8-flash,gemini-3.7-flash,qwen/qwen3.8-27b --hours 8` (a scheduler over free quotas; refuses gpt-oss unless `--allow-live`, which Rishi approved once for the last ~445 bases: `--gen openai/gpt-oss-20b --allow-live --reasoning low --prompt-v 4`) | yes (Gemini / Groq) | `data/paraphrases.jsonl` (yes) |
| pick a judge | `python ml/verify_paraphrases.py --pick --judge a,b --batch 140` (agreement with the hand-written labels) | yes | stdout |
| blind label check | `python ml/verify_paraphrases.py --only bases` (qwen) / `--judge gemini-3.1-flash-lite --batch 230 --only paraphrases` | yes | `data/paraphrase_checks.jsonl` (yes) |
| confident learning | `python ml/label_noise.py` (DistilBERT out-of-fold, grouped by base; `--model tfidf` is quicker) | – | `data/label_noise.jsonl` (yes), `reports/label_noise.json` |
| row-by-row review (guide: `review_brief.md`) | `python ml/review.py queue disagree\|test\|cl q.json` → decide → `apply q.json d.json` | – | `data/label_review.jsonl` (yes) |
| OOS negatives | `python ml/download_oos.py` | – | `data/external/` (no: CLINC150 / SNIPS) |
| dataset | `python ml/dataset.py` (warns about any val/test row without a review) | – | `data/build/` (no) |
| regex + TF-IDF | `python ml/train_classic.py` | – | `runs/`, `saved_models/tfidf/` (no) |
| transformers | `python ml/train_transformer.py --model distilbert-base-uncased --seed 1` (seeds 1–3; also `distilbert-base-multilingual-cased`, `google/muril-base-cased`, and `--layers 3 --tag distilbert-l3-s<seed>`) | – | `saved_models/`, `runs/` (no) |
| ONNX + INT8 | `python ml/export_onnx.py --ckpt distilbert-base-uncased-s<best>`; the 3-block candidate with `--run onnx-l3 --no-latest` | – | `saved_models/intent-onnx/<version>/` (no) |
| calibration | `python ml/calibrate.py` (candidate: `--run onnx-l3-int8 --bundle <version> --sweep-csv tau_sweep_l3.csv`; the 5 Oct bundle: `--tau-mode global --why "..."`, recorded in calibration.json) | – | `calibration.json` in the bundle, `reports/tau_sweep*.csv` |
| report | `python ml/evaluate.py` (includes the 6- vs 3-block table) | – | `reports/RESULTS.md`, `reports/metrics.json` (yes) |
| corpus regression | `backend/.venv/Scripts/python ml/corpus_regression.py` (what-if routing: `--tau 0.95`) | – | `reports/corpus_regression*.md` (yes) |
| serving cost | `backend/.venv/Scripts/python ml/bench_serving.py [--bundle DIR --name l3] [--cpu-cap 0.1]` (saturated + sparse under the cap, plus a CFS model) | – | `reports/serving_bench*.json` (yes) |
| install locally | `python ml/install_bundle.py` → `backend/models/intent/` (the backend's default path) | – | no |
| publish (deploy) | `python ml/publish_bundle.py --write-lock --lock <scratch>` previews; `--write-card <scratch>/card.md` previews the public card (it overwrites its target); `--push` (needs `HF_WRITE_TOKEN`) uploads to the HF repo and writes `backend/bundle.lock.json` — see `docs/TIER1C_DEPLOY.md` | – | `backend/bundle.lock.json` (yes, only once published) |
| real speech | `python ml/eval_real_speech.py [--test-speakers a,b]` over `data/real_speech_*.jsonl` | – | the Collect export (yes, text only) |
| WS probe | `backend/.venv/Scripts/python ml/probe_ws.py [--url wss://… --token …] [--audio]` | – | stdout |

A rerun from the committed files needs no LLM: paraphrases, judge labels and review decisions are all in `data/`.
Only the CLINC150/SNIPS negatives are downloaded again: the datasets themselves are not committed.

**Attribution.** The out-of-scope negatives are sampled from CLINC150 (Larson et al., 2019, *An Evaluation Dataset for
Intent Classification and Out-of-Scope Prediction*, `clinc/oos-eval`; CC BY 3.0 per the header of `download_oos.py`) and
SNIPS (Coucke et al., 2018, *Snips Voice Platform*, `sonos/nlu-benchmark`; CC0 per the same header). Those licences are
as recorded in `download_oos.py` and have not been re-checked against the sources. `data/label_review.jsonl` (115
rows) and `data/label_noise.jsonl` (315 rows) quote a few hundred of their short utterances (`kind: external`) so the
review decisions can be replayed on the rebuilt dataset; nothing else from them is in git.

Tests (no GPU, no LLM; the backend venv is enough): `cd backend && .venv/Scripts/python -m pytest -q ../ml/tests`.
`backend/tests/fixtures/tiny_intent_bundle/` (built by `make_test_bundle.py`) lets the backend's own tests run the
real onnxruntime + tokenizers path in CI without the ~65 MB model.
