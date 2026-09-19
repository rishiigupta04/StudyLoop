"""PostgREST request shapes for the Supabase repo (MockTransport; never the real project)."""

import json
from urllib.parse import parse_qs, urlsplit

import httpx

from app.config import Settings
from app.services.chunker import Chunk
from app.services.transcripts import Segment
from app.services.video_repo import SupabaseVideoRepo, _vector_literal, claimable, now_utc

VID = "aircAruvnKk"


def repo(handler, key="sb_secret_x"):
    s = Settings(_env_file=None, env="test", supabase_url="https://p.supabase.co", supabase_service_key=key)
    return SupabaseVideoRepo(s, client=httpx.AsyncClient(transport=httpx.MockTransport(handler)))


def q(req: httpx.Request) -> dict[str, str]:
    return {k: v[0] for k, v in parse_qs(urlsplit(str(req.url)).query).items()}


async def test_claim_is_one_conditional_update():
    seen = []

    def handler(req):
        seen.append(req)
        return httpx.Response(200, json=[{"video_id": VID}])

    assert await repo(handler).claim(VID) is True
    (req,) = seen
    params = q(req)
    assert req.method == "PATCH" and req.url.path == "/rest/v1/videos"
    assert params["video_id"] == f"eq.{VID}"
    cond = params["or"]
    assert cond.startswith("(ingest_status.eq.pending,and(ingest_status.eq.failed,updated_at.lt.")
    assert "ingest_status.in.(fetching,transcribing,embedding)" in cond
    assert json.loads(req.content)["ingest_status"] == "fetching"
    assert req.headers["prefer"] == "return=representation"
    assert req.headers["apikey"] == "sb_secret_x" and "authorization" not in req.headers


async def test_claim_lost_race_and_forced_retry():
    r = repo(lambda req: httpx.Response(200, json=[]))
    assert await r.claim(VID) is False
    forced = []
    await repo(lambda req: forced.append(req) or httpx.Response(200, json=[])).claim(VID, force=True)
    assert "ingest_status.eq.failed," in q(forced[0])["or"]


async def test_segments_paginate_past_postgrest_max_rows():
    def handler(req):
        off = int(q(req)["offset"])
        n = 1000 if off < 2000 else 7
        rows = [{"idx": off + i, "start_s": off + i, "duration_s": 1.0, "text": "t"} for i in range(n)]
        return httpx.Response(200, json=rows)

    segs = await repo(handler).get_segments(VID)
    assert len(segs) == 2007 and segs[-1].start == 2006


async def test_replace_chunks_deletes_then_inserts_vectors_in_batches():
    seen = []

    def handler(req):
        seen.append(req)
        return httpx.Response(204 if req.method == "DELETE" else 201)

    chunks = [Chunk(i, i * 50.0, i * 50.0 + 60, f"c{i}") for i in range(120)]
    await repo(handler).replace_chunks(VID, chunks, [[0.25, -1e-8]] * 120)
    assert [r.method for r in seen] == ["DELETE", "POST", "POST", "POST"]
    rows = json.loads(seen[1].content)
    assert len(rows) == 50 and rows[0]["embedding"] == "[0.25,-1e-08]" and rows[0]["end_s"] == 60.0


async def test_replace_segments_and_legacy_jwt_key():
    seen = []

    def handler(req):
        seen.append(req)
        return httpx.Response(201)

    await repo(handler, key="eyJlegacy").replace_segments(VID, [Segment("a", 0, 1), Segment("b", 1, 2)])
    assert seen[0].method == "DELETE" and seen[0].headers["authorization"] == "Bearer eyJlegacy"
    assert json.loads(seen[1].content)[1] == {
        "video_id": VID,
        "idx": 1,
        "start_s": 1,
        "duration_s": 2,
        "text": "b",
    }


def test_vector_literal():
    assert _vector_literal([1.0, 0.5, 0.0]) == "[1,0.5,0]"


def test_claimable_rules():
    from datetime import timedelta

    now = now_utc()
    old = now - timedelta(days=2)
    assert claimable({"ingest_status": "pending"}, now=now, force=False)
    assert not claimable({"ingest_status": "ready", "updated_at": old}, now=now, force=True)
    assert not claimable({"ingest_status": "failed", "updated_at": now}, now=now, force=False)
    assert claimable({"ingest_status": "failed", "updated_at": now}, now=now, force=True)
    assert not claimable({"ingest_status": "unavailable", "updated_at": now}, now=now, force=True)
    assert claimable({"ingest_status": "unavailable", "updated_at": old}, now=now, force=False)
    assert not claimable({"ingest_status": "embedding", "updated_at": now}, now=now, force=True)
    assert claimable({"ingest_status": "embedding", "updated_at": old.isoformat()}, now=now, force=False)
