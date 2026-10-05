# Voice-corpus regression: CLASSIFIER=onnx vs regex

_`ml/corpus_regression.py`, bundle `intent-20261005-distilbert-s2`, routing τ 0.95 (**what-if**, not the bundle's calibrated τ). A regression check, not accuracy: the corpus is in the training data and the regex was tuned on it._

- cases: 743; identical intent + action + route: **737**; disagreements: **6**
- matching the corpus's expected intent and action: regex 743/743, ONNX 739/743
- disagreements by kind: {'deferred to llm_router (below τ or OOS)': 6}
- classify_intent node time with ONNX (graph timings): p50 5.19 ms, p95 12.35 ms, max 24.13 ms

| # | utterance | group | expected | regex | ONNX (conf) | ONNX route | kind |
|---:|---|---|---|---|---|---|---|
| 1 | I'm back | en | PLAY {'type': 'PLAY'} | PLAY {'type': 'PLAY'} [fast] | PLAY (0.95) | llm | deferred to llm_router (below τ or OOS) |
| 2 | start again | en | PLAY {'type': 'PLAY'} | PLAY {'type': 'PLAY'} [fast] | PLAY (0.52) | llm | deferred to llm_router (below τ or OOS) |
| 3 | rewind and play | en | REPLAY {'type': 'SEEK_RELATIVE', 'delta_s': -15.0, 'then': 'PLAY'} | REPLAY {'type': 'SEEK_RELATIVE', 'delta_s': -15.0, 'then': 'PLAY'} [fast] | REPLAY (0.93) | llm | deferred to llm_router (below τ or OOS) |
| 4 | explain karo | slow_path | ASK | ASK [rag] | ASK (0.94) | llm | deferred to llm_router (below τ or OOS) |
| 5 | don't pause | precision | PLAY {'type': 'PLAY'} | PLAY {'type': 'PLAY'} [fast] | PLAY (0.95) | llm | deferred to llm_router (below τ or OOS) |
| 6 | shuru mein kya bataya tha | heldout | ASK | ASK [rag] | ASK (0.94) | llm | deferred to llm_router (below τ or OOS) |
