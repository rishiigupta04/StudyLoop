import time

import jwt
from fastapi.testclient import TestClient

from app.api.videos import get_transcript_client
from app.config import Settings, get_settings
from app.main import create_app
from app.services.transcripts import TranscriptResult

SECRET = "x" * 40


def make_client(settings: Settings, fake_result=None) -> TestClient:
    app = create_app()
    app.dependency_overrides[get_settings] = lambda: settings

    class Fake:
        async def fetch(self, v):
            return fake_result or TranscriptResult(video_id=v, ok=False)

    app.dependency_overrides[get_transcript_client] = lambda: Fake()
    return TestClient(app)


def token(secret=SECRET, **claims):
    base = {"sub": "user-1", "aud": "authenticated", "exp": int(time.time()) + 60, "email": "a@b.c"}
    return jwt.encode({**base, **claims}, secret, algorithm="HS256")


def test_health_reports_config_without_leaking_values():
    c = make_client(Settings(_env_file=None, env="test", groq_api_key="gsk_secret"))
    body = c.get("/health").json()
    assert body["status"] == "ok" and body["configured"]["groq"] is True
    assert "gsk_secret" not in str(body)


def test_transcript_requires_auth_when_configured():
    c = make_client(Settings(_env_file=None, env="prod", supabase_jwt_secret=SECRET, require_auth=True))
    assert c.get("/api/videos/aircAruvnKk/transcript").status_code == 401
    bad = c.get(
        "/api/videos/aircAruvnKk/transcript", headers={"Authorization": f"Bearer {token('wrong' * 10)}"}
    )
    assert bad.status_code == 401
    good = c.get("/api/videos/aircAruvnKk/transcript", headers={"Authorization": f"Bearer {token()}"})
    assert good.status_code == 200 and good.json()["has_transcript"] is False


def test_expired_token_rejected():
    c = make_client(Settings(_env_file=None, env="prod", supabase_jwt_secret=SECRET, require_auth=True))
    t = token(exp=int(time.time()) - 10)
    assert c.get("/api/videos/x/transcript", headers={"Authorization": f"Bearer {t}"}).status_code == 401


def test_anonymous_allowed_until_require_auth():
    c = make_client(Settings(_env_file=None, env="prod", supabase_jwt_secret=SECRET))
    assert c.get("/api/videos/aircAruvnKk/transcript").status_code == 200
    # ...but a bad token is still rejected
    bad = c.get("/api/videos/x/transcript", headers={"Authorization": f"Bearer {token('wrong' * 10)}"})
    assert bad.status_code == 401


def test_settings_parse_comma_separated_origins(monkeypatch):
    monkeypatch.setenv("CORS_ORIGINS", "http://localhost:4028, https://studylooop.vercel.app")
    monkeypatch.setenv("CLASSIFIER", "regex")
    s = Settings(_env_file=None)
    assert s.cors_origins == ["http://localhost:4028", "https://studylooop.vercel.app"]


def test_settings_load_example_env_file():
    s = Settings(_env_file=".env.example")
    assert s.classifier == "regex" and len(s.cors_origins) == 2
