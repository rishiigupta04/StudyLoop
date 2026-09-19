import time

import jwt
from fastapi.testclient import TestClient

from app.config import Settings, get_settings
from app.main import create_app
from tests.conftest import recv

SECRET = "y" * 40


def client(settings: Settings | None = None) -> TestClient:
    app = create_app()
    import app.ws as ws_mod

    # the websocket route reads settings directly; always reset so one test's settings don't leak
    ws_mod.get_settings = (lambda: settings) if settings is not None else get_settings
    if settings is not None:
        app.dependency_overrides[get_settings] = lambda: settings
    return TestClient(app)


def test_session_roundtrip():
    c = client()
    with c.websocket_connect("/ws/session") as ws:
        ws.send_json({"type": "hello", "video_id": "HtSuA80QTyo", "language": "en"})
        ready = recv(ws)
        assert ready["type"] == "ready" and ready["session_id"]

        ws.send_json({"type": "utterance", "turn_id": "t1", "text": "go back 30 seconds", "playback_s": 120})
        msg = recv(ws)
        assert msg["type"] == "action" and msg["turn_id"] == "t1"
        assert msg["action"] == {"type": "SEEK_RELATIVE", "delta_s": -30.0}
        assert msg["message"] == "Back 30s" and msg["timings"]["server_total"] < 150

        ws.send_json({"type": "utterance", "turn_id": "t2", "text": "क्या मतलब है", "language": "hi"})
        msg = recv(ws)
        assert msg["type"] == "answer.done" and msg["route"] == "rag"
        assert msg["normalized_text"] == "kya matlab hai"

        ws.send_json({"type": "ping"})
        assert recv(ws) == {"type": "pong"}

        ws.send_json({"type": "utterance", "turn_id": "t3", "text": "   "})
        assert recv(ws)["code"] == "empty"


def test_bad_hello_rejected():
    c = client()
    with c.websocket_connect("/ws/session") as ws:
        ws.send_json({"type": "utterance", "text": "pause"})
        assert recv(ws)["code"] == "bad_hello"


def test_ws_auth_when_required():
    s = Settings(_env_file=None, env="prod", supabase_jwt_secret=SECRET, require_auth=True)
    c = client(s)
    with c.websocket_connect("/ws/session") as ws:
        ws.send_json({"type": "hello", "video_id": "x"})
        assert recv(ws)["code"] == "unauthorized"
    tok = jwt.encode(
        {"sub": "u1", "aud": "authenticated", "exp": int(time.time()) + 60}, SECRET, algorithm="HS256"
    )
    with c.websocket_connect("/ws/session") as ws:
        ws.send_json({"type": "hello", "video_id": "x", "token": tok})
        assert recv(ws)["type"] == "ready"


def _fake_ingest(result):
    from app.services.ingest import IngestService, set_ingest_service
    from app.services.video_repo import InMemoryVideoRepo

    class T:
        calls = 0

        async def fetch(self, vid):
            T.calls += 1
            return result

    svc = IngestService(InMemoryVideoRepo(), T(), [], retry_backoff_s=0)
    set_ingest_service(svc)
    return svc, T


def test_video_status_streams_after_ready():
    from app.services.transcripts import Segment, TranscriptResult

    _, T = _fake_ingest(
        TranscriptResult(video_id="HtSuA80QTyo", ok=True, language="en", segments=[Segment("hi", 0, 3)])
    )
    with client().websocket_connect("/ws/session") as ws:
        ws.send_json({"type": "hello", "video_id": "HtSuA80QTyo", "language": "en"})
        assert ws.receive_json()["type"] == "ready"
        statuses = []
        while not statuses or statuses[-1]["status"] != "ready":
            msg = ws.receive_json()
            assert msg["type"] == "video.status"
            statuses.append(msg)
        assert statuses[0]["status"] == "fetching" and statuses[-1]["has_transcript"] is True
        assert [s["status"] for s in statuses].count("fetching") == 1  # duplicates suppressed

        ws.send_json({"type": "utterance", "turn_id": "t1", "text": "what is gradient descent"})
        answer = recv(ws)  # transcript ready → the real Q&A path runs (no LLM in hermetic tests)
        assert answer["route"] == "rag" and "isn't set up" in answer["text"] and answer["citations"] == []
    assert T.calls == 1


def test_unavailable_video_still_plays_and_names_reason():
    from app.services.transcripts import FailReason, TranscriptResult

    _fake_ingest(TranscriptResult(video_id="HtSuA80QTyo", ok=False, fail_reason=FailReason.UNAVAILABLE))
    with client().websocket_connect("/ws/session") as ws:
        ws.send_json({"type": "hello", "video_id": "HtSuA80QTyo", "language": "hi"})
        assert ws.receive_json()["type"] == "ready"
        msg = ws.receive_json()
        while msg["status"] != "unavailable":
            msg = ws.receive_json()
        assert msg["fail_reason"] == "unavailable" and msg["retryable"] is False

        ws.send_json({"type": "utterance", "turn_id": "t1", "text": "रुको", "language": "hi"})
        assert recv(ws)["action"] == {"type": "PAUSE"}  # playback voice control keeps working
        ws.send_json({"type": "utterance", "turn_id": "t2", "text": "yeh kya hai", "language": "hi"})
        answer = recv(ws)
        assert answer["route"] == "rag" and "private" in answer["text"]


def _streaming_setup(answer="Gradients flow backwards [15:00].", delay=0.0):
    import asyncio as _asyncio

    from app.services.ingest import IngestService, set_ingest_service
    from app.services.llm import set_llm
    from app.services.retrieval import Retriever, set_retriever
    from tests.test_rag import FakeLLM, KeywordEmbedder, repo_with_lecture

    repo = repo_with_lecture()
    set_ingest_service(IngestService(repo, None, []))  # video already ready: no fetch

    class SlowLLM(FakeLLM):
        async def stream(self, messages, *, on_delta=None, is_cancelled=None, max_tokens=400):
            async def slow(d):
                await _asyncio.sleep(delay)
                await on_delta(d)

            return await super().stream(messages, on_delta=slow, is_cancelled=is_cancelled)

    set_retriever(Retriever(repo, [KeywordEmbedder()]))
    set_llm(SlowLLM(answer=answer))


def _hello(ws, video="lecture0001"):
    ws.send_json({"type": "hello", "video_id": video, "language": "en"})
    assert ws.receive_json()["type"] == "ready"
    assert ws.receive_json()["status"] == "ready"


def test_answer_streams_deltas_then_done_with_citations():
    _streaming_setup()
    with client().websocket_connect("/ws/session") as ws:
        _hello(ws)
        ws.send_json(
            {"type": "utterance", "turn_id": "q1", "text": "how does backprop work", "max_watched_s": 960}
        )
        deltas = []
        while True:
            msg = ws.receive_json()
            if msg["type"] != "answer.delta":
                break
            assert msg["turn_id"] == "q1"
            deltas.append(msg["text"])
        assert msg["type"] == "answer.done" and msg["route"] == "rag" and msg["cancelled"] is False
        assert "".join(deltas) == msg["text"] == "Gradients flow backwards [15:00]."
        assert msg["citations"] == [{"start_s": 900.0}]

        # the spoiler rule end-to-end: a fresh session that has only watched to 12:00
    with client().websocket_connect("/ws/session") as ws:
        _hello(ws)
        ws.send_json(
            {"type": "utterance", "turn_id": "q2", "text": "how does backprop work", "max_watched_s": 720}
        )
        msg = ws.receive_json()
        assert msg["type"] == "answer.done" and "hasn't covered" in msg["text"]


def test_turn_cancel_stops_the_stream():
    _streaming_setup(answer=" ".join(f"w{i}" for i in range(60)), delay=0.02)
    with client().websocket_connect("/ws/session") as ws:
        _hello(ws)
        ws.send_json(
            {"type": "utterance", "turn_id": "q1", "text": "explain recursion", "max_watched_s": 700}
        )
        assert ws.receive_json()["type"] == "answer.delta"
        ws.send_json({"type": "turn.cancel", "turn_id": "q1"})
        msg = ws.receive_json()
        while msg["type"] == "answer.delta":
            msg = ws.receive_json()
        assert msg["type"] == "answer.done" and msg["cancelled"] is True
        assert len(msg["text"].split()) < 60  # stopped early


def test_new_command_barges_in_on_a_streaming_answer():
    _streaming_setup(answer=" ".join(f"w{i}" for i in range(60)), delay=0.02)
    with client().websocket_connect("/ws/session") as ws:
        _hello(ws)
        ws.send_json(
            {"type": "utterance", "turn_id": "q1", "text": "explain recursion", "max_watched_s": 700}
        )
        assert ws.receive_json()["type"] == "answer.delta"
        ws.send_json({"type": "utterance", "turn_id": "p1", "text": "pause"})
        msgs = []
        while not msgs or msgs[-1].get("turn_id") != "p1":
            msgs.append(ws.receive_json())
        done = next(m for m in msgs if m["type"] == "answer.done")
        assert done["turn_id"] == "q1" and done["cancelled"] is True
        assert msgs[-1]["type"] == "action" and msgs[-1]["action"] == {"type": "PAUSE"}


def test_spoiler_guard_reaches_the_graph_and_sticks(monkeypatch):
    import app.ws as ws_mod

    seen = []
    real = ws_mod.new_turn_input

    def spy(**fields):
        seen.append(fields["spoiler_guard"])
        return real(**fields)

    monkeypatch.setattr(ws_mod, "new_turn_input", spy)
    c = client()
    with c.websocket_connect("/ws/session") as ws:
        ws.send_json({"type": "hello", "video_id": "HtSuA80QTyo", "spoiler_guard": False})
        recv(ws)
        for i, extra in enumerate([{}, {"spoiler_guard": True}, {}, {"spoiler_guard": "no"}]):
            ws.send_json({"type": "utterance", "turn_id": f"g{i}", "text": "pause", **extra})
            recv(ws)
    assert seen == [False, True, True, True]  # hello sets it; an utterance's bool wins and sticks
