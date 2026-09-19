import time

import jwt
from fastapi.testclient import TestClient

from app.config import Settings, get_settings
from app.main import create_app

SECRET = "y" * 40


def client(settings: Settings | None = None) -> TestClient:
    app = create_app()
    if settings is not None:
        app.dependency_overrides[get_settings] = lambda: settings
        import app.ws as ws_mod

        ws_mod.get_settings = lambda: settings  # websocket route reads settings directly
    return TestClient(app)


def test_session_roundtrip():
    c = client()
    with c.websocket_connect("/ws/session") as ws:
        ws.send_json({"type": "hello", "video_id": "HtSuA80QTyo", "language": "en"})
        ready = ws.receive_json()
        assert ready["type"] == "ready" and ready["session_id"]

        ws.send_json({"type": "utterance", "turn_id": "t1", "text": "go back 30 seconds", "playback_s": 120})
        msg = ws.receive_json()
        assert msg["type"] == "action" and msg["turn_id"] == "t1"
        assert msg["action"] == {"type": "SEEK_RELATIVE", "delta_s": -30.0}
        assert msg["message"] == "Back 30s" and msg["timings"]["server_total"] < 150

        ws.send_json({"type": "utterance", "turn_id": "t2", "text": "क्या मतलब है", "language": "hi"})
        msg = ws.receive_json()
        assert msg["type"] == "answer.done" and msg["route"] == "rag"
        assert msg["normalized_text"] == "kya matlab hai"

        ws.send_json({"type": "ping"})
        assert ws.receive_json() == {"type": "pong"}

        ws.send_json({"type": "utterance", "turn_id": "t3", "text": "   "})
        assert ws.receive_json()["code"] == "empty"


def test_bad_hello_rejected():
    c = client()
    with c.websocket_connect("/ws/session") as ws:
        ws.send_json({"type": "utterance", "text": "pause"})
        assert ws.receive_json()["code"] == "bad_hello"


def test_ws_auth_when_required():
    s = Settings(_env_file=None, env="prod", supabase_jwt_secret=SECRET, require_auth=True)
    c = client(s)
    with c.websocket_connect("/ws/session") as ws:
        ws.send_json({"type": "hello", "video_id": "x"})
        assert ws.receive_json()["code"] == "unauthorized"
    tok = jwt.encode(
        {"sub": "u1", "aud": "authenticated", "exp": int(time.time()) + 60}, SECRET, algorithm="HS256"
    )
    with c.websocket_connect("/ws/session") as ws:
        ws.send_json({"type": "hello", "video_id": "x", "token": tok})
        assert ws.receive_json()["type"] == "ready"
