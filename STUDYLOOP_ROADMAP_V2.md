# StudyLoop — Roadmap v2 (architecture review + stage plan)

_Written 18 Sep 2026 after auditing the repo (`main` @ `06eb247`), the project instructions, and the Business Need doc. Supersedes `PHASE_EXECUTION_ROADMAP.md` in the repo and amends Sections 2, 3 and 5 of the project instructions where marked **[CHANGED]**._

---

## 0. Where things actually stand

| Area | Reality in the repo | Implication |
|---|---|---|
| Backend | `backend/` was reset (commit `58c9b5d`) — only a stray `venv/`. No FastAPI, no graph, no `graph.py`. | Tier 0 is **not** started on the backend. Greenfield — good time to fix the design. |
| Player | `VideoPane.tsx` is a plain `<iframe>` hard-coded to `dQw4w9WgXcQ`. No IFrame API hook, no `seekTo`. | Tier 0 player work is still ahead. |
| Voice | `useTildePTT.ts` simulates recognition (hard-coded question + timed fake steps). No `SpeechRecognition`, no WebSocket, no `speechSynthesis`. | PTT is UI-only. |
| Services | `copilotService.ts` POSTs to `/api/v1/copilot/query` with a keyword fallback; `transcriptService.ts` calls TranscriptAPI **directly from the browser**. | Contract must be replaced with the WS protocol below. |
| Secrets | Root/frontend `.env` hold `VITE_GROQ_API_KEY_*`, `VITE_HF_API_TOKEN`, `VITE_TRANSCRIPT_API_KEY`. `.env` is git-ignored ✅, but **any `VITE_` var is inlined into the Vercel bundle** and readable by anyone. | 🔴 Rotate those keys and move every paid/metered call server-side (Stage A). |
| Repo docs | `STUDYLOOP_ARCHITECTURE.md`, `PHASE_EXECUTION_ROADMAP.md`, `API_CONTRACTS.md`, `ENV_REFERENCE.md` still describe Whisper ASR, audio streaming, Redis, a 9-node DAG, HF-hosted Qwen, 6 GB VRAM. | Contradicts the settled design. Replace with this doc so coding agents (`.agents/`) stop building the old design. |
| UI scope | Frontend already shows Flashcard Quiz, gamification/XP, pricing — all out of scope and unbacked. | Hide behind a `DEMO_PREVIEW` flag or label "Preview" so the demo stays honest. |

---

## 1. Architecture decisions — what changes and why

Each item: the change, why, and the tradeoff. Anything not listed stays as in the project instructions.

**D1 — Secrets are server-only. [CHANGED, critical]**
All Groq/Gemini/HF/TranscriptAPI calls move to FastAPI. The frontend keeps only `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_API_URL`, `VITE_WS_URL`. Rotate the currently exposed keys.
_Tradeoff:_ none worth mentioning; the current setup leaks credit-metered keys.

**D2 — Embeddings run on every query, not only at ingestion. [CHANGED]**
Semantic seek and RAG both embed the *query* at request time, so "ingestion-only, CPU latency doesn't matter" is wrong. And BGE-M3 (568M params, ~2.2 GB fp32) won't fit in a free 512 MB Render instance next to the ONNX classifier.
→ Put the embedder behind an `Embedder` interface. **Primary: hosted BGE-M3** (HF Inference / another provider that serves `BAAI/bge-m3`), same 1024-d vectors, used for both ingestion and queries. **Fallback: `multilingual-e5-small` ONNX int8 on CPU (~120 MB, 384-d)** if the hosted option is unreliable. Store `embed_model` + `dim` per video so the two never get mixed.
_Tradeoff:_ adds a network hop (~150–400 ms) to seek/RAG, which are slow-path anyway. It's the only way to keep BGE-M3 without a paid host.

**D3 — The classifier routes to every branch; `llm_router` is only the fallback. [CHANGED graph]**
In the current graph a confident "what is gradient descent?" still goes through `llm_router`, which costs an extra LLM call. Confident "skip to the part about backprop" has nowhere to go: `action_executor` can't resolve a topic without retrieval.
→ High-confidence intents route directly: player intents → `parse_slots` → `action_executor`; `SEMANTIC_SEEK` → `seek_resolver` (embedding + pgvector, **no LLM**); `ASK`/`SUMMARIZE` → `rag_agent`; `TAKE_NOTE` → `notes_agent`. `llm_router` runs only for low confidence, OOS, or a slot parse failure, and it's **one tool-calling call** that either returns a player action, picks a route, or answers directly (this merges the old `llm_router` + `direct_answer`).
_Tradeoff:_ more edges out of `classify_intent`. The fast-path rule ("never touches `llm_router`") still holds, and it now applies to semantic seek too.

**D4 — A deterministic slot parser. [NEW]**
The classifier gives you "SEEK_BACK" but not "30 seconds". `parse_slots` is a rule-based extractor for durations, `mm:ss`/`h:mm:ss`, speeds, "thoda/a bit" defaults, and Hindi number words ("दस"/"das" → 10), working on normalized text. It takes under 1 ms. If a required slot is missing, it falls back to `llm_router`.
_Stretch (a stronger CO4 story):_ a joint intent + BIO slot-tagging head on the same DistilBERT.

**D5 — Generate in the target language directly; `translate_response` becomes `localize`. [CHANGED]**
A separate translation LLM call adds 0.3–1 s to every Hindi answer. Instead, the answering agent gets `language` in its system prompt and writes Devanagari itself (Llama-3.3-70B / Gemini Flash handle this well). `localize` stays as the last node, but it only renders **templated** strings (action confirmations, errors, "no transcript" messages) from a bilingual string table. It uses no LLM.
_Tradeoff:_ a small amount of prompt complexity per agent, in exchange for one fewer network hop per Hindi turn. Revert to the old design if Hindi quality is measurably worse in the manual pass.

**D6 — `normalize_input`: the training data must match what serving sees. [CLARIFIED]**
Keep the node. Put it in a shared package (`studyloop_nlp/normalize.py`) that **both** the training pipeline and the backend import. Generate the Devanagari versions of training utterances, then run them through *the same* normalizer so the classifier trains on exactly what it will see in production. Also normalize numerals and number words here. Without this, a lossy transliteration (e.g. ITRANS "chalāo" vs Hinglish "chalao") quietly lowers accuracy for Hindi users.

**D7 — Anti-spoiler uses a high-water mark, and seek is exempt. [CHANGED]**
- Q&A retrieval filter: `chunk.end_s <= session.max_watched_s`, not `segment_start <= current_time`. The old filter lets a chunk that *starts* before now but runs into the future leak content. It also wrongly blocks content the learner already watched and then rewound past.
- `SEMANTIC_SEEK` searches the **whole** video, because jumping ahead is exactly what the learner asked for. Write this down so nobody "fixes" it later.

**D8 — Streaming + ducking for smooth back-and-forth. [NEW]**
- WS streams LLM tokens (`answer.delta`). The client speaks sentence by sentence as sentences complete, so first audio arrives around 1 s instead of after the full answer.
- While PTT is held, the client calls `player.setVolume(15)` (or pauses for ASK), so the mic doesn't pick up the lecture audio. Volume is restored on release or after the answer.
- Barge-in stays as designed (`speechSynthesis.cancel()` on PTT press). It also sends `turn.cancel` so the server stops streaming the old turn.

**D9 — Auth via Supabase directly; backend only verifies. [CHANGED contract]**
Drop `/api/auth/login|register` from `API_CONTRACTS.md`. The client uses `supabase-js` Auth. FastAPI verifies the Supabase JWT on REST calls and on the WS `hello` message. There's no password handling in our code.

**D10 — Ingestion is async and status-driven. [CHANGED]**
`POST /api/videos` returns `202` plus the status. A background task fetches the transcript, chunks it, embeds it, and stores it. The client listens for a `video.status` WS event (or polls). Playback-only mode is available immediately. The `processed` flag becomes a status enum on a `videos` table (see §4).

**D10b — TranscriptAPI works even when captions are disabled. [CHANGED, 18 Sep 2026]**
TranscriptAPI can return a transcript for videos whose uploader disabled captions, so "no transcript" is no longer a normal case. It becomes a **failure** state.
- **Don't gate on `/youtube/info`.** Its caption-track list will look empty for these videos. Go straight to `/youtube/transcript` with the priority list, and use `/info` only for metadata. (This overrides the "call `/info` first" advice in the repo's `TRANSCRIPT_API_REFERENCE.md`.)
- **Store where the transcript came from:** `videos.transcript_source enum(creator|youtube_asr|api_generated)` plus `transcript_lang`. Generated transcripts can be slower to return and noisier, so:
  - make ingestion fully async
  - show "Transcribing…" in the status chip
  - run the chunker on segment timing, not on sentence punctuation
- **"No transcript" now means the fetch actually failed**: a private, members-only, age-restricted, live or removed video, a video with no speech, TranscriptAPI errors or timeouts, or credits running out. The graceful-degradation constraint still holds for all of these: playback-only mode plus a localized message that says *which* reason applies, and a "Retry" action for transient errors.
- **Verify in Stage A** with one known captions-disabled lecture: confirm latency, the credit cost per call (it may differ from 1 credit), and the `language` code returned. Record the results in `TRANSCRIPT_API_REFERENCE.md`.

**D11 — Hosting: plan for cold starts and 512 MB. [NEW]**
Render's free tier spins down after ~15 min idle (cold start ~30–60 s) and has ~512 MB RAM. Mitigations:
1. The prod image contains **no torch**: `onnxruntime` + `tokenizers` only, with the INT8-quantized classifier (~65 MB).
2. `GET /health` warm-up ping fires when the landing page loads, plus an uptime pinger during demo week.
3. Deploy the skeleton in Stage A so hosting surprises show up early, not on demo day.
Supabase free projects pause after about a week of inactivity, so ping them or open them before the demo.

**D12 — One protocol, one schema, from day one.**
Build the LangGraph skeleton in **Tier 0** with `classify_intent` = the regex stub, not in Tier 1b. The WS message protocol is then final from the start, and every later tier fills in a node without touching the client contract. This follows the project rule "never break a working feature".

**D14 — Hosted bilingual speech: Sarvam Saaras STT + Bulbul TTS. [NEW, 19 Sep 2026]**
The browser's SpeechRecognition mishears Hinglish commands ("tees second aage jao", "pandrah minute aage jao"): it has to guess one language up front and has no model of code-mixed speech. The text layer already handles these phrases once they are transcribed well.
- **STT:** while ~ is held, the client records Opus/WebM (`lib/audioCapture.ts`) and sends it to `POST /api/stt`. There, **Sarvam Saaras v3** (`mode=codemix`, language auto-detected) returns English words in Latin script, Hindi in Devanagari, and numbers as digits, which is exactly what `normalize()` expects. **Groq Whisper large-v3** is the fallback, with a Hinglish style prompt and an Urdu-script retry pinned to Hindi. If neither answers (or neither is configured), the browser's own transcript is used. The browser recognizer still runs for live captions.
- **TTS:** answers are spoken sentence by sentence through `POST /api/tts` → **Sarvam Bulbul v3** HTTP stream (MP3; Indian voices that read Hindi, English and Hinglish), with the browser voice as the fallback.
- **Why not Whisper-Hindi2Hinglish or IndicConformer:** they need a GPU / torch (D11 forbids it on Render) and have no reliable free hosted endpoint. BGE-M3 stays the retrieval embedder (it is already cross-lingual).
- _Tradeoffs:_ audio now leaves the browser, going to Sarvam (India) or Groq. The hosted transcript adds ~250–600 ms after the key is released (the fast path's server budget is unchanged). Costs: STT is ₹30/hour of audio (≈₹0.03 per command); TTS is ₹30 per 10K characters (≈₹1 per answer).

**D13 — CO4 says "build, evaluate, deploy, **monitor**". [NEW tier]**
Nothing in the current plan covers monitoring. It's added as Tier 1f (§5): prediction logging, a model-health page, and a retraining loop.

**Unchanged:** React + IFrame API, FastAPI + LangGraph, browser `SpeechRecognition` (text over WS), DistilBERT → ONNX CPU as the load-bearing model, Groq primary / Gemini fallback, Supabase Postgres + pgvector, no Redis, TranscriptAPI only, browser `SpeechSynthesis` (with a hosted-TTS upgrade path), checkpointer memory keyed by viewing session.

---

## 2. Revised LangGraph (authoritative)

```
START → normalize_input → classify_intent ─┬─ player intent, conf≥τ ──→ parse_slots ─(ok)→ action_executor → END
                                           │                                  └─(missing slot)─┐
                                           ├─ SEMANTIC_SEEK, conf≥τ ─→ seek_resolver ─→ action_executor → END
                                           ├─ ASK / SUMMARIZE, conf≥τ ─→ rag_agent ───────┐
                                           ├─ TAKE_NOTE, conf≥τ ─────→ notes_agent ───────┤
                                           └─ conf<τ or OOS ─────────→ llm_router ◄───────┼──(missing slot)
                                                                         ├→ action_executor → END
                                                                         ├→ rag_agent / notes_agent
                                                                         └→ (direct answer) ─────┤
                                                                                                  ↓
                                                                                   localize → respond → END
```

**State additions** to the existing TypedDict: `slots: dict`, `max_watched_s: float`, `timings: dict[str, float]` (per-node ms, returned to the client and logged), `turn_id: str`, `error: str | None`.

**Latency budgets (server-side, measured by `timings`)**

| Path | Budget | Expected |
|---|---|---|
| Fast (player) | < 150 ms | ~20–40 ms (normalize ≈1, ONNX int8 ≈10–25, slots ≈1) |
| Semantic seek | < 800 ms | embed query + pgvector top-k |
| RAG / LLM | first token < 1.5 s | Groq streaming |
| Note | ack < 200 ms | summary written async, pushed as `note.updated` |

### WebSocket protocol (`/ws/session`)

Client → server: `hello {token, video_id, session_id, language}` · `utterance {turn_id, text, is_final, playback_s, max_watched_s}` · `turn.cancel {turn_id}` · `playback {playback_s, max_watched_s}` (heartbeat every 5 s).
Server → client: `action {turn_id, type, args, timings}` · `answer.delta {turn_id, text}` · `answer.done {turn_id, text, citations[{start_s}], timings, route}` · `note.created|note.updated` · `video.status {status, has_transcript}` · `error {turn_id, code, message_localized}`.

---

## 3. Intent taxonomy v1 (freeze before collecting data)

| Intent | Example (EN / Hinglish) | Path | Slots |
|---|---|---|---|
| PLAY | "play" / "chalao" | fast | — |
| PAUSE | "pause" / "ruko" | fast | — |
| SEEK_BACK | "go back 10 seconds" / "thoda peeche jao" | fast | duration (default 10 s) |
| SEEK_FORWARD | "skip 30 seconds" / "aage badhao" | fast | duration (default 10 s) |
| SEEK_ABSOLUTE | "go to 12:30" / "12:30 pe jao" | fast | timestamp |
| REPLAY | "say that again" / "phir se dikhao" | fast | (back 15 s) |
| SPEED | "play faster" / "speed 1.5 karo" | fast | rate / up / down |
| VOLUME | "mute" / "awaaz badhao" | fast | mute / unmute / up / down |
| SEMANTIC_SEEK | "skip to the part about backprop" | seek_resolver | topic (utterance minus trigger words) |
| ASK | "why do we square the error?" | rag_agent | — |
| SUMMARIZE | "summarize so far" / "ab tak kya hua" | rag_agent | — |
| TAKE_NOTE | "note this down" / "ye note kar lo" | notes_agent | optional note text |
| STOP_SPEAKING | "stop" / "bas" | client + fast | — |
| OOS | anything else | llm_router | — |

(Merge or split classes only before training data is collected; once data exists, changing the taxonomy means relabelling.)

---

## 4. Data model v2 (Supabase migrations in `backend/migrations/`)

- `videos` — `video_id PK, title, channel, duration_s, transcript_lang, transcript_source enum(creator|youtube_asr|api_generated), has_transcript bool, ingest_status enum(pending|fetching|transcribing|embedding|ready|unavailable|failed), fail_reason text, embed_model, embed_dim, chapters jsonb, summary text, created_at`. This replaces the "processed flag".
- `transcript_chunks` — `id, video_id FK, idx, start_s, end_s, text, embedding vector(1024)` plus an HNSW index. Replaces `transcript_embeddings`; `end_s` is needed for D7.
- `study_sessions` — `session_id PK (= LangGraph thread_id), user_id, video_id, language, max_watched_s, started_at, last_seen_at`.
- `notes` — `id, user_id, video_id, session_id, at_s float, raw_text, summary, is_auto, is_bookmarked, created_at`. Timestamps are floats, not TEXT; format them on the client.
- `interaction_logs` — `turn_id, session_id, raw_text, normalized_text, language, intent, confidence, route, slots jsonb, timings jsonb, model_version, user_correction bool, created_at`. Feeds monitoring (Tier 1f).
- Keep `profiles` and `user_video_history` (add `last_position_s float`). Drop `saved_chats`: chat history comes from the checkpointer plus `interaction_logs`.
- Checkpointer tables are created by `langgraph-checkpoint-postgres` (`AsyncPostgresSaver.setup()`).
- RLS as in the current `DATABASE_SCHEMA.md`. `videos`/`transcript_chunks` are world-readable and service-role-writable (they're a shared cache).

---

## 5. Stage plan

Four people means four parallel tracks. The **ML track starts now**: it depends on nothing but the frozen taxonomy and `normalize.py`, and it's the long pole for CO4.

| Track | Owner (suggested) | Tiers |
|---|---|---|
| A. Frontend/voice | 1 | 0 (client), 1d (client), 1e UI, 2 UI |
| B. Backend/graph | 1 | Stage A, 0 (server), 1b, 1e |
| C. Data/ingestion | 1 | 1a, chapters/summary, exports |
| D. ML/classifier | 1 | 1c, 1f; starts data collection in week 1 |

### Stage A — Foundation (S, do first, ~2–3 days)
- Rotate exposed keys; strip `VITE_` secrets; update `ENV_REFERENCE.md`.
- Backend scaffold: `backend/app/{main.py, config.py (pydantic-settings), ws.py, api/, orchestration/graph.py, nodes/, services/{llm,embedder,transcripts,db}.py}`, `/health`, CORS, Supabase JWT verification.
- `packages/studyloop_nlp/` (normalize + slot parser) shared by the backend and `ml/`.
- Run the v2 schema migrations on Supabase.
- Deploy the skeleton to Render and wire Vercel → `VITE_API_URL`. CI: `tsc --noEmit`, `vite build`, `pytest`, `ruff`.
- Replace the stale repo docs with this file; mark the old ones as superseded.
- **Done when:** deployed `/health` is green, the frontend bundle contains no secret keys (`grep` the `dist/` output), and CI passes.

### Tier 0 — Push-to-talk playback control (M)
- Client: `useYouTubePlayer` (IFrame API, `videoId` from the URL/library, 500 ms time sync, tracks `max_watched_s`); `executePlayerAction()` dispatcher; `useSpeechRecognition` (`en-IN`/`hi-IN`, interim results shown live, final result sent); `useStudySocket` (reconnect with backoff, `hello`, heartbeat); replace the fake `useTildePTT` internals while keeping its UI; ducking on PTT.
- Server: the full graph shape from §2 with stubs. `classify_intent` = regex/keyword stub behind the flag `CLASSIFIER=regex|onnx`; `parse_slots` v1 live; `action_executor` live; the other nodes return a "coming soon" template via `localize`.
- `timings` shown in a dev overlay.
- **Done when:** in Chrome, EN voice commands for play/pause/seek back/forward/absolute/speed/volume work on a real video, fast-path server time is under 150 ms, and a 5-minute session has no crashes. Tested on Chrome and Edge (Web Speech API isn't available in Firefox; say so in the UI).
- **Status (18 Sep 2026): code complete, awaiting the in-browser smoke pass (`docs/TIER0_SMOKE_TEST.md`).**
  - Backend: `app/orchestration/` (full §2 graph with the regex classifier and honest stubs), `app/ws.py` (`/ws/session`), a warm-up on startup, and `REQUIRE_AUTH=false` until Supabase login lands.
  - Frontend: `useYouTubePlayer`, `useSpeechRecognition`, `useStudySocket`, `lib/playerActions.ts` and `lib/tts.ts`; `useTildePTT` is now real; EN/हिं toggle.
  - Checks: 113 pytest tests pass. The regex classifier gets all 44 EN/Hinglish/Devanagari cases right. The fast path measured 5–13 ms server-side and 6–15 ms round trip locally. `tsc` and `vite build` pass, and no secrets are in the bundle.
  - Not done yet: Supabase Auth sign-in (Tier 0b); the chapters and summary panel still show demo data (Tier 2).

### Tier 1a — Transcript ingestion (M)
- TranscriptAPI client (server-side, `en → hi → asr-hi` priority, **no `/info` pre-gate**; captions-disabled videos are expected to succeed, per D10b), `videos.ingest_status` state machine with a `transcribing` state, background task, `video.status` WS event, and a timeout plus one retry for generated transcripts.
- Chunker: ~45–60 s windows on segment boundaries with ~10 s overlap, keeping `start_s`/`end_s`.
- `Embedder` interface (hosted BGE-M3 primary, e5-small ONNX fallback); batch insert into `transcript_chunks`.
- Failure path (now rare): `has_transcript=false` + `fail_reason`, playback-only banner, and transcript-dependent intents answer with a localized message that names the reason. Transient errors (timeout, 5xx, rate limit) get a Retry button; permanent ones (private, live, no speech) don't.
- **Done when:** a new video ingests once, a second request is a cache hit (no TranscriptAPI credit used, verified in logs), a **captions-disabled** video ingests successfully, and a failing video (e.g. private or live) still plays with voice control and shows the correct reason.

### Tier 1b — Semantic seek + Q&A, English (M)
- `seek_resolver` (top-k over the whole video; jump to the best chunk's `start_s`, plus a "did you mean" alternative when the top-2 scores are close).
- `rag_agent` (hybrid retrieval: pgvector cosine + Postgres full-text `ts_rank`, merged; filtered by `end_s <= max_watched_s`; answers cite `[mm:ss]` chips that seek on click).
- `llm_router` (a single Groq tool-calling call; Gemini fallback; retry with backoff on 429).
- Streaming `answer.delta` + sentence-level TTS on the client.
- Checkpointer: `MemorySaver` in dev, `AsyncPostgresSaver` in prod; `thread_id = session_id`.
- **Done when:** "skip to the part about X" and in-flow questions work in EN; the spoiler test passes (a question about 15:00 content while watching at 12:00 gets "not covered yet"); Tier 0 commands still work.

### Tier 1c — Fine-tuned intent classifier (L; data work starts in week 1)
- Data: 20 hand-written base utterances × 14 intents × {EN, Hinglish-Latin, Hindi-Devanagari → `normalize()`}, LLM paraphrases (~300–500 per intent after dedup), CLINC150/SNIPS negatives for OOS. Split by **base utterance**, not by row, so paraphrases of one base never land in both train and test.
- **Real-speech test set (most important):** each teammate plus a few friends speaks ~30 utterances per intent through the app's own `SpeechRecognition` → `normalize` pipeline. Report synthetic-test and real-test numbers separately; the real-test number is the one you quote.
- Models, trained and compared as the CO4 table: regex baseline → TF-IDF + LogReg → DistilBERT → (optional) `distilbert-base-multilingual-cased` or MuRIL.
- Export: ONNX → dynamic INT8 quantization; check accuracy drop is ≤0.5 pt.
- Calibration: temperature scaling on the validation set, then pick τ from a threshold sweep (fast-path coverage vs misfire rate) on the confusion matrix. Consider per-intent τ.
- Wire in via `CLASSIFIER=onnx`, keeping `regex` as the rollback.
- **Done when:** ≥90 % accuracy on the real-speech test set, macro-F1 reported, p95 fast-path under 150 ms on the Render instance, and no regression in Tier 0/1b in either EN or HI.

### Tier 1d — Bilingual voice I/O (M)
- `hi-IN` recognition → `normalize_input` (already live from Stage A; now tested hard); language toggle → `language` in state.
- Agents answer in Devanagari directly (D5); `localize` string table covers every template.
- TTS: wait for `voiceschanged`, pick an `hi-IN` voice, and show a fallback notice (plus optional hosted Indian-language TTS) if none is available. Barge-in and `turn.cancel` wired.
- **Done when:** the Tier 0–1c smoke checklist passes in Hindi and Hinglish, run by a Hindi speaker.

### Tier 1e — Voice notes (S–M)
- `TAKE_NOTE` → immediate ack plus an optimistic note at `playback_s` → async LLM summary (context = the last ~60 s of transcript plus what was said) → `note.updated`.
- Export: Markdown (client), PDF (server, `weasyprint` or client `print` CSS). Notion is a stretch. Drop Google Docs from the MVP, since its OAuth setup costs more time than it's worth.
- **Done when:** a note appears in under 200 ms, gains its summary within a few seconds, and exports cleanly to MD and PDF.

### Tier 1f — Model monitoring (S–M) — **new, needed for CO4 "monitor"**
- Log every turn to `interaction_logs` (this is already produced by the `timings` + state).
- Implicit correction signal: an utterance followed within 5 s by an undo-ish command ("no", "wapas", a manual seek) → `user_correction=true`.
- A `/insights/model` page: intent distribution, fast-path coverage %, low-confidence rate, p50/p95 per path, correction rate, and confidence histogram drift by week and by language.
- Retraining loop: export low-confidence and corrected utterances, relabel, retrain, compare against the frozen real-speech test set, bump `model_version`.
- **Done when:** the page shows live numbers from real sessions and one retrain cycle is documented with before/after metrics.

### Tier 2 — Retention layer (M)
- Personal Library backed by `videos` + `user_video_history` (status chips: transcript ready / indexed / N notes; resume at `last_position_s`).
- Chapters + summary: one LLM call at ingestion over chunk summaries (map → reduce for long videos), stored on `videos`, rendered as progress-bar markers (the UI already exists).
- Unified Notes Workspace: cross-video search (full-text plus embeddings over notes).
- One-click export as a first-class action.
- Replace the dummy data in the Dashboard, Library, Notes and ChatHistory pages; hide Quiz and gamification until Tier 3.

### Tier 3 — Next candidates (only after 0–2 are solid; ranked by value ÷ cost)
1. **Auto-quizzes per chapter:** cheap once chapters exist, and backed directly by the in-video questioning research (Wong et al., 2024) cited in the Business Need doc. Would reactivate the existing Quiz UI.
2. **Joint intent + slot model** (replaces the rule-based `parse_slots`): a stronger ML story.
3. **In-browser classifier** (`onnxruntime-web`): zero network on the fast path and immune to cold starts. The ~65 MB download is cached after first load.
4. Playlist/Course Mode, cross-video memory, vision "what's on screen", wake word, adaptive pacing, creator analytics: still deferred, as in the project instructions.

---

## 6. Risks & demo-day checklist

| Risk | Mitigation |
|---|---|
| Render cold start mid-demo | Warm-up ping on page load plus a pinger during demo week; check `/health` 5 minutes before. |
| Groq 429 during the live demo | Backoff, then Gemini fallback, then a canned "busy" template. Pre-ingest the demo videos. |
| Hindi voice missing on the demo laptop | Check `speechSynthesis.getVoices()` on the demo machine a day before; hosted TTS fallback. |
| Classifier looks great on synthetic data, bad on speech | Real-speech test set is the headline metric (Tier 1c). |
| Supabase project paused | Open the dashboard or run a query the day before. |
| Generated transcript (captions disabled) is slow or noisy | Async ingest, "Transcribing…" status, pre-ingest demo videos; retrieval uses timing-based chunks plus hybrid FTS to tolerate ASR noise. |
| TranscriptAPI credits exhausted | Pre-ingest demo videos; `videos` cache; never fetch from the client. |
| Scope creep into Tier 3 while the UI already shows it | `DEMO_PREVIEW` flag hides unbacked features. |

---

## 7. Repo doc hygiene
- Commit this file as `STUDYLOOP_ROADMAP_V2.md`. Add a "Superseded by ROADMAP_V2" banner to `PHASE_EXECUTION_ROADMAP.md` and `STUDYLOOP_ARCHITECTURE.md`.
- Rewrite `API_CONTRACTS.md` around the WS protocol (§2), plus REST: `POST /api/videos`, `GET /api/videos/{id}`, `GET /api/videos/{id}/transcript`, `GET/POST/PATCH /api/notes`, `GET /api/notes/export?fmt=md|pdf`, `GET /api/insights/model`.
- Rewrite `ENV_REFERENCE.md` per D1: backend holds `GROQ_API_KEY`, `GEMINI_API_KEY`, `HF_TOKEN`, `TRANSCRIPT_API_KEY`, `DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_JWT_SECRET`, `CLASSIFIER`, `CONFIDENCE_THRESHOLD`.
- Update the Project custom instructions (Sections 2, 3, 5) to point here.
