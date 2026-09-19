import json

import httpx
import pytest

from app.config import Settings
from app.orchestration.checkpointer import fix_database_url, init_checkpointer
from app.services import llm as L


@pytest.fixture(autouse=True)
def no_sleep(monkeypatch):
    async def instant(_s):
        return None

    monkeypatch.setattr(L.asyncio, "sleep", instant)


def sse(*pieces, done=True):
    lines = [f"data: {json.dumps({'choices': [{'delta': {'content': p}}]})}" for p in pieces]
    return "\n\n".join(lines + (["data: [DONE]"] if done else [])) + "\n\n"


def client(handler, providers=("groq", "gemini")):
    settings = Settings(_env_file=None, env="test", groq_api_key="gk", gemini_api_key="mk")
    ps = [p for p in L.providers_from(settings) if p.name in providers]
    return L.LLMClient(ps, http=httpx.AsyncClient(transport=httpx.MockTransport(handler)))


async def test_stream_parses_sse_and_emits_deltas():
    seen = []

    def handler(req):
        body = json.loads(req.content)
        assert req.headers["authorization"] == "Bearer gk" and body["stream"] is True
        assert body["model"] == "openai/gpt-oss-120b"
        assert body["reasoning_effort"] == "low" and body["max_tokens"] > 400  # reasoning headroom
        return httpx.Response(200, text=sse("Hel", "lo", " [1:00]"))

    async def on_delta(d):
        seen.append(d)

    text = await client(handler).stream([{"role": "user", "content": "hi"}], on_delta=on_delta)
    assert text == "Hello [1:00]" and seen == ["Hel", "lo", " [1:00]"]


async def test_stream_retries_then_falls_back_to_gemini():
    calls = []

    def handler(req):
        calls.append(req.url.host)
        if "groq" in req.url.host:
            return httpx.Response(429, text="rate limited")
        return httpx.Response(200, text=sse("ok"))

    assert await client(handler).stream([]) == "ok"
    assert calls == ["api.groq.com", "api.groq.com", "generativelanguage.googleapis.com"]


async def test_stream_auth_error_skips_retry():
    calls = []

    def handler(req):
        calls.append(req.url.host)
        return httpx.Response(401, text="bad key")

    with pytest.raises(L.LLMError, match="401"):
        await client(handler).stream([])
    assert calls == ["api.groq.com", "generativelanguage.googleapis.com"]


async def test_stream_cancelled_mid_answer():
    flag = {"cancel": False}

    async def on_delta(d):
        flag["cancel"] = True  # user barges in after the first token

    text = await client(lambda r: httpx.Response(200, text=sse("a", "b", "c"))).stream(
        [], on_delta=on_delta, is_cancelled=lambda: flag["cancel"]
    )
    assert text == "a"


async def test_stream_failure_after_partial_answer_is_not_restarted():
    class Broken(httpx.AsyncByteStream):
        async def __aiter__(self):
            yield sse("partial", done=False).encode()
            raise httpx.ReadError("connection reset")

    calls = []

    def handler(req):
        calls.append(req.url.host)
        return httpx.Response(200, stream=Broken())

    with pytest.raises(L.LLMError):
        await client(handler).stream([])
    assert calls == ["api.groq.com"]  # never re-asks Gemini to start the answer over


async def test_tools_returns_message_and_uses_router_model():
    def handler(req):
        body = json.loads(req.content)
        assert body["tools"] and body["tool_choice"] == "auto" and body["temperature"] == 0
        assert body["model"] == "openai/gpt-oss-20b"
        msg = {"content": None, "tool_calls": [{"function": {"name": "summarize", "arguments": "{}"}}]}
        return httpx.Response(200, json={"choices": [{"message": msg}]})

    msg = await client(handler, providers=("groq",)).tools([], [{"type": "function"}])
    assert msg["tool_calls"][0]["function"]["name"] == "summarize"


async def test_unconfigured():
    c = L.LLMClient([])
    assert not c.configured
    with pytest.raises(L.LLMError, match="no LLM provider"):
        await c.stream([])


# ---------------------------------------------------------------- checkpointer config
@pytest.mark.parametrize(
    "url,expected",
    [
        (
            "postgresql://postgres:p@ss@db.x.supabase.co:5432/postgres",
            "postgresql://postgres:p%40ss@db.x.supabase.co:5432/postgres",
        ),
        (
            "postgresql://postgres:p%40ss@db.x.supabase.co:5432/postgres",
            "postgresql://postgres:p%40ss@db.x.supabase.co:5432/postgres",
        ),
        (
            "postgresql://u:a:b/c@h:6543/postgres?sslmode=require",
            "postgresql://u:a%3Ab%2Fc@h:6543/postgres?sslmode=require",
        ),
        ("postgresql://u@h/db", "postgresql://u@h/db"),
        ("not a url", "not a url"),
    ],
)
def test_fix_database_url(url, expected):
    assert fix_database_url(url) == expected


def test_checkpointer_falls_back_to_memory():
    from langgraph.checkpoint.memory import MemorySaver

    saver, desc = init_checkpointer(Settings(_env_file=None, env="test"))
    assert isinstance(saver, MemorySaver) and desc == "memory"
    saver, desc = init_checkpointer(Settings(_env_file=None, env="test", checkpointer="postgres"))
    assert isinstance(saver, MemorySaver) and "no DATABASE_URL" in desc
    bad = Settings(
        _env_file=None,
        env="test",
        checkpointer="postgres",
        database_url="postgresql://u:p@127.0.0.1:1/db?connect_timeout=1",
    )
    saver, desc = init_checkpointer(bad, timeout_s=1.5)
    assert isinstance(saver, MemorySaver) and "postgres failed" in desc
