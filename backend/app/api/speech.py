"""Hosted speech endpoints (roadmap D14): `/api/stt` for push-to-talk audio, `/api/tts` for answers.

Both answer 503 when no provider is configured — the client then keeps the browser's own speech APIs.
"""

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from starlette.background import BackgroundTask

from app.auth import User, current_user
from app.config import Settings, get_settings
from app.services import speech

router = APIRouter(tags=["speech"])


@router.post("/stt")
async def speech_to_text(
    file: UploadFile = File(...),
    language: str = Form("en"),
    _user: User = Depends(current_user),
    settings: Settings = Depends(get_settings),
) -> dict:
    audio = await file.read(speech.MAX_AUDIO_BYTES + 1)
    if len(audio) > speech.MAX_AUDIO_BYTES:
        raise HTTPException(status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, "Audio too long")
    try:
        r = await speech.transcribe(
            settings, audio, file.content_type or "audio/webm", "hi" if language == "hi" else "en"
        )
    except speech.SttUnavailable as exc:
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE, "Hosted speech-to-text is not configured"
        ) from exc
    except speech.SttError as exc:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, f"Speech-to-text failed: {exc}") from exc
    return {"text": r.text, "language": r.language, "provider": r.provider, "ms": r.ms}


class TtsRequest(BaseModel):
    text: str = Field(min_length=1, max_length=speech.MAX_TTS_CHARS)
    language: str = "en"


@router.post("/tts")
async def text_to_speech(
    body: TtsRequest,
    _user: User = Depends(current_user),
    settings: Settings = Depends(get_settings),
) -> StreamingResponse:
    if not speech.tts_configured(settings):
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "Hosted text-to-speech is not configured")
    text = body.text.strip()
    if not text:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Empty text")
    try:
        resp, chunks = await speech.open_tts_stream(settings, text, "hi" if body.language == "hi" else "en")
    except speech.TtsError as exc:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, f"Text-to-speech failed: {exc}") from exc
    return StreamingResponse(
        chunks,
        media_type="audio/mpeg",
        headers={"Cache-Control": "no-store"},
        background=BackgroundTask(resp.aclose),
    )
