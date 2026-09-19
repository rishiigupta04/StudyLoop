# STUDYLOOP — Environment Variables (v2, 18 Sep 2026)

**Rule:** anything prefixed `VITE_` is compiled into the public JavaScript bundle. Only public values may use it.
Every provider key (TranscriptAPI, Groq, Gemini, HF, Supabase service role) lives in `backend/.env` / the Render dashboard.

## Frontend — `frontend/.env` (and Vercel → Project → Environment Variables)

| Variable | Required | Example | Notes |
|---|:-:|---|---|
| `VITE_SUPABASE_URL` | yes | `https://abc.supabase.co` | public |
| `VITE_SUPABASE_ANON_KEY` | yes | `sb_publishable_...` (legacy: `eyJ...`) | publishable key; public by design (RLS protects data) |
| `VITE_API_URL` | yes | `http://localhost:8000` / `https://studyloop-api.onrender.com` | backend origin, no trailing `/api` |
| `VITE_SITE_URL` | no | `http://localhost:4028` | |

❌ Removed: `VITE_TRANSCRIPT_API_KEY`, `VITE_GROQ_API_KEY*`, `VITE_HF_API_TOKEN`, `VITE_API_BASE_URL`. **Delete them in Vercel too and rotate the keys** — they were publicly readable.

## Backend — `backend/.env` (template: `backend/.env.example`; Render dashboard in prod)

| Variable | Required | Notes |
|---|:-:|---|
| `ENV` | yes | `dev` \| `prod`. In `dev` with no Supabase config, requests run as a demo user. |
| `CORS_ORIGINS` | yes | comma-separated, e.g. `http://localhost:4028,https://studylooop.vercel.app` |
| `SUPABASE_URL` | yes | JWKS token verification (this project signs ES256) + PostgREST writes |
| `SUPABASE_JWT_SECRET` | legacy only | only if the project still signs with the HS256 shared secret |
| `SUPABASE_SERVICE_KEY` | yes (0b+) | `sb_secret_...` (or legacy service_role JWT) — backend writes `study_sessions`, later shared tables. Never `VITE_`. |
| `REQUIRE_AUTH` | yes | `true` everywhere real; `false` only for an anonymous local demo |
| `DATABASE_URL` | Tier 1a+ | Supabase pooler connection string (pgvector + checkpointer) |
| `TRANSCRIPT_API_KEY` | yes | TranscriptAPI.com bearer token |
| `GROQ_API_KEY` | Tier 1b+ | primary LLM |
| `GEMINI_API_KEY` | Tier 1b+ | LLM fallback |
| `HF_TOKEN` | Tier 1a+ | hosted BGE-M3 embeddings |
| `CLASSIFIER` | no | `regex` (Tier 0) → `onnx` (Tier 1c) |
| `CONFIDENCE_THRESHOLD` | no | tuned from the confusion matrix in Tier 1c |
