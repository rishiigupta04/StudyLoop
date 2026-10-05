# Tier 1c smoke test — CLASSIFIER=onnx

The trained classifier behind the flag, checked by hand in the app. The numbers (synthetic test split, real-speech
evaluation, latency, memory) live in `ml/reports/` and `docs/TIER1C_MODEL.md`; this is the "does it feel right"
pass, spoken, in English, Hinglish and Hindi. Run it once with `CLASSIFIER=regex` too — that's the rollback.

## Setup

1. A bundle in `backend/models/intent/` (`ml/install_bundle.py`), or `INTENT_MODEL_DIR` pointing at one.
2. Backend with `CLASSIFIER=onnx` — locally the `backend-1c` preview config (port 8002, no auth, Postgres checkpointer).
3. `GET /health` → `"classifier": "onnx"` and `"classifier_model": "<version>"`. Anything starting with
   `"regex (onnx failed: …)"` means the bundle didn't load and the regex is serving: fix that first.
4. The WS `ready` message says `"classifier": "onnx"` (dev overlay / network tab).

## Spoken pass (hold `~`; watch the dev overlay's route + timings)

| # | say | expect | route |
|---|---|---|---|
| 1 | "go back 10 seconds" / "das second peeche jao" / "10 सेकंड पीछे जाओ" | −10 s | fast |
| 2 | "pause" / "ruko zara" / "वीडियो रोक दो" | pauses | fast |
| 3 | "keep going" / "chalao" / "चलाइए" | plays | fast |
| 4 | "go to 12:30" / "baarah tees pe jao" / "12:30 पर ले चलो" | 12:30 | fast |
| 5 | "twelve minutes ahead" / "12 minute aage karo" | +12 min, **not** 12:00 (§4 pair) | fast |
| 6 | "say that again" / "phir se sunao" / "फिर से सुनाइए" | −15 s and play | fast |
| 7 | "wait, what did he just say about the peak" | an answer about the peak, **not** a replay (§4 pair) | rag |
| 8 | "the professor's name was what again" | an answer, not a replay | rag |
| 9 | "I missed the bit where he defined a peak" | jumps to the definition (decided rule) | seek |
| 10 | "I missed that" | replays the last 15 s | fast |
| 11 | "take me to where he explains binary search" / "जहाँ उसने binary search समझाया वहाँ ले चलो" | seeks | seek |
| 12 | "too fast" / "bahut tez bol raha hai" / "dheere karo" | speed down | fast |
| 13 | "too loud" / "awaaz dheere karo" | volume down (§4: dheere = speed, awaaz dheere = volume) | fast |
| 14 | "note that merge sort is stable" / "नोट करो कि heap एक tree है" | note appears < 200 ms | notes |
| 15 | "is it important to note that the peak is local?" | an answer, not a note (§4 pair) | rag |
| 16 | "summarize so far" / "ab tak kya hua" / "अब तक का सारांश बताइए" | summary | rag |
| 17 | while an answer is being spoken: "stop" / "bas" | the voice stops (client), not the video (§4 pair) | fast |
| 18 | "what's the weather today" / "aaj mausam kaisa hai" | a polite "not about the lecture" answer, nothing moves | llm |
| 19 | "don't skip" / "skip mat karna" | nothing moves | llm |
| 20 | mumble something half-finished: "uh so the…" | nothing moves | llm |

For each row note the route and `classify_intent` ms from the overlay. A player command the model isn't sure about
goes to `llm_router` (route `llm`) — slower, but still does the right thing; a **wrong** fast-path action is the
failure to report. Compare with `CLASSIFIER=regex` on rows 5, 7, 8, 9, 13, 15 (the regex's known misfires).

## Where it could affect earlier tiers

- Tier 0 fast path: player intents now route on the model's calibrated τ (`calibration.json`), not
  `CONFIDENCE_THRESHOLD` (which still governs the regex). `ml/reports/corpus_regression.md` lists every one of the
  743 voice-corpus cases where ONNX and regex differ.
- Tier 1b: SEMANTIC_SEEK / ASK / SUMMARIZE / TAKE_NOTE routing changes only through the classifier; the nodes are
  unchanged.
- Memory: the INT8 model adds ~110 MB RSS (see `ml/reports/serving_bench.json`) — Render's free instance has ~512 MB.

## After the deploy (Render)

Run once after the first deploy of `CLASSIFIER=onnx` and after every new bundle (`docs/TIER1C_DEPLOY.md`). Base URL
`https://studyloop-api-58vj.onrender.com`; `<jwt>` is a signed-in user's Supabase access token (`REQUIRE_AUTH=true`
there). Fill the last column; a row that does not match its "expect" is a rollback candidate (row 6 is the drill).

| # | check | how | expect | result |
|---|---|---|---|---|
| 1 | the build fetched the bundle | Render, the deploy's build log | a line `intent bundle <version> ready: 5 files, 68.3 MB total, revision <12 hex>` whose version and revision prefix match `backend/bundle.lock.json` | |
| 2 | `/health` says onnx and which model | `curl <base>/health` | `"classifier": "onnx"` and `"classifier_model": "<the lock's version>"`; never `regex (onnx failed: ...)` (then the Render log line `ONNX classifier unavailable, using regex` names the cause) | |
| 3 | WS probe, text, English / Hinglish / Hindi | `backend/.venv/Scripts/python ml/probe_ws.py --url wss://studyloop-api-58vj.onrender.com --token <jwt>` | `ready: classifier='onnx'`; the 14 commands (5 English, 4 Hinglish, 5 Hindi) get the intents and routes of the local run (the table under "Live, `backend-1c`" in `TIER1C_MODEL.md`, raw: `ml/reports/probe_local_tau0.92.json`); no `error` rows | |
| 4 | latency, 5 rounds | the same with `--repeat 5 --out ml/reports/probe_render.json`, on a warm instance (hit `/health` first), worst of 2-3 runs | `fast path (server)` p95 < 150 ms (CO4); record fast-path p50/p95, `classify_intent` p95, n and date in `TIER1C_MODEL.md` (Serving cost, "Render, measured") | |
| 5 | speech path (optional, spends Sarvam credit) | the same with `--audio` | 14/14 transcribed and classified as in the local run | |
| 6 | rollback drill | Render, Environment: `CLASSIFIER=regex`, redeploy without rebuilding; then `/health` and `probe_ws.py` | `"classifier": "regex"` with `"classifier_model": null`, `ready` says regex, the build log shows no new fetch; set `onnx` again and repeat row 2 | |
| 7 | spoken pass on the live site | the "Spoken pass" table above, at least rows 5, 7, 8, 9, 13, 15, in English, Hinglish and Hindi | as there | |

### Where it could affect earlier tiers (the Render deploy)

- **Memory:** the model adds about 110 MB RSS (6 blocks; 86 MB for 3) to the app's ~95 MB on a 512 MB instance. Watch
  Render's memory graph and restarts for a day.
- **Build:** the image build now downloads about 70 MB (68.3 MB) from Hugging Face, once per new lock; a lock with
  `revision: null` or an unreachable revision fails the build, and Render keeps serving the previous deploy.
- **Startup:** the model loads in the lifespan, 0.35-0.6 s on the dev laptop (slower on 0.1 CPU, not measured), before
  the warm-up turn; if it cannot load, the regex serves and `/health` says why.
- **Tier 0 and Tier 1b routes are unchanged:** same graph, same WS protocol, same nodes. What changes is who
  classifies (the model, routed on the bundle's calibrated tau) and the CPU cost of a fast-path turn (about 10-14 ms
  server side on the laptop, against about 6 ms with the regex; on Render's 0.1 CPU that gap is the risk, row 4).
