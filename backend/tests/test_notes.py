"""Tier 1e — voice notes: the in-graph draft (no I/O), the WebSocket ack + background summary, the REST API,
per-user isolation, and the PostgREST request shapes (MockTransport; never the real project)."""

import asyncio
import json
import time
import uuid

import httpx
import jwt
import pytest
from fastapi.testclient import TestClient

from app.config import Settings, get_settings
from app.main import create_app
from app.services.llm import LLMError
from app.services.notes import (
    InMemoryNotesRepo,
    NotesService,
    SupabaseNotesRepo,
    clean_summary,
    new_note,
    set_notes_service,
    summary_messages,
    transcript_before,
)
from app.services.transcripts import Segment
from tests.conftest import recv

VID = "HtSuA80QTyo"
SECRET = "z" * 40

SEGMENTS = [Segment(text=f"part {i} about peaks", start=i * 10.0, duration=10.0) for i in range(30)]


class FakeLLM:
    configured = True

    def __init__(self, answer="A peak is an element no smaller than its neighbours.", fail=False, delay=0.0):
        self.answer, self.fail, self.delay = answer, fail, delay
        self.calls: list[list[dict]] = []

    async def stream(self, messages, **kw):
        self.calls.append(messages)
        if self.delay:
            await asyncio.sleep(self.delay)
        if self.fail:
            raise LLMError("groq down")
        return self.answer


def service(llm=None, segments=SEGMENTS, repo=None):
    async def segs(_vid):
        return list(segments)

    svc = NotesService(repo or InMemoryNotesRepo(), segments=segs, llm=llm)
    set_notes_service(svc)
    return svc


def client(settings: Settings | None = None) -> TestClient:
    app = create_app()
    import app.ws as ws_mod

    ws_mod.get_settings = (lambda: settings) if settings is not None else get_settings
    if settings is not None:
        app.dependency_overrides[get_settings] = lambda: settings
    return TestClient(app)


def token(sub: str) -> str:
    return jwt.encode(
        {"sub": sub, "aud": "authenticated", "exp": int(time.time()) + 60}, SECRET, algorithm="HS256"
    )


# ------------------------------------------------------------------ pure helpers
def test_context_is_the_last_minute_and_never_the_future():
    ctx = transcript_before(SEGMENTS, at_s=125.0)
    assert "part 6 " in ctx and "part 12 " in ctx  # 60–70 s … 120–130 s overlap [65, 125]
    assert "part 5 " not in ctx and "part 13 " not in ctx  # before the window / after the note
    assert transcript_before(SEGMENTS, at_s=0.0) == ""
    assert transcript_before([], at_s=100.0) == ""


def test_summary_prompt_is_in_the_chosen_language():
    hi = summary_messages("ये note कर लो", "the peak is ...", 125.0, "hi")
    assert "Devanagari" in hi[0]["content"] and "2:05" in hi[0]["content"]
    assert "ये note कर लो" in hi[1]["content"]
    assert "English" in summary_messages("note this", "x", 5, "en")[0]["content"]


def test_clean_summary():
    assert clean_summary('  "Note: **Peaks** exist in   every array." ') == "Peaks exist in every array."
    assert clean_summary("नोट: पीक हमेशा मौजूद है") == "पीक हमेशा मौजूद है"


# ------------------------------------------------------------------ background half
async def test_voice_note_is_saved_then_summarized():
    llm = FakeLLM()
    svc = service(llm)
    sent: list[dict] = []

    async def send(m):
        sent.append(m)

    note = new_note(user_id="u1", video_id=VID, at_s=125.0, raw_text="note this down", is_auto=True)
    out = await svc.finish_voice_note(note, spoken="note this down", language="en", send=send)
    assert out["saved"] and out["summary_status"] == "done"
    assert sent == [{"type": "note.updated", "note": out["note"], "summary_status": "done", "saved": True}]
    assert "user_id" not in out["note"]
    [stored] = await svc.list("u1", VID)
    assert stored["summary"] == llm.answer and stored["at_s"] == 125.0 and stored["is_auto"]
    assert "part 12 " in llm.calls[0][1]["content"]  # transcript context went to the LLM


async def test_no_transcript_or_no_llm_skips_the_summary_but_keeps_the_note():
    for svc in (service(FakeLLM(), segments=[]), service(None)):
        note = new_note(user_id="u1", video_id=VID, at_s=10, raw_text="note that n log n", is_auto=True)
        out = await svc.finish_voice_note(note, spoken="note that n log n", language="en")
        assert out == {**out, "saved": True, "summary_status": "skipped"}
        assert (await svc.list("u1", VID))[0]["raw_text"] == "note that n log n"


async def test_llm_failure_is_reported_and_the_note_survives():
    svc = service(FakeLLM(fail=True))
    note = new_note(user_id="u1", video_id=VID, at_s=100, raw_text="note this", is_auto=True)
    out = await svc.finish_voice_note(note, spoken="note this", language="hi")
    assert out["saved"] and out["summary_status"] == "failed" and out["note"]["summary"] is None
    assert len(await svc.list("u1", VID)) == 1


async def test_a_user_edit_during_summarizing_wins():
    llm = FakeLLM(delay=0.05)
    svc = service(llm)
    note = new_note(user_id="u1", video_id=VID, at_s=100, raw_text="note this", is_auto=True)
    task = asyncio.create_task(svc.finish_voice_note(note, spoken="note this", language="en"))
    await asyncio.sleep(0.01)  # saved, summary still generating
    await svc.update("u1", note["id"], {"summary": "my own words"})
    out = await task
    assert out["summary_status"] == "kept" and out["note"]["summary"] is None
    assert (await svc.list("u1", VID))[0]["summary"] == "my own words"


async def test_odd_video_ids_are_never_written():
    svc = service(FakeLLM())
    note = new_note(user_id="u1", video_id="not a video!", at_s=1, raw_text="note", is_auto=True)
    out = await svc.finish_voice_note(note, spoken="note", language="en")
    assert not out["saved"] and await svc.list("u1") == []


# ------------------------------------------------------------------ over the WebSocket
def _hello(ws, **extra):
    ws.send_json({"type": "hello", "video_id": VID, "language": "en", **extra})
    assert recv(ws)["type"] == "ready"


def test_ws_voice_note_ack_then_summary():
    llm = FakeLLM()
    svc = service(llm)
    c = client()
    with c.websocket_connect("/ws/session") as ws:
        _hello(ws)
        ws.send_json({"type": "utterance", "turn_id": "n1", "text": "note this down", "playback_s": 125.4})
        created = recv(ws)
        assert created["type"] == "note.created" and created["turn_id"] == "n1"
        assert created["summary_status"] == "pending"
        note = created["note"]
        assert note["at_s"] == 125.4 and note["raw_text"] == "note this down" and note["is_auto"]
        assert note["summary"] is None and note["video_id"] == VID and "user_id" not in note

        done = recv(ws)
        assert done["type"] == "answer.done" and done["route"] == "notes" and done["text"] == "Noted at 2:05."
        assert done["timings"]["server_total"] < 200  # the ack never waits for the DB or the LLM
        assert "notes_agent" in done["timings"] and "llm_router" not in done["timings"]

        updated = recv(ws)
        assert updated["type"] == "note.updated" and updated["note"]["id"] == note["id"]
        assert updated["summary_status"] == "done" and updated["note"]["summary"] == llm.answer

    # anonymous demo user: stored in memory, visible through the REST API
    [row] = c.get("/api/notes", params={"video_id": VID}).json()["notes"]
    assert row["id"] == note["id"] and row["summary"] == llm.answer
    assert svc.memory.rows[note["id"]]["user_id"] == "00000000-0000-0000-0000-000000000000"


def test_ws_hindi_bookmark_note():
    llm = FakeLLM(answer="पीक वह element है जो अपने पड़ोसियों से छोटा नहीं है।")
    service(llm)
    c = client()
    with c.websocket_connect("/ws/session") as ws:
        _hello(ws)
        ws.send_json(
            {"type": "utterance", "turn_id": "h1", "text": "बुकमार्क करो", "playback_s": 61, "language": "hi"}
        )
        created = recv(ws)
        assert created["note"]["is_bookmarked"] is True
        assert recv(ws)["text"] == "1:01 bookmark कर लिया।"
        updated = recv(ws)
        assert updated["note"]["summary"] == llm.answer
        assert "Devanagari" in llm.calls[0][0]["content"]  # the summary is written in Hindi directly


def test_player_commands_never_create_notes():
    service(FakeLLM())
    c = client()
    with c.websocket_connect("/ws/session") as ws:
        _hello(ws)
        ws.send_json({"type": "utterance", "turn_id": "p1", "text": "pause", "playback_s": 5})
        assert recv(ws)["type"] == "action"
    assert c.get("/api/notes").json()["notes"] == []


# ------------------------------------------------------------------ REST
def test_rest_crud_and_per_user_isolation():
    service()
    s = Settings(_env_file=None, supabase_jwt_secret=SECRET, require_auth=True)
    c = client(s)
    a = {"Authorization": f"Bearer {token('11111111-1111-1111-1111-111111111111')}"}
    b = {"Authorization": f"Bearer {token('22222222-2222-2222-2222-222222222222')}"}
    assert c.get("/api/notes").status_code == 401

    r = c.post(
        "/api/notes", json={"video_id": VID, "at_s": 42.5, "text": "  big-O is an upper bound  "}, headers=a
    )
    assert r.status_code == 201
    n = r.json()
    assert n["raw_text"] == "big-O is an upper bound" and not n["is_auto"] and n["at_s"] == 42.5
    c.post("/api/notes", json={"video_id": VID, "at_s": 10, "text": "first"}, headers=a)
    c.post("/api/notes", json={"video_id": "dQw4w9WgXcQ", "at_s": 3, "text": "other video"}, headers=a)

    listed = c.get("/api/notes", params={"video_id": VID}, headers=a).json()["notes"]
    assert [x["raw_text"] for x in listed] == ["first", "big-O is an upper bound"]  # time order
    assert len(c.get("/api/notes", headers=a).json()["notes"]) == 3  # workspace: every video
    assert c.get("/api/notes", headers=b).json()["notes"] == []  # someone else's notes are invisible

    assert c.patch(f"/api/notes/{n['id']}", json={"is_bookmarked": True}, headers=b).status_code == 404
    p = c.patch(f"/api/notes/{n['id']}", json={"is_bookmarked": True, "raw_text": "edited"}, headers=a)
    assert p.status_code == 200 and p.json()["is_bookmarked"] and p.json()["raw_text"] == "edited"
    assert c.patch(f"/api/notes/{n['id']}", json={}, headers=a).status_code == 422

    assert c.delete(f"/api/notes/{n['id']}", headers=b).status_code == 404
    assert c.delete(f"/api/notes/{n['id']}", headers=a).status_code == 204
    assert c.delete(f"/api/notes/{n['id']}", headers=a).status_code == 404
    assert c.delete("/api/notes/not-a-uuid", headers=a).status_code == 404


@pytest.mark.parametrize(
    "body",
    [
        {"video_id": "bad id!", "at_s": 1, "text": "x"},
        {"video_id": VID, "at_s": -1, "text": "x"},
        {"video_id": VID, "at_s": 1, "text": ""},
        {"video_id": VID, "at_s": 1, "text": "   "},
    ],
)
def test_rest_rejects_bad_notes(body):
    service()
    assert client().post("/api/notes", json=body).status_code == 422


# ------------------------------------------------------------------ PostgREST shapes
def _supabase(handler, key="sb_secret_x"):
    s = Settings(_env_file=None, supabase_url="https://p.supabase.co", supabase_service_key=key)
    return SupabaseNotesRepo(s, client=httpx.AsyncClient(transport=httpx.MockTransport(handler)))


async def test_supabase_create_ensures_video_then_inserts():
    seen: list[httpx.Request] = []

    def handler(req: httpx.Request) -> httpx.Response:
        seen.append(req)
        if req.url.path.endswith("/notes"):
            return httpx.Response(201, json=json.loads(req.content))
        return httpx.Response(201)

    repo = _supabase(handler)
    note = new_note(user_id="u1", video_id=VID, at_s=5, raw_text="x", session_id=str(uuid.uuid4()))
    row = await repo.create(note)
    assert [r.url.path for r in seen] == ["/rest/v1/videos", "/rest/v1/notes"]
    assert seen[0].headers["Prefer"] == "resolution=ignore-duplicates,return=minimal"
    body = json.loads(seen[1].content)[0]
    assert body["id"] == note["id"] and body["user_id"] == "u1" and "created_at" not in body
    assert row["id"] == note["id"] and seen[1].headers["apikey"] == "sb_secret_x"


async def test_supabase_create_retries_without_a_missing_session():
    bodies: list[dict] = []

    def handler(req: httpx.Request) -> httpx.Response:
        if not req.url.path.endswith("/notes"):
            return httpx.Response(201)
        body = json.loads(req.content)[0]
        bodies.append(body)
        if body["session_id"]:
            return httpx.Response(409, json={"code": "23503", "message": "violates foreign key"})
        return httpx.Response(201, json=[body])

    repo = _supabase(handler)
    note = new_note(user_id="u1", video_id=VID, at_s=5, raw_text="x", session_id=str(uuid.uuid4()))
    row = await repo.create(note)
    assert [b["session_id"] is None for b in bodies] == [False, True] and row["session_id"] is None


async def test_supabase_update_and_delete_are_scoped_to_the_owner():
    seen: list[httpx.Request] = []

    def handler(req: httpx.Request) -> httpx.Response:
        seen.append(req)
        return httpx.Response(200, json=[])

    repo = _supabase(handler)
    assert await repo.update("u1", "n1", {"summary": "s"}, only_if_no_summary=True) is None
    assert await repo.delete("u1", "n1") is False
    q = dict(seen[0].url.params)
    assert q == {"id": "eq.n1", "user_id": "eq.u1", "summary": "is.null"}
    assert dict(seen[1].url.params) == {"id": "eq.n1", "user_id": "eq.u1"}
    assert seen[1].method == "DELETE"
    listed = _supabase(handler)
    await listed.list("u1", VID)
    assert dict(seen[2].url.params)["video_id"] == f"eq.{VID}"


async def test_supabase_errors_become_notes_errors():
    from app.services.notes import NotesError

    repo = _supabase(lambda req: httpx.Response(500, text="boom"))
    with pytest.raises(NotesError):
        await repo.list("u1")
