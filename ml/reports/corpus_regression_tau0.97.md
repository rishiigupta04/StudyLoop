# Voice-corpus regression: CLASSIFIER=onnx vs regex

_`ml/corpus_regression.py`, bundle `intent-20261005-distilbert-s2`, routing τ 0.97 (**what-if**, not the bundle's calibrated τ). A regression check, not accuracy: the corpus is in the training data and the regex was tuned on it._

- cases: 743; identical intent + action + route: **725**; disagreements: **18**
- matching the corpus's expected intent and action: regex 743/743, ONNX 732/743
- disagreements by kind: {'deferred to llm_router (below τ or OOS)': 18}
- classify_intent node time with ONNX (graph timings): p50 4.84 ms, p95 11.81 ms, max 18.35 ms

| # | utterance | group | expected | regex | ONNX (conf) | ONNX route | kind |
|---:|---|---|---|---|---|---|---|
| 1 | I'm back | en | PLAY {'type': 'PLAY'} | PLAY {'type': 'PLAY'} [fast] | PLAY (0.95) | llm | deferred to llm_router (below τ or OOS) |
| 2 | start again | en | PLAY {'type': 'PLAY'} | PLAY {'type': 'PLAY'} [fast] | PLAY (0.52) | llm | deferred to llm_router (below τ or OOS) |
| 3 | don't stop | en | PLAY {'type': 'PLAY'} | PLAY {'type': 'PLAY'} [fast] | PLAY (0.97) | llm | deferred to llm_router (below τ or OOS) |
| 4 | what was that | en | REPLAY {'type': 'SEEK_RELATIVE', 'delta_s': -15.0, 'then': 'PLAY'} | REPLAY {'type': 'SEEK_RELATIVE', 'delta_s': -15.0, 'then': 'PLAY'} [fast] | REPLAY (0.96) | llm | deferred to llm_router (below τ or OOS) |
| 5 | sorry what | en | REPLAY {'type': 'SEEK_RELATIVE', 'delta_s': -15.0, 'then': 'PLAY'} | REPLAY {'type': 'SEEK_RELATIVE', 'delta_s': -15.0, 'then': 'PLAY'} [fast] | REPLAY (0.97) | llm | deferred to llm_router (below τ or OOS) |
| 6 | rewind and play | en | REPLAY {'type': 'SEEK_RELATIVE', 'delta_s': -15.0, 'then': 'PLAY'} | REPLAY {'type': 'SEEK_RELATIVE', 'delta_s': -15.0, 'then': 'PLAY'} [fast] | REPLAY (0.93) | llm | deferred to llm_router (below τ or OOS) |
| 7 | quiet | en | STOP_SPEAKING {'type': 'STOP_SPEAKING'} | STOP_SPEAKING {'type': 'STOP_SPEAKING'} [fast] | STOP_SPEAKING (0.97) | llm | deferred to llm_router (below τ or OOS) |
| 8 | shut up | en | STOP_SPEAKING {'type': 'STOP_SPEAKING'} | STOP_SPEAKING {'type': 'STOP_SPEAKING'} [fast] | STOP_SPEAKING (0.96) | llm | deferred to llm_router (below τ or OOS) |
| 9 | zara chalao | hinglish | PLAY {'type': 'PLAY'} | PLAY {'type': 'PLAY'} [fast] | PLAY (0.97) | llm | deferred to llm_router (below τ or OOS) |
| 10 | I don't understand | slow_path | ASK | ASK [rag] | ASK (0.96) | llm | deferred to llm_router (below τ or OOS) |
| 11 | I didn't get that | slow_path | ASK | ASK [rag] | ASK (0.96) | llm | deferred to llm_router (below τ or OOS) |
| 12 | give me an example | slow_path | ASK | ASK [rag] | ASK (0.97) | llm | deferred to llm_router (below τ or OOS) |
| 13 | explain karo | slow_path | ASK | ASK [rag] | ASK (0.94) | llm | deferred to llm_router (below τ or OOS) |
| 14 | save this | slow_path | TAKE_NOTE | TAKE_NOTE [notes] | TAKE_NOTE (0.95) | llm | deferred to llm_router (below τ or OOS) |
| 15 | what is the volume of a sphere | precision | ASK | ASK [rag] | ASK (0.96) | llm | deferred to llm_router (below τ or OOS) |
| 16 | don't pause | precision | PLAY {'type': 'PLAY'} | PLAY {'type': 'PLAY'} [fast] | PLAY (0.95) | llm | deferred to llm_router (below τ or OOS) |
| 17 | no need | heldout | STOP_SPEAKING {'type': 'STOP_SPEAKING'} | STOP_SPEAKING {'type': 'STOP_SPEAKING'} [fast] | STOP_SPEAKING (0.97) | llm | deferred to llm_router (below τ or OOS) |
| 18 | shuru mein kya bataya tha | heldout | ASK | ASK [rag] | ASK (0.94) | llm | deferred to llm_router (below τ or OOS) |
