import math

import httpx
import pytest

from app.config import Settings
from app.services import embedder as E


def hf(handler, **kw):
    s = Settings(_env_file=None, hf_token="hf-test", env="test", **kw)
    return E.HFInferenceEmbedder(
        s, http=httpx.AsyncClient(transport=httpx.MockTransport(handler)), batch_size=2
    )


@pytest.fixture(autouse=True)
def no_sleep(monkeypatch):
    async def instant(_s):
        return None

    monkeypatch.setattr(E.asyncio, "sleep", instant)


async def test_hf_batches_normalizes_and_authenticates():
    calls = []

    def handler(req: httpx.Request):
        calls.append(req)
        assert req.headers["authorization"] == "Bearer hf-test"
        assert req.url.path.endswith("/models/BAAI/bge-m3/pipeline/feature-extraction")
        n = len(__import__("json").loads(req.content)["inputs"])
        return httpx.Response(200, json=[[3.0, 4.0] + [0.0] * 1022] * n)

    vecs = await hf(handler).embed(["a", "b", "c"], kind="passage")
    assert len(calls) == 2 and len(vecs) == 3  # batch_size=2
    assert vecs[0][:2] == pytest.approx([0.6, 0.8]) and math.isclose(sum(x * x for x in vecs[0]), 1.0)


async def test_hf_token_level_output_uses_cls():
    def handler(req):
        return httpx.Response(200, json=[[[1.0] + [0.0] * 1023, [0.0, 1.0] + [0.0] * 1022]])

    (v,) = await hf(handler).embed(["a"], kind="query")
    assert v[0] == 1.0 and v[1] == 0.0


async def test_hf_retries_cold_start_then_succeeds():
    codes = iter([503, 503, 200])

    def handler(req):
        c = next(codes)
        return httpx.Response(c, json=[[0.0] * 1023 + [1.0]] if c == 200 else {"error": "loading"})

    assert len(await hf(handler).embed(["a"], kind="passage")) == 1


async def test_hf_permanent_error_and_bad_dim_raise():
    with pytest.raises(E.EmbedError, match="401"):
        await hf(lambda r: httpx.Response(401, text="bad token")).embed(["a"], kind="passage")
    with pytest.raises(E.EmbedError, match="dim 3"):
        await hf(lambda r: httpx.Response(200, json=[[1, 2, 3]])).embed(["a"], kind="passage")


class Fake:
    def __init__(self, model, dim, fail=False):
        self.model, self.dim, self.fail = model, dim, fail

    async def embed(self, texts, *, kind):
        if self.fail:
            raise E.EmbedError("down")
        return [[1.0] * self.dim for _ in texts]


async def test_chain_falls_back_and_pads_to_column():
    model, dim, vecs = await E.embed_passages([Fake("bge", 1024, fail=True), Fake("e5", 384)], ["x", "y"])
    assert (model, dim) == ("e5", 384)
    assert all(len(v) == E.STORE_DIM for v in vecs) and vecs[0][384:] == [0.0] * 640


async def test_chain_all_fail_or_empty():
    with pytest.raises(E.EmbedError, match="down"):
        await E.embed_passages([Fake("bge", 1024, fail=True)], ["x"])
    with pytest.raises(E.EmbedError):
        await E.embed_passages([], ["x"])


def test_padding_preserves_cosine():
    a, b = E.l2_normalize([1.0, 2.0, 3.0]), E.l2_normalize([2.0, -1.0, 0.5])
    cos = sum(x * y for x, y in zip(a, b, strict=True))
    pa, pb = E.pad_to_store(a), E.pad_to_store(b)
    assert sum(x * y for x, y in zip(pa, pb, strict=True)) == pytest.approx(cos)


def test_build_embedders_from_settings():
    assert E.build_embedders(Settings(_env_file=None, env="test")) == []
    chain = E.build_embedders(Settings(_env_file=None, env="test", hf_token="t"))
    assert [e.model for e in chain] == ["BAAI/bge-m3"]
    # a configured-but-broken fallback is skipped, not fatal
    chain = E.build_embedders(Settings(_env_file=None, env="test", e5_model_dir="Z:/nope"))
    assert chain == []
