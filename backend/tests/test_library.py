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


class GatedRepo(CountingRepo):
    """A slow database: upsert_history blocks until `gate` is set (`started` says a write is on the wire)."""

    def __init__(self, **kw):
        super().__init__(**kw)
        self.gate = asyncio.Event()
        self.started = asyncio.Event()

    async def upsert_history(self, row):
        self.started.set()
        await self.gate.wait()
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


# ------------------------------------------------------------------ reads vs the write-behind (T2-01)
async def test_library_read_right_after_a_heartbeat_sees_the_row():
    s, repo = svc(flush_s=60)
    s.note_position(USER, VID, position_s=420, max_watched_s=640, duration_s=3200)
    assert repo.history == {}  # write-behind: nothing in the database yet
    (item,) = await s.library(USER)  # ...but opening the Library right now must not say "empty"
    assert (item["video_id"], item["last_position_s"], item["max_watched_s"]) == (VID, 420, 640)
    assert item["status"] == "in-progress"
    assert len(repo.writes) == 1 and s._dirty == {}


async def test_library_read_shows_the_current_position_not_the_stale_row():
    s, repo = svc(flush_s=60)
    await repo.upsert_history(
        {
            "user_id": USER,
            "video_id": VID,
            "last_position_s": 100,
            "max_watched_s": 100,
            "status": "in-progress",
        }
    )
    other = "22222222-2222-2222-2222-222222222222"
    s.note_position(USER, VID, position_s=500, max_watched_s=500)
    s.note_position(other, VID, position_s=50, max_watched_s=50)
    (item,) = await s.library(USER)
    assert item["last_position_s"] == 500
    assert (other, VID) in s._dirty  # a read flushes its own user's rows only
    assert all(w["user_id"] == USER for w in repo.writes)


async def test_library_read_waits_for_a_write_already_on_the_wire():
    repo = GatedRepo()
    s, _ = svc(repo, flush_s=60)
    s.note_position(USER, VID, position_s=420, max_watched_s=420)
    s.flush_soon(USER, VID)  # the socket just closed
    await repo.started.wait()  # the row left _dirty and is in flight: neither memory nor the DB has it
    assert s._dirty == {} and repo.history == {}
    read = asyncio.create_task(s.library(USER))
    await asyncio.sleep(0.05)
    assert not read.done()  # it waits instead of answering with an empty library
    repo.gate.set()
    (item,) = await asyncio.wait_for(read, 2)
    assert item["last_position_s"] == 420


async def test_two_readers_arriving_together_both_wait_for_the_same_write():
    repo = GatedRepo()
    s, _ = svc(repo, flush_s=60)
    s.note_position(USER, VID, position_s=420, max_watched_s=420)
    r1 = asyncio.create_task(s.library(USER))
    r2 = asyncio.create_task(s.library(USER))  # the same loop turn: the first flush task has not started yet
    await repo.started.wait()
    await asyncio.sleep(0.05)
    assert (
        not r1.done() and not r2.done()
    )  # a second reader must not slip past while the upsert is on the wire
    repo.gate.set()
    (a,), (b,) = await asyncio.wait_for(asyncio.gather(r1, r2), 2)
    assert a["last_position_s"] == b["last_position_s"] == 420


class _SlowFirstWrite(CountingRepo):
    """The first upsert is slow (and optionally fails); later ones go straight through."""

    def __init__(self, *, first_fails: bool = False):
        super().__init__()
        self.calls = 0
        self.first_fails = first_fails
        self.release_first = asyncio.Event()

    async def upsert_history(self, row):
        self.calls += 1
        if self.calls == 1:
            await self.release_first.wait()
            if self.first_fails:
                raise RuntimeError("db hiccup")
        await CountingRepo.upsert_history(self, row)


async def test_same_key_writes_land_in_order_even_when_the_older_one_is_slow():
    repo = _SlowFirstWrite()
    s, _ = svc(repo, flush_s=60)
    s.note_position(USER, VID, position_s=100, max_watched_s=100)
    s.flush_soon(USER, VID)
    while repo.calls < 1:  # the older write is on the wire and stuck
        await asyncio.sleep(0.01)
    s.note_position(USER, VID, position_s=500, max_watched_s=500)
    reader = asyncio.create_task(s.settle(USER))
    await asyncio.sleep(0.05)
    assert repo.calls == 1  # the newer write queues behind it instead of overtaking
    repo.release_first.set()
    await asyncio.wait_for(reader, 2)
    assert [w["last_position_s"] for w in repo.writes] == [100, 500]
    assert repo.history[(USER, VID)]["last_position_s"] == 500  # the older write did not land last


async def test_a_failed_older_write_does_not_put_its_stale_row_back_over_a_newer_one():
    repo = _SlowFirstWrite(first_fails=True)
    s, _ = svc(repo, flush_s=60)
    s.note_position(USER, VID, position_s=100, max_watched_s=100)
    s.flush_soon(USER, VID)
    while repo.calls < 1:
        await asyncio.sleep(0.01)
    s.note_position(USER, VID, position_s=500, max_watched_s=500)
    reader = asyncio.create_task(s.settle(USER))
    await asyncio.sleep(0.05)
    repo.release_first.set()  # the older write now fails
    await asyncio.wait_for(reader, 2)
    assert s._dirty == {}  # the stale 100 was not queued again behind the newer 500
    assert repo.history[(USER, VID)]["last_position_s"] == 500


async def test_a_later_session_never_lowers_the_stored_high_water_mark():
    s, repo = svc(flush_s=60)
    s.note_position(USER, VID, position_s=3000, max_watched_s=3000, duration_s=3200)
    await s.flush_all()
    # a new page load whose resume fetch failed starts its own mark near 0 (fresh service: nothing cached)
    s2, _ = svc(repo, flush_s=60)
    s2.note_position(USER, VID, position_s=20, max_watched_s=20, duration_s=3200)
    await s2.flush_all()
    row = repo.history[(USER, VID)]
    assert row["max_watched_s"] == 3000  # what the learner has seen never goes down
    assert row["status"] == "completed"
    assert row["last_position_s"] == 20  # the place IS where they are now


async def test_removing_a_video_resets_the_floor_so_a_rewatch_starts_fresh():
    s, repo = svc(flush_s=60)
    s.note_position(USER, VID, position_s=3000, max_watched_s=3000, duration_s=3200)
    await s.flush_all()
    await s.remove(USER, VID)
    s.note_position(USER, VID, position_s=20, max_watched_s=20, duration_s=3200)
    await s.flush_all()
    assert repo.history[(USER, VID)]["max_watched_s"] == 20


async def test_a_heartbeat_without_a_position_is_not_a_position():
    from app.ws import _note_position

    s = LibraryService(InMemoryLibraryRepo())
    LB.set_library_service(s)  # conftest resets it after every test
    session = {"user_id": USER, "video_id": VID, "max_watched_s": 0.0}
    _note_position(session, {"type": "utterance", "text": "pause"})  # sent before the player was placed
    assert s._dirty == {}
    _note_position(session, {"type": "playback", "playback_s": 42, "max_watched_s": 42})
    assert s._dirty[(USER, VID)]["last_position_s"] == 42  # a real position still counts


async def test_library_read_gives_up_on_a_hung_write_without_cancelling_it(monkeypatch):
    monkeypatch.setattr(LB, "READ_FLUSH_WAIT_S", 0.05)
    repo = GatedRepo()
    s, _ = svc(repo, flush_s=60)
    s.note_position(USER, VID, position_s=420, max_watched_s=420)
    loop = asyncio.get_running_loop()
    t0 = loop.time()
    assert await s.library(USER) == []  # a slow database does not hang the page
    assert loop.time() - t0 < 1
    repo.gate.set()  # the bounded wait did not cancel the upsert: it still lands
    await asyncio.wait_for(s.settle(USER), 2)
    assert repo.history[(USER, VID)]["last_position_s"] == 420


async def test_a_failed_write_does_not_break_the_read_and_stays_pending():
    class FlakyOnce(CountingRepo):
        fail = True

        async def upsert_history(self, row):
            if self.fail:
                self.fail = False
                raise LB.LibraryError("HTTP 503")
            await super().upsert_history(row)

    s, _ = svc(FlakyOnce(), flush_s=60)
    s.note_position(USER, VID, position_s=50, max_watched_s=50)
    assert await s.library(USER) == []
    assert (USER, VID) in s._dirty  # kept for the next flush
    assert [i["last_position_s"] for i in await s.library(USER)] == [50]


async def test_dashboard_and_chats_settle_pending_history_too():
    s, repo = svc(flush_s=60)
    s.note_position(USER, VID, position_s=420, max_watched_s=640, duration_s=3200)
    dash = await s.dashboard(USER)
    assert dash["stats"]["videos"] == 1 and dash["recent"][0]["last_position_s"] == 420
    s.note_position(USER, "aircAruvnKk", position_s=10, max_watched_s=10)
    assert await s.chats(USER) == []  # no sessions here, but the read still flushed the history
    assert (USER, "aircAruvnKk") in repo.history


async def test_resume_waits_for_a_write_already_on_the_wire():
    repo = GatedRepo()
    s, _ = svc(repo, flush_s=60)
    repo.gate.set()
    await repo.upsert_history(
        {
            "user_id": USER,
            "video_id": VID,
            "last_position_s": 100,
            "max_watched_s": 100,
            "status": "in-progress",
        }
    )
    repo.gate.clear()
    repo.started.clear()
    s.note_position(USER, VID, position_s=500, max_watched_s=500)
    s.flush_soon(USER, VID)
    await repo.started.wait()
    got = asyncio.create_task(s.resume(USER, VID))
    await asyncio.sleep(0.05)
    assert not got.done()  # the stale row (100) is not what it answers with
    repo.gate.set()
    assert (await asyncio.wait_for(got, 2))["last_position_s"] == 500


# ------------------------------------------------------------------ remove vs pending writes (T2-15, backend half)
async def test_remove_waits_for_a_write_on_the_wire_so_the_row_is_not_recreated():
    repo = GatedRepo()
    s, _ = svc(repo, flush_s=60)
    s.note_position(USER, VID, position_s=420, max_watched_s=420)
    s.flush_soon(USER, VID)
    await repo.started.wait()
    removal = asyncio.create_task(s.remove(USER, VID))
    await asyncio.sleep(0.05)
    assert not removal.done()  # the delete queues behind the write
    repo.gate.set()
    assert await asyncio.wait_for(removal, 2) is True
    assert repo.history == {}  # the delete landed last


async def test_remove_after_a_scheduled_flush_leaves_no_row():
    s, repo = svc(flush_s=60)
    s.note_position(USER, VID, position_s=420, max_watched_s=420)
    task = s.flush_soon(USER, VID)  # registered as in flight the moment it is called, though not yet run
    await s.remove(USER, VID)  # waits for that write, then deletes: the video must not come back
    await task
    assert repo.history == {} and s._dirty == {}


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


def test_library_endpoints_need_no_polling_after_the_socket_closes():
    from fastapi.testclient import TestClient

    from app.main import create_app

    with TestClient(create_app()) as c:
        with c.websocket_connect("/ws/session") as ws:
            ws.send_json({"type": "hello", "video_id": VID, "language": "en"})
            assert recv(ws)["type"] == "ready"
            ws.send_json({"type": "playback", "playback_s": 610, "max_watched_s": 640, "duration_s": 3202})
            ws.send_json({"type": "utterance", "turn_id": "t1", "text": "what is a peak", "playback_s": 650})
            assert recv(ws)["turn_id"] == "t1"
        # the very first read after leaving the study page: no retry loop
        lib = c.get("/api/library").json()["videos"]
        assert lib and lib[0]["video_id"] == VID and lib[0]["last_position_s"] == 650
        assert c.get("/api/dashboard").json()["stats"]["videos"] == 1


def test_anonymous_sessions_only_recorded_for_anonymous():
    s, repo = svc()
    s.record_anonymous_session("s1", USER, VID, "en")
    s.record_anonymous_session("s2", ANONYMOUS_ID, VID, "hi")
    assert list(repo.sessions) == ["s2"]
    assert asyncio.run(repo.list_sessions(ANONYMOUS_ID, since=datetime.now(timezone.utc) - timedelta(days=1)))
