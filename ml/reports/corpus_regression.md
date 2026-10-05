# Voice-corpus regression: CLASSIFIER=onnx vs regex

_`ml/corpus_regression.py`, bundle `intent-20261005-distilbert-s2`, routing τ 0.92 (the bundle's). A regression check, not accuracy: the corpus is in the training data and the regex was tuned on it._

- cases: 743; identical intent + action + route: **742**; disagreements: **1**
- matching the corpus's expected intent and action: regex 743/743, ONNX 742/743
- disagreements by kind: {'deferred to llm_router (below τ or OOS)': 1}
- classify_intent node time with ONNX (graph timings): p50 8.36 ms, p95 12.54 ms, max 21.22 ms

| # | utterance | group | expected | regex | ONNX (conf) | ONNX route | kind |
|---:|---|---|---|---|---|---|---|
| 1 | start again | en | PLAY {'type': 'PLAY'} | PLAY {'type': 'PLAY'} [fast] | PLAY (0.52) | llm | deferred to llm_router (below τ or OOS) |
