from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from app.auth import User, current_user
from app.services.ingest import IngestService, get_ingest_service

router = APIRouter(tags=["videos"])


def ingest_service() -> IngestService:
    return get_ingest_service()


class IngestRequest(BaseModel):
    video: str  # YouTube id or any YouTube URL
    retry: bool = False  # skip the failed-ingest cooldown (the client's Retry button)


@router.post("/videos", status_code=202)
async def ingest_video(
    body: IngestRequest,
    _user: User = Depends(current_user),
    svc: IngestService = Depends(ingest_service),
) -> JSONResponse:
    """Start (or join) ingestion; returns the status at once (roadmap D10). Progress arrives as
    `video.status` on the session WebSocket, or by polling `GET /api/videos/{id}`."""
    return JSONResponse(await svc.ensure(body.video, force=body.retry), status_code=202)


@router.get("/videos/{video}")
async def video_status(
    video: str,
    _user: User = Depends(current_user),
    svc: IngestService = Depends(ingest_service),
) -> dict:
    return await svc.ensure(video)


@router.get("/videos/{video}/transcript")
async def get_transcript(
    video: str,
    _user: User = Depends(current_user),
    svc: IngestService = Depends(ingest_service),
) -> dict:
    """Always 200: a missing transcript is a normal, explained state (graceful degradation),
    reported via `status` + `has_transcript` + `fail_reason` + `retryable`. Served from the `videos`
    cache; kicks off ingestion if the video is new."""
    return await svc.transcript(video)
