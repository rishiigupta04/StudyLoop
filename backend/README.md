# StudyLoop backend (FastAPI + LangGraph)

```bash
cd backend
python -m venv .venv && . .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install -r requirements-dev.txt
cp .env.example .env                                  # fill in keys (never VITE_-prefixed)
uvicorn app.main:app --reload --port 8000             # http://localhost:8000/health
pytest -q && ruff check . && ruff format --check .
```

Layout
- `app/` — FastAPI app (`main.py`), settings (`config.py`), Supabase JWT auth (`auth.py`), routers (`api/`), provider clients (`services/`)
- `studyloop_nlp/` — `normalize()` (Devanagari → Hinglish, numbers, units) and `parse_slots()`. **Shared with `ml/`** so the classifier trains on exactly what the server feeds it. Bump `__version__` whenever outputs change.
- `migrations/` — run `001_init.sql` in the Supabase SQL editor (schema v2)
- `tests/` — pytest; no network (TranscriptAPI is mocked with `httpx.MockTransport`)

Deploy: Render Blueprint in `/render.yaml` (Docker, `rootDir: backend`, health check `/health`).
