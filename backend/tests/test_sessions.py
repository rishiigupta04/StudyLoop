"""Tier 0b: signed-in sessions are recorded in study_sessions; nothing about it can break voice control."""

import json
import time
import uuid

import httpx
import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import ec
from fastapi.testclient import TestClient

import app.auth as auth_mod
import app.ws as ws_mod
from app.auth import resolve_user
from app.config import Settings, get_settings
from app.main import create_app
from app.services.sessions import SupabaseSessionStore, valid_session_id

SECRET = "z" * 40


# ---------------------------------------------------------------- PostgREST writer
def make_store(key="sb_secret_abc", status=201):
    calls: list[httpx.Request] = []

    def handler(req: httpx.Request) -> httpx.Response:
        calls.append(req)
        return httpx.Response(status, text="" if status < 400 else '{"message":"boom"}')

    settings = Settings(_env_file=None, supabase_url="https://p.supabase.co", supabase_service_key=key)
    store = SupabaseSessionStore(settings, client=httpx.AsyncClient(transport=httpx.MockTransport(handler)))
    return store, calls


async def test_start_inserts_parents_then_session_without_overwriting():
    store, calls = make_store()
    sid = str(uuid.uuid4())
    await store.start(session_id=sid, user_id="u-1", email="a@b.c", video_id="HtSuA80QTyo", language="hi")
    assert [c.url.path for c in calls] == [
        "/rest/v1/profiles",
        "/rest/v1/videos",
        "/rest/v1/study_sessions",
    ]
    for c in calls:
        assert c.method == "POST" and "ignore-duplicates" in c.headers["prefer"]
        assert c.headers["apikey"] == "sb_secret_abc" and "authorization" not in c.headers
    assert json.loads(calls[2].content) == [
        {"session_id": sid, "user_id": "u-1", "video_id": "HtSuA80QTyo", "language": "hi"}
    ]


async def test_legacy_service_role_jwt_is_also_sent_as_bearer():
    store, calls = make_store(key="eyJlegacy")
    await store.start(session_id="s", user_id="u", email=None, video_id="HtSuA80QTyo", language="en")
    assert calls[0].headers["authorization"] == "Bearer eyJlegacy"


async def test_end_updates_only_the_owners_row():
    store, calls = make_store(status=204)
    await store.end(session_id="s-1", user_id="u-1", max_watched_s=321.5, language="en")
    (req,) = calls
    assert req.method == "PATCH" and req.url.params["session_id"] == "eq.s-1"
    assert req.url.params["user_id"] == "eq.u-1"
    assert json.loads(req.content)["max_watched_s"] == 321.5


async def test_database_errors_are_swallowed():
    store, calls = make_store(status=500)
    await store.start(session_id="s", user_id="u", email=None, video_id="HtSuA80QTyo", language="en")
    await store.end(session_id="s", user_id="u", max_watched_s=0, language="en")
    assert len(calls) == 2  # start stopped at the first failure; end still attempted


async def test_odd_video_ids_are_not_written():
    store, calls = make_store()
    await store.start(session_id="s", user_id="u", email=None, video_id="../../etc", language="en")
    assert calls == []


def test_session_id_must_be_a_uuid():
    good = str(uuid.uuid4())
    assert valid_session_id(good) == good
    assert valid_session_id("not-a-uuid") != "not-a-uuid"
    uuid.UUID(valid_session_id(None))


# ---------------------------------------------------------------- WebSocket wiring
class FakeStore:
    def __init__(self, fail=False):
        self.starts: list[dict] = []
        self.ends: list[dict] = []
        self.fail = fail

    async def start(self, **kw):
        if self.fail:
            raise RuntimeError("db down")
        self.starts.append(kw)

    async def end(self, **kw):
        self.ends.append(kw)


@pytest.fixture
def ws_client(monkeypatch):
    def make(store, require_auth=False):
        s = Settings(_env_file=None, env="prod", supabase_jwt_secret=SECRET, require_auth=require_auth)
        app = create_app()
        app.dependency_overrides[get_settings] = lambda: s
        monkeypatch.setattr(ws_mod, "get_settings", lambda: s)
        monkeypatch.setattr(ws_mod, "get_session_store", lambda _s: store)
        return TestClient(app)

    return make


def token(sub="user-7", email="s@x.in"):
    claims = {"sub": sub, "email": email, "aud": "authenticated", "exp": int(time.time()) + 60}
    return jwt.encode(claims, SECRET, algorithm="HS256")


def test_signed_in_session_is_recorded_and_closed(ws_client):
    store = FakeStore()
    sid = str(uuid.uuid4())
    with ws_client(store).websocket_connect("/ws/session") as ws:
        ws.send_json({"type": "hello", "video_id": "HtSuA80QTyo", "session_id": sid, "token": token()})
        assert ws.receive_json() == {"type": "ready", "session_id": sid, "classifier": "regex"}
        ws.send_json({"type": "playback", "playback_s": 90, "max_watched_s": 95})
        ws.send_json({"type": "utterance", "turn_id": "t1", "text": "pause"})
        assert ws.receive_json()["action"] == {"type": "PAUSE"}
    assert store.starts == [
        {
            "session_id": sid,
            "user_id": "user-7",
            "email": "s@x.in",
            "video_id": "HtSuA80QTyo",
            "language": "en",
        }
    ]
    assert store.ends == [{"session_id": sid, "user_id": "user-7", "max_watched_s": 95.0, "language": "en"}]


def test_anonymous_sessions_are_not_recorded(ws_client):
    store = FakeStore()
    with ws_client(store).websocket_connect("/ws/session") as ws:
        ws.send_json({"type": "hello", "video_id": "HtSuA80QTyo"})
        assert ws.receive_json()["type"] == "ready"
    assert store.starts == [] and store.ends == []


def test_bad_client_session_id_is_replaced(ws_client):
    with ws_client(FakeStore()).websocket_connect("/ws/session") as ws:
        ws.send_json({"type": "hello", "video_id": "HtSuA80QTyo", "session_id": "abc", "token": token()})
        uuid.UUID(ws.receive_json()["session_id"])


def test_database_failure_never_breaks_voice(ws_client):
    with ws_client(FakeStore(fail=True)).websocket_connect("/ws/session") as ws:
        ws.send_json({"type": "hello", "video_id": "HtSuA80QTyo", "token": token()})
        assert ws.receive_json()["type"] == "ready"
        ws.send_json({"type": "utterance", "turn_id": "t1", "text": "go back 10 seconds"})
        assert ws.receive_json()["type"] == "action"


def test_require_auth_rejects_missing_and_forged_tokens(ws_client):
    c = ws_client(FakeStore(), require_auth=True)
    for tok in (None, jwt.encode({"sub": "x", "aud": "authenticated"}, "forged" * 8, algorithm="HS256")):
        with c.websocket_connect("/ws/session") as ws:
            ws.send_json({"type": "hello", "video_id": "HtSuA80QTyo", "token": tok})
            assert ws.receive_json()["code"] == "unauthorized"


# ---------------------------------------------------------------- ES256 via JWKS (how this project signs)
def test_es256_tokens_verified_against_project_keys(monkeypatch):
    key = ec.generate_private_key(ec.SECP256R1())
    other = ec.generate_private_key(ec.SECP256R1())

    class FakeJwks:
        def get_signing_key_from_jwt(self, _token):
            return type("K", (), {"key": key.public_key()})()

    monkeypatch.setattr(auth_mod, "_jwks_client", lambda _url: FakeJwks())
    s = Settings(_env_file=None, supabase_url="https://p.supabase.co", require_auth=True)
    claims = {"sub": "u-es", "email": "e@s.in", "aud": "authenticated", "exp": int(time.time()) + 60}
    good = jwt.encode(claims, key, algorithm="ES256", headers={"kid": "k1"})
    assert resolve_user(good, s).id == "u-es"

    from fastapi import HTTPException

    for bad in (
        jwt.encode(claims, other, algorithm="ES256", headers={"kid": "k1"}),  # wrong key
        jwt.encode(
            {**claims, "aud": "anon"}, key, algorithm="ES256", headers={"kid": "k1"}
        ),  # wrong audience
        jwt.encode({**claims, "exp": int(time.time()) - 5}, key, algorithm="ES256", headers={"kid": "k1"}),
    ):
        with pytest.raises(HTTPException):
            resolve_user(bad, s)
