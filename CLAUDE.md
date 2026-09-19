# StudyLoop — context for Claude Code

Bilingual (EN/Hindi/Hinglish) voice-native study copilot for long YouTube lectures. Hold `~`, talk to the video: it plays/pauses/seeks, answers questions grounded in the transcript (no spoilers), and takes timestamped notes. MSc Data Science "Modern Application Development" course, Group 11. Prototype: https://studylooop.vercel.app

**Source of truth for design and plan: `STUDYLOOP_ROADMAP_V2.md`.** `PHASE_EXECUTION_ROADMAP.md`, `STUDYLOOP_ARCHITECTURE.md`, `DATABASE_SCHEMA.md` are superseded (Whisper / Redis / 9-node DAG / 6 GB VRAM) — do not build from them.

## Non-negotiables
- CO4: the intent classifier must be a genuinely trained + evaluated model (DistilBERT → ONNX, CPU). ≥90% accuracy on the *real-speech* test set, fast path <150 ms server-side.
- No GPU anywhere at deploy time (Render free tier: CPU, ~512 MB RAM — no torch in the prod image).
- Fast path (player intents) never touches the LLM router or any agent.
- `normalize_input` (`backend/studyloop_nlp`) always runs before the classifier; training data must go through the same `normalize()`.
- `language` is one field from the UI toggle; LLM agents answer directly in that language; `localize` only renders templates.
- RAG answers only from already-watched content (`chunk.end_s <= max_watched_s`); semantic seek searches the whole video.
- No transcript ⇒ degrade gracefully with a stated reason (`fail_reason`), playback voice control keeps working. TranscriptAPI works even for captions-disabled videos, so "no transcript" is a failure state.
- Secrets only in `backend/.env` / Render. Anything `VITE_`-prefixed is public. Never commit `.env`.

## Working rules
- Tier-first: finish and verify the current tier before starting the next. Out of scope until Tiers 0–2 are solid: playlist mode, vision, cross-video memory, auto-quizzes, wake word, creator analytics.
- Read the current code before changing it; smallest surface area; never break a working tier. Graph shape (`backend/app/orchestration/graph.py`) and the WS protocol (`backend/app/ws.py` docstring) are fixed — fill node bodies, don't restructure.
- Every increment: tests pass, a manual smoke checklist (including a Hindi pass for bilingual work), and a note of what changed / what was tested / what earlier tier could be affected.
- Rishi's style: be direct, propose briefly, then build; don't over-ask when a sensible default exists.

## Layout
- `backend/` FastAPI + LangGraph. `app/config.py` settings, `app/auth.py` Supabase JWT (HS256 + JWKS; `REQUIRE_AUTH=false` until login is wired), `app/api/` REST, `app/ws.py` `/ws/session`, `app/orchestration/` (graph, `regex_classifier.py` Tier-0 stand-in + future CO4 baseline, `localize.py`, `intents.py` — 14-intent taxonomy, frozen), `app/services/transcripts.py` TranscriptAPI client, `app/services/ingest.py` ingestion pipeline + status pub/sub (`video_repo.py` PostgREST/in-memory storage + claim rules, `chunker.py`, `embedder.py`), `retrieval.py` hybrid retrieval (cosine + BM25, RRF, per-video cache), `llm.py` Groq→Gemini streaming + tool calls, `orchestration/checkpointer.py` write-behind Postgres memory, `studyloop_nlp/` normalize + slot parser (shared with `ml/`), `migrations/001_init.sql` schema v2 (already run on Supabase), `tests/`.
- `frontend/` React 19 + Vite + TS + Tailwind. Voice pipeline: `hooks/useYouTubePlayer.ts`, `useSpeechRecognition.ts`, `useStudySocket.ts`, `useTildePTT.ts`; `lib/playerActions.ts` (action contract), `lib/tts.ts`, `services/apiClient.ts`, `services/transcriptService.ts`. Most other pages (dashboard, library, notes, chat history, quiz, gamification) are still hardcoded dummy data.
- `docs/TIER0_SMOKE_TEST.md`, `TIER0B_AUTH_SMOKE_TEST.md`, `TIER1A_SMOKE_TEST.md`, `TIER1B_SMOKE_TEST.md` manual checklists. `render.yaml` backend deploy, `vercel.json` frontend, `.github/workflows/ci.yml` CI.

## Commands
```bash
# backend — Python 3.12 to match CI + Dockerfile (the machine default `python` may be newer)
cd backend && uv venv --python 3.12 .venv && .venv\Scripts\activate   # (Linux/mac: . .venv/bin/activate)
pip install -r requirements-dev.txt
pytest -q && ruff check . && ruff format --check .
uvicorn app.main:app --reload --port 8000
# frontend
cd frontend && npm install && npm run dev        # http://localhost:4028/video-study-page?v=<id>
npm run type-check && npm run build
```
`npm run lint` is broken (pre-existing: ESLint 9 needs `eslint.config.js`). Repo files use CRLF; `git diff --ignore-cr-at-eol` to see real changes.

## Status (18 Sep 2026)
- Stage A (foundation) — done: backend scaffold, schema v2, secrets moved server-side, CI, deploy config.
- Tier 0 (push-to-talk playback) — code done, 887 tests pass, fast path p95 ~6 ms server-side; **awaiting the spoken smoke pass** (`docs/TIER0_SMOKE_TEST.md`). Server half + non-mic checks verified 18–19 Sep.
- Voice coverage (19 Sep): `tests/voice_corpus.py` = 743 bilingual scenarios (also the Tier 1c seed set; read its labeling rules). Regex classifier scored 91% on a fresh held-out round before fixes — the real-speech set is still the metric that counts. New actions in the client contract: `SEEK_FRACTION`, `SEEK_PREVIOUS` (undo), `VOLUME_SET`, `then: PLAY|PAUSE` on seeks. Dev hook: `window.__studyloopSay(text)` (dev builds only) drives a full turn without a mic.
- Open items owned by Rishi: rotate leaked keys; Render service + `VITE_API_URL` on Vercel; delete stale local `frontend/dist` (contains old leaked keys).

- Tier 0b (Supabase Auth) — code done 19 Sep: `lib/supabase.ts`, `context/AuthContext.tsx`, `RequireAuth` on app routes, real `LoginPage` (sign in/up, email confirmation, reset), token on REST + WS `hello` (4401 → "Sign in again"), backend `services/sessions.py` writes `study_sessions` via PostgREST (hello + disconnect, never on the fast path), `REQUIRE_AUTH=true`. Live project `axodbnbvucmifwfwnodj` signs ES256 (JWKS) — no JWT secret needed. **Awaiting the sign-in pass** (`docs/TIER0B_AUTH_SMOKE_TEST.md`; needs a real inbox). Google sign-in not done (provider disabled in the project).

- Tier 1a (transcript ingestion) — code done 19 Sep: `POST /api/videos` (202) / `GET /api/videos/{id}` / `…/transcript` served from the `videos` cache; background run claimed by a conditional UPDATE (pending→fetching→[transcribing after 8 s]→embedding→ready | unavailable | failed; failed auto-retries after 2 min or on Retry, stuck runs reclaimed after 10 min); one retry on timeout/5xx; chunker 45–60 s / ~10 s overlap; hosted BGE-M3 via HF router (e5 ONNX fallback wired, off until onnxruntime lands); embed failure keeps the transcript and a Retry re-embeds without a new TranscriptAPI call; `video.status` WS event after `ready`; graph names the reason for ASK/SUMMARIZE/SEMANTIC_SEEK when there's no usable transcript (EN/HI). Frontend: `useVideoTranscript`, real `TranscriptTab`, top-bar status chip. 977 tests. Verified live (TranscriptAPI plan now active, Supabase writes, BGE-M3): see `docs/TIER1A_SMOKE_TEST.md`. **Awaiting:** signed-in UI pass + a captions-disabled video.

- Tier 1b (semantic seek + Q&A) — code done 19 Sep, verified live over the WS (see `docs/TIER1B_SMOKE_TEST.md`): `seek_resolver` (whole video, no LLM, "did you mean" alt), `rag_agent` (watched-only context, anti-spoiler "not covered yet" when a future chunk clearly wins and nothing watched is a good match, streamed `answer.delta`, `[mm:ss]` citations → `answer.done.citations`, summaries, follow-ups use the last question), `llm_router` = one tool call (player action / seek / ask / summarize / note / direct reply) — its edges now branch per roadmap §2. Groq models are `openai/gpt-oss-120b` (answers) / `gpt-oss-20b` (router): llama-3.3 is gone from our key. Thresholds calibrated on 6.006 L1. Checkpointer: `CHECKPOINTER=postgres` wraps PostgresSaver in a write-behind MemorySaver (a synchronous remote checkpoint cost 1.9 s per fast-path turn); LangGraph tables get RLS. WS: turns run as tasks, `turn.cancel` / a new utterance stops a stream. Frontend: streamed sentence-level TTS (`lib/tts.ts createSpeechStream`), ducking until the answer ends, citation chips (`AnswerText`), real Q&A chat tab (typed + voice). 1023 tests. **Awaiting:** the signed-in voice pass.

## Next up (in order)
1. Tier 0 / 0b / 1a / 1b manual passes (above), then:
2. **Tier 1c** classifier (ML track — data collection can start in parallel now; see roadmap §3 + Tier 1c).
Then 1d bilingual polish, 1e notes, 1f model monitoring, 2 retention layer.
