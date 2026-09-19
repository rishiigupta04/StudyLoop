from fastapi import APIRouter, Depends, Request

from app.config import Settings, get_settings

router = APIRouter(tags=["health"])


@router.get("/health")
def health(request: Request, settings: Settings = Depends(get_settings)) -> dict:
    """Cheap liveness + config check. Also used as the cold-start warm-up ping from the landing page."""
    return {
        "status": "ok",
        "env": settings.env,
        "classifier": settings.classifier,
        "checkpointer": getattr(request.app.state, "checkpointer", "memory"),
        "configured": {
            "transcript_api": bool(settings.transcript_api_key),
            "groq": bool(settings.groq_api_key),
            "gemini": bool(settings.gemini_api_key),
            "embeddings": bool(settings.hf_token or settings.e5_model_dir),
            "database": bool(settings.database_url),
            "auth": settings.auth_enabled,
        },
    }
