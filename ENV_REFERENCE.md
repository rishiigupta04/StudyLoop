# STUDYLOOP — Environment Variables Reference

> All frontend environment variables **must** use the `VITE_` prefix to be exposed to client-side code by Vite.
> Backend variables (used only in FastAPI) do **not** need this prefix.

---

## Frontend Variables (`.env` at project root)

| Variable | Required | Default | Description |
| :--- | :---: | :--- | :--- |
| `VITE_SUPABASE_URL` | Yes | — | Supabase project URL (e.g. `https://abc.supabase.co`) |
| `VITE_SUPABASE_ANON_KEY` | Yes | — | Supabase anonymous/public API key |
| `VITE_TRANSCRIPT_API_KEY` | No | — | TranscriptAPI bearer token. When absent, service returns mock data. |
| `VITE_SITE_URL` | No | `http://localhost:4028` | Public site URL for SEO/meta tags |
| `VITE_WS_URL` | No | `ws://localhost:8000` | WebSocket server URL for voice bridge |

### Example `.env`

```bash
# Supabase
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOi...your-anon-key

# TranscriptAPI (optional — mock data used when absent)
VITE_TRANSCRIPT_API_KEY=your-transcript-api-key

# WebSocket backend (Phase 3+)
VITE_WS_URL=ws://localhost:8000

# Site
VITE_SITE_URL=http://localhost:4028
```

---

## Backend Variables (FastAPI `.env` in `backend/` directory — Phase 4+)

| Variable | Required | Description |
| :--- | :---: | :--- |
| `DATABASE_URL` | Yes | PostgreSQL connection string with pgvector extension |
| `REDIS_URL` | Yes | Redis connection string (e.g. `redis://localhost:6379/0`) |
| `HF_API_KEY` | Yes | HuggingFace Inference API key for Whisper ASR, Qwen2.5 LLM, BGE-M3 |
| `TRANSCRIPT_API_KEY` | Yes | TranscriptAPI bearer token (server-side for secure ingestion) |
| `SECRET_KEY` | Yes | JWT signing secret for auth tokens |
| `SUPABASE_URL` | Yes | Supabase project URL |
| `SUPABASE_SERVICE_KEY` | Yes | Supabase **service role** key (admin access, never expose to client) |
| `CORS_ORIGINS` | No | Comma-separated allowed origins (default: `http://localhost:4028`) |

---

## Migration Notes

> [!WARNING]
> The legacy `.env` file contains `NEXT_PUBLIC_*` variables from the original Next.js codebase. These must be migrated to `VITE_*` prefix for Vite compatibility. `NEXT_PUBLIC_*` variables are **not** exposed to client code by Vite.

| Legacy Variable | New Variable |
| :--- | :--- |
| `NEXT_PUBLIC_SUPABASE_URL` | `VITE_SUPABASE_URL` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `VITE_SUPABASE_ANON_KEY` |
| `NEXT_PUBLIC_SITE_URL` | `VITE_SITE_URL` |
| `NEXT_PUBLIC_GA_MEASUREMENT_ID` | Removed (not needed for MVP) |
| `NEXT_PUBLIC_ADSENSE_ID` | Removed (not needed for MVP) |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Removed (not needed for MVP) |
| `OPENAI_API_KEY` | Removed (using HuggingFace API instead) |
| `GEMINI_API_KEY` | Removed (using HuggingFace API instead) |
| `ANTHROPIC_API_KEY` | Removed (using HuggingFace API instead) |
| `PERPLEXITY_API_KEY` | Removed (using HuggingFace API instead) |
