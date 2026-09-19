from fastapi import APIRouter, Depends

from app.config import Settings, get_settings

router = APIRouter(tags=["health"])


@router.get("/health")
def health(settings: Settings = Depends(get_settings)) -> dict:
    """Cheap liveness + config check. Also used as the cold-start warm-up ping from the landing page."""
    return {
        "status": "ok",
        "env": settings.env,
        "classifier": settings.classifier,
        "configured": {
            "transcript_api": bool(settings.transcript_api_key),
            "groq": bool(settings.groq_api_key),
            "gemini": bool(settings.gemini_api_key),
            "database": bool(settings.database_url),
            "auth": settings.auth_enabled,
        },
    }
