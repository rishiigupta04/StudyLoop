from fastapi import APIRouter, Depends

from app.auth import User, current_user
from app.config import Settings, get_settings
from app.services.transcripts import TranscriptClient

router = APIRouter(tags=["videos"])

_client: TranscriptClient | None = None


def get_transcript_client(settings: Settings = Depends(get_settings)) -> TranscriptClient:
    global _client
    if _client is None:
        _client = TranscriptClient(settings)
    return _client


@router.get("/videos/{video}/transcript")
async def get_transcript(
    video: str,
    _user: User = Depends(current_user),
    client: TranscriptClient = Depends(get_transcript_client),
) -> dict:
    """Always 200: a missing transcript is a normal, explained state (graceful degradation),
    reported via `has_transcript=false` + `fail_reason` + `retryable`."""
    return (await client.fetch(video)).to_dict()
