import os

# Hermetic tests: never fetch the real project's JWKS or write to the real database, even when a
# developer's backend/.env points at Supabase. Env vars win over the .env file in pydantic-settings.
os.environ["SUPABASE_URL"] = ""
os.environ["SUPABASE_SERVICE_KEY"] = ""
os.environ["REQUIRE_AUTH"] = "false"  # tests that need auth build their own Settings(require_auth=True)
# ...and never spend TranscriptAPI credits or call the hosted embedder
os.environ["TRANSCRIPT_API_KEY"] = ""
os.environ["HF_TOKEN"] = ""
os.environ["E5_MODEL_DIR"] = ""
os.environ["GROQ_API_KEY"] = ""  # ...or an LLM
os.environ["GEMINI_API_KEY"] = ""
os.environ["CHECKPOINTER"] = "memory"

import pytest  # noqa: E402

from app.services.ingest import set_ingest_service  # noqa: E402
from app.services.llm import set_llm  # noqa: E402
from app.services.notes import set_notes_service  # noqa: E402
from app.services.retrieval import set_retriever  # noqa: E402


@pytest.fixture(autouse=True)
def _fresh_services():
    """Each test gets its own in-memory ingest service, retriever and LLM client (no cross-test state)."""
    for reset in (set_ingest_service, set_retriever, set_llm, set_notes_service):
        reset(None)
    yield
    for reset in (set_ingest_service, set_retriever, set_llm, set_notes_service):
        reset(None)


def recv(ws, skip=("video.status",)):
    """Next WebSocket message, skipping the asynchronous ingestion status pushes."""
    while True:
        msg = ws.receive_json()
        if msg.get("type") not in skip:
            return msg
