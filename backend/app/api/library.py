"""Library, resume point, dashboard and chat history (roadmap Tier 2). Everything is scoped to the verified
user; resume points are written behind the WebSocket heartbeat (`services/library.py`), never here."""

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status

from app.auth import User, current_user
from app.services.library import LibraryError, LibraryService, get_library_service
from app.services.notes import VIDEO_ID

router = APIRouter(tags=["library"])


def library_service() -> LibraryService:
    return get_library_service()


def _video(video_id: str) -> str:
    if not VIDEO_ID.fullmatch(video_id):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Invalid video id")
    return video_id


def _storage_error(exc: LibraryError) -> HTTPException:
    return HTTPException(status.HTTP_502_BAD_GATEWAY, f"Library storage unavailable: {exc}")


@router.get("/library")
async def list_library(
    user: User = Depends(current_user), svc: LibraryService = Depends(library_service)
) -> dict:
    """Videos this user has studied, most recent first, with progress, transcript/outline state and notes."""
    try:
        return {"videos": await svc.library(user.id)}
    except LibraryError as exc:
        raise _storage_error(exc) from exc


@router.get("/library/{video_id}")
async def resume_point(
    video_id: str, user: User = Depends(current_user), svc: LibraryService = Depends(library_service)
) -> dict:
    """Where to resume, and how far the learner has watched (seeds the no-spoiler high-water mark)."""
    try:
        return await svc.resume(user.id, _video(video_id))
    except LibraryError as exc:
        raise _storage_error(exc) from exc


@router.delete("/library/{video_id}", status_code=204)
async def remove_from_library(
    video_id: str, user: User = Depends(current_user), svc: LibraryService = Depends(library_service)
) -> Response:
    try:
        found = await svc.remove(user.id, _video(video_id))
    except LibraryError as exc:
        raise _storage_error(exc) from exc
    if not found:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Not in your library")
    return Response(status_code=204)


@router.get("/dashboard")
async def dashboard(
    user: User = Depends(current_user), svc: LibraryService = Depends(library_service)
) -> dict:
    try:
        return await svc.dashboard(user.id)
    except LibraryError as exc:
        raise _storage_error(exc) from exc


@router.get("/chats")
async def chat_history(
    limit: int = Query(30, ge=1, le=100),
    user: User = Depends(current_user),
    svc: LibraryService = Depends(library_service),
) -> dict:
    """Recent study sessions with their voice/typed Q&A turns (from the conversation memory)."""
    try:
        return {"sessions": await svc.chats(user.id, limit=limit)}
    except LibraryError as exc:
        raise _storage_error(exc) from exc
