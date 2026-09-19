"""Tier 2 retention layer: write-behind resume points, library, dashboard, chat history."""

import asyncio
import json
import uuid
from datetime import datetime, timedelta, timezone
from urllib.parse import parse_qs, urlsplit

import httpx
from langgraph.checkpoint.memory import MemorySaver

from app.config import Settings
from app.orchestration.checkpointer import WriteBehindSaver
from app.orchestration.graph import build_graph, new_turn_input
from app.services import library as LB
from app.services.library import (
    InMemoryLibraryRepo,
    LibraryService,
    SupabaseLibraryRepo,
    library_item,
    session_turns,
    status_for,
    study_days,
)
from app.services.notes import ANONYMOUS_ID
from tests.conftest import recv

VID = "HtSuA80QTyo"
USER = "11111111-1111-1111-1111-111111111111"


class CountingRepo(InMemoryLibraryRepo):
    def __init__(self, **kw):
        super().__init__(**kw)
        self.writes: list[dict] = []

    async def upsert_history(self, row):
        self.writes.append(dict(row))
        await super().upsert_history(row)


def svc(repo=None, **kw):
    repo = repo or CountingRepo()
    return LibraryService(repo, memory=repo, **kw), repo


# ------------------------------------------------------------------ write-behind
async def test_heartbeats_stay_in_memory_until_the_flusher_writes_one_row():
    s, repo = svc(flush_s=0.05)
    for t in (10, 15, 20):
        s.note_position(USER, VID, position_s=t, max_watched_s=t, duration_s=3200)
    assert repo.writes == []  # write-behind: nothing on the heartbeat itself
    await asyncio.sleep(0.2)
    assert len(repo.writes) == 1  # three heartbeats coalesced
    w = repo.writes[0]
    assert (w["last_position_s"], w["max_watched_s"], w["status"]) == (20, 20, "in-progress")


async def test_rewinding_keeps_the_high_water_mark_and_disconnect_flushes():
    s, repo = svc(flush_s=60)
    s.note_position(USER, VID, position_s=900, max_watched_s=900)
    s.note_position(USER, VID, position_s=100, max_watched_s=0)  # rewound; stale max from the client
    await s.flush_soon(USER, VID)
    assert repo.writes[-1]["last_position_s"] == 100 and repo.writes[-1]["max_watched_s"] == 900
    assert s.flush_soon(USER, VID) is None  # nothing pending


async def test_failed_write_is_retried_later():
    class Flaky(CountingRepo):
        fail = True

        async def upsert_history(self, row):
            if self.fail:
                self.fail = False
                raise LB.LibraryError("HTTP 503")
            await super().upsert_history(row)

    s, repo = svc(Flaky(), flush_s=60)
    s.note_position(USER, VID, position_s=50, max_watched_s=50)
    await s.flush_soon(USER, VID)
    assert repo.writes == [] and (USER, VID) in s._dirty
    await s.flush_all()
    assert repo.writes[0]["last_position_s"] == 50


def test_bad_video_ids_are_ignored_and_status_rules():
    s, _ = svc()
    s.note_position(USER, "not a video!", position_s=5, max_watched_s=5)
    assert s._dirty == {}
    assert status_for(0, 100) == "not-started"
    assert status_for(50, 100) == "in-progress"
    assert status_for(90, 100) == "completed"
    assert status_for(5000, None) == "in-progress"


async def test_resume_prefers_pending_position_and_the_highest_mark():
    s, repo = svc(flush_s=60)
    await repo.upsert_history(
        {
            "user_id": USER,
            "video_id": VID,
            "last_position_s": 300,
            "max_watched_s": 800,
            "status": "in-progress",
        }
    )
    assert (await s.resume(USER, VID))["last_position_s"] == 300
    s.note_position(USER, VID, position_s=420, max_watched_s=420)
    r = await s.resume(USER, VID)
    assert r["last_position_s"] == 420 and r["max_watched_s"] == 800
    assert (await s.resume(USER, "aircAruvnKk"))["status"] == "not-started"


# ------------------------------------------------------------------ views
def test_library_item_joins_video_outline_and_notes():
    row = {
        "video_id": VID,
        "last_position_s": 100,
        "max_watched_s": 3000,
        "last_studied_at": "2026-09-19T10:00:00+00:00",
        "videos": {
            "title": "Lecture 1",
            "duration_s": 3200,
            "ingest_status": "ready",
            "has_transcript": True,
            "chapters": {
                "status": "ready",
                "langs": {
                    "en": {"overview": "EN o", "chapters": [{}, {}]},
                    "hi": {"overview": "HI o", "chapters": [{}]},
                },
            },
        },
    }
    item = library_item(row, notes=3)
    assert item["status"] == "completed" and item["progress"] == 3000 / 3200
    assert item["chapters"] == 2 and item["overview"] == {"en": "EN o", "hi": "HI o"} and item["notes"] == 3
    assert item["thumbnail_url"] == f"https://i.ytimg.com/vi/{VID}/hqdefault.jpg"
    bare = library_item({"video_id": VID, "videos": None}, notes=0)
    assert bare["progress"] is None and bare["outline_status"] is None and bare["overview"] is None


def test_study_days_buckets_and_caps():
    today = datetime(2026, 9, 19, 12, tzinfo=timezone.utc)
    sessions = [
        {"started_at": "2026-09-19T10:00:00+00:00", "last_seen_at": "2026-09-19T10:30:00+00:00"},
        {
            "started_at": "2026-09-18T09:00:00+00:00",
            "last_seen_at": "2026-09-19T09:00:00+00:00",
        },  # capped 4 h
        {
            "started_at": "2026-09-17T09:00:00+00:00",
            "last_seen_at": "2026-09-17T09:00:00+00:00",
        },  # no end yet
        {"started_at": "2026-09-01T09:00:00+00:00", "last_seen_at": "2026-09-01T10:00:00+00:00"},  # too old
    ]
    days = study_days(sessions, today=today)
    assert len(days) == 7 and days[-1] == {"date": "2026-09-19", "minutes": 30.0}
    assert days[-2]["minutes"] == 240.0 and days[-3]["minutes"] == 0.0


# ------------------------------------------------------------------ chat history from the checkpointer
def test_session_turns_reads_the_conversation_memory_without_hydrating():
    cold = MemorySaver()
    thread = str(uuid.uuid4())
    writer = WriteBehindSaver(MemorySaver(), cold)
    g = build_graph(checkpointer=writer)
    for text in ("pause", "what is a peak"):
        g.invoke(
            new_turn_input(
                session_id=thread,
                user_id="u",
                video_id="v",
                language="en",
                turn_id="t",
                raw_text=text,
                playback_s=42,
            ),
            {"configurable": {"thread_id": thread}},
        )
    writer.close()
    reader = WriteBehindSaver(MemorySaver(), cold)  # another process: hot store is empty
    turns = session_turns(reader, thread)
    assert [t["question"] for t in turns] == ["pause", "what is a peak"]
    assert turns[0]["route"] == "fast" and turns[1]["answer"] and turns[0]["at_s"] == 42 and turns[0]["at"]
    assert reader.hot.get_tuple({"configurable": {"thread_id": thread, "checkpoint_ns": ""}}) is None
    assert session_turns(reader, str(uuid.uuid4())) == []
    reader.close()


# ------------------------------------------------------------------ PostgREST shapes
def supa(handler):
    s = Settings(_env_file=None, env="test", supabase_url="https://p.supabase.co", supabase_service_key="k")
    return SupabaseLibraryRepo(s, client=httpx.AsyncClient(transport=httpx.MockTransport(handler)))


def q(req):
    return {k: v[0] for k, v in parse_qs(urlsplit(str(req.url)).query).items()}


async def test_supabase_history_upsert_and_scoped_reads():
    seen = []

    def handler(req):
        seen.append(req)
        return httpx.Response(200, json=[] if req.method != "POST" else None)

    repo = supa(handler)
    await repo.upsert_history({"user_id": USER, "video_id": VID, "last_position_s": 1})
    await repo.list_history(USER)
    await repo.list_sessions(USER, since=datetime(2026, 9, 12, tzinfo=timezone.utc))
    await repo.note_counts(USER)
    up, lib, sess, notes = seen
    assert up.method == "POST" and q(up)["on_conflict"] == "user_id,video_id"
    assert up.headers["prefer"] == "resolution=merge-duplicates,return=minimal"
    assert json.loads(up.content)[0]["video_id"] == VID
    assert q(lib)["user_id"] == f"eq.{USER}" and q(lib)["select"].startswith("*,videos(")
    assert q(sess)["user_id"] == f"eq.{USER}" and q(sess)["started_at"].startswith("gte.2026-09-12")
    assert q(notes)["user_id"] == f"eq.{USER}" and q(notes)["select"] == "video_id"


# ------------------------------------------------------------------ API + WebSocket (anonymous, in memory)
def test_api_and_ws_heartbeat_fill_the_library(monkeypatch):
    from fastapi.testclient import TestClient

    from app.main import create_app

    monkeypatch.setattr(LB, "FLUSH_S", 60)
    with TestClient(create_app()) as c:
        with c.websocket_connect("/ws/session") as ws:
            ws.send_json({"type": "hello", "video_id": VID, "language": "en"})
            assert recv(ws)["type"] == "ready"
            ws.send_json({"type": "playback", "playback_s": 610, "max_watched_s": 640, "duration_s": 3202})
            ws.send_json({"type": "utterance", "turn_id": "t1", "text": "what is a peak", "playback_s": 650})
            assert recv(ws)["turn_id"] == "t1"
        # the socket closed → the resume point was flushed in the background
        for _ in range(50):
            lib = c.get("/api/library").json()["videos"]
            if lib:
                break
        assert (
            lib[0]["video_id"] == VID and lib[0]["last_position_s"] == 650 and lib[0]["max_watched_s"] == 640
        )
        assert c.get(f"/api/library/{VID}").json()["last_position_s"] == 650
        assert c.get("/api/library/bad!").status_code == 422

        chats = c.get("/api/chats").json()["sessions"]
        assert chats[0]["video_id"] == VID and chats[0]["turns"][0]["question"] == "what is a peak"

        dash = c.get("/api/dashboard").json()
        assert (
            dash["stats"]["videos"] == 1 and len(dash["days"]) == 7 and dash["recent"][0]["video_id"] == VID
        )

        assert c.delete(f"/api/library/{VID}").status_code == 204
        assert c.delete(f"/api/library/{VID}").status_code == 404
        assert c.get("/api/library").json()["videos"] == []


def test_anonymous_sessions_only_recorded_for_anonymous():
    s, repo = svc()
    s.record_anonymous_session("s1", USER, VID, "en")
    s.record_anonymous_session("s2", ANONYMOUS_ID, VID, "hi")
    assert list(repo.sessions) == ["s2"]
    assert asyncio.run(repo.list_sessions(ANONYMOUS_ID, since=datetime.now(timezone.utc) - timedelta(days=1)))
