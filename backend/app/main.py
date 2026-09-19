import asyncio
import logging
import uuid
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app import ws
from app.api import health, notes, speech, videos
from app.auth import warm_jwks
from app.config import get_settings

logging.basicConfig(level=logging.INFO)


@asynccontextmanager
async def lifespan(app: FastAPI):
    from app.orchestration.checkpointer import init_checkpointer
    from app.orchestration.graph import get_graph, new_turn_input, set_checkpointer

    settings = get_settings()
    saver, desc = await asyncio.to_thread(init_checkpointer, settings)
    set_checkpointer(saver)
    app.state.checkpointer = desc
    logging.getLogger("studyloop").info("checkpointer: %s", desc)

    # Run one throwaway turn so the first real voice command isn't slow
    # (cold import + graph compile cost ~70 ms otherwise).
    tid = f"warmup-{uuid.uuid4()}"
    get_graph().invoke(
        new_turn_input(session_id=tid, user_id="warmup", video_id="-", language="en", raw_text="pause"),
        {"configurable": {"thread_id": tid}},
    )
    if settings.supabase_url:
        ok = await asyncio.to_thread(warm_jwks, settings)
        logging.getLogger("studyloop").info(
            "JWKS %s", "loaded" if ok else "unavailable (will retry on first token)"
        )
    yield
    close = getattr(saver, "close", None)
    if close is not None:  # write-behind checkpointer: persist the last turns before exiting
        await asyncio.to_thread(close)


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
    app.include_router(notes.router, prefix="/api")
    app.include_router(speech.router, prefix="/api")
    app.include_router(ws.router)
    return app


app = create_app()
