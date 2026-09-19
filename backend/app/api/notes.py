"""Notes REST API (roadmap §7: GET/POST/PATCH /api/notes). Voice notes arrive over the WebSocket
(`note.created` / `note.updated`); this API lists them and handles typed notes, edits and deletes.
Export is client-side (Markdown download, PDF via print CSS)."""

import uuid

from fastapi import APIRouter, Depends, HTTPException, Response, status
from pydantic import BaseModel, Field

from app.auth import User, current_user
from app.services.notes import MAX_TEXT, VIDEO_ID, NotesError, NotesService, get_notes_service, new_note

router = APIRouter(tags=["notes"])


def notes_service() -> NotesService:
    return get_notes_service()


def _video(video_id: str) -> str:
    if not VIDEO_ID.fullmatch(video_id):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Invalid video id")
    return video_id


def _note_id(note_id: str) -> str:
    try:
        return str(uuid.UUID(note_id))
    except ValueError as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Note not found") from exc


def _storage_error(exc: NotesError) -> HTTPException:
    return HTTPException(status.HTTP_502_BAD_GATEWAY, f"Notes storage unavailable: {exc}")


class NoteCreate(BaseModel):
    video_id: str
    at_s: float = Field(ge=0, le=100_000)
    text: str = Field(min_length=1, max_length=MAX_TEXT)
    session_id: str | None = None
    is_bookmarked: bool = False


class NotePatch(BaseModel):
    raw_text: str | None = Field(default=None, min_length=1, max_length=MAX_TEXT)
    summary: str | None = Field(default=None, max_length=MAX_TEXT)
    is_bookmarked: bool | None = None
    at_s: float | None = Field(default=None, ge=0, le=100_000)


@router.get("/notes")
async def list_notes(
    video_id: str | None = None,
    user: User = Depends(current_user),
    svc: NotesService = Depends(notes_service),
) -> dict:
    try:
        return {"notes": await svc.list(user.id, _video(video_id) if video_id else None)}
    except NotesError as exc:
        raise _storage_error(exc) from exc


@router.post("/notes", status_code=201)
async def create_note(
    body: NoteCreate,
    user: User = Depends(current_user),
    svc: NotesService = Depends(notes_service),
) -> dict:
    text = body.text.strip()
    if not text:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Empty note")
    session_id = None
    if body.session_id:
        try:
            session_id = str(uuid.UUID(body.session_id))
        except ValueError:
            session_id = None
    note = new_note(
        user_id=user.id,
        video_id=_video(body.video_id),
        at_s=body.at_s,
        raw_text=text,
        session_id=session_id,
        is_auto=False,
        is_bookmarked=body.is_bookmarked,
    )
    try:
        return await svc.create(note)
    except NotesError as exc:
        raise _storage_error(exc) from exc


@router.patch("/notes/{note_id}")
async def update_note(
    note_id: str,
    body: NotePatch,
    user: User = Depends(current_user),
    svc: NotesService = Depends(notes_service),
) -> dict:
    fields = body.model_dump(exclude_unset=True)
    if "raw_text" in fields and fields["raw_text"] is None:
        del fields["raw_text"]  # raw_text is NOT NULL
    if not fields:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Nothing to update")
    try:
        row = await svc.update(user.id, _note_id(note_id), fields)
    except NotesError as exc:
        raise _storage_error(exc) from exc
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Note not found")
    return row


@router.delete("/notes/{note_id}", status_code=204)
async def delete_note(
    note_id: str,
    user: User = Depends(current_user),
    svc: NotesService = Depends(notes_service),
) -> Response:
    try:
        ok = await svc.delete(user.id, _note_id(note_id))
    except NotesError as exc:
        raise _storage_error(exc) from exc
    if not ok:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Note not found")
    return Response(status_code=204)
