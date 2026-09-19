import asyncio
import logging
import uuid
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app import ws
from app.api import health, videos
from app.auth import warm_jwks
from app.config import get_settings

logging.basicConfig(level=logging.INFO)


@asynccontextmanager
async def lifespan(_app: FastAPI):
    # Compile the graph and run one throwaway turn so the first real voice command isn't slow
    # (cold import + graph compile cost ~70 ms otherwise).
    from app.orchestration.graph import get_graph, new_turn_input

    tid = f"warmup-{uuid.uuid4()}"
    get_graph().invoke(
        new_turn_input(session_id=tid, user_id="warmup", video_id="-", language="en", raw_text="pause"),
        {"configurable": {"thread_id": tid}},
    )
    settings = get_settings()
    if settings.supabase_url:
        ok = await asyncio.to_thread(warm_jwks, settings)
        logging.getLogger("studyloop").info(
            "JWKS %s", "loaded" if ok else "unavailable (will retry on first token)"
        )
    yield


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(title="StudyLoop API", version="0.1.0", lifespan=lifespan)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.include_router(health.router)
    app.include_router(videos.router, prefix="/api")
    app.include_router(ws.router)
    return app


app = create_app()
