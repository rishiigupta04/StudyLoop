"""Embedder interface (roadmap D2).

Primary: hosted BGE-M3 (1024-d) through Hugging Face Inference, used for both ingestion and queries.
Fallback: `multilingual-e5-small` ONNX on CPU (384-d, zero-padded to the 1024-d column; padding
preserves cosine similarity). `embed_model` + `embed_dim` are stored per video, so Tier 1b always
embeds the query with the same model that indexed the video: the two spaces never mix.
"""

from __future__ import annotations

import asyncio
import logging
import math
from pathlib import Path
from typing import Literal, Protocol

import httpx

from app.config import Settings
from app.services.http import shared_client

log = logging.getLogger("studyloop.embedder")

STORE_DIM = 1024  # transcript_chunks.embedding vector(1024)
Kind = Literal["query", "passage"]


class EmbedError(RuntimeError):
    pass


class Embedder(Protocol):
    model: str
    dim: int

    async def embed(self, texts: list[str], *, kind: Kind) -> list[list[float]]: ...


def l2_normalize(v: list[float]) -> list[float]:
    norm = math.sqrt(sum(x * x for x in v))
    return [x / norm for x in v] if norm > 0 else v


def pad_to_store(v: list[float]) -> list[float]:
    if len(v) > STORE_DIM:
        raise EmbedError(f"vector dim {len(v)} exceeds the {STORE_DIM}-d column")
    return v + [0.0] * (STORE_DIM - len(v))


class HFInferenceEmbedder:
    """BAAI/bge-m3 dense vectors via the HF Inference router (feature-extraction pipeline)."""

    model = "BAAI/bge-m3"
    dim = 1024

    def __init__(self, settings: Settings, http: httpx.AsyncClient | None = None, batch_size: int = 16):
        self._url = (
            f"{settings.hf_inference_base.rstrip('/')}/models/{self.model}/pipeline/feature-extraction"
        )
        self._headers = {"Authorization": f"Bearer {settings.hf_token}"}
        self._http = http
        self._batch = batch_size
        self._timeout = settings.embed_timeout_s

    async def embed(self, texts: list[str], *, kind: Kind) -> list[list[float]]:
        # BGE-M3 dense retrieval needs no query/passage instruction prefix. A query is on the user's
        # critical path: fewer retries and a shorter timeout than background ingestion.
        attempts, timeout = (2, min(8.0, self._timeout)) if kind == "query" else (4, self._timeout)
        out: list[list[float]] = []
        for i in range(0, len(texts), self._batch):
            out.extend(await self._embed_batch(texts[i : i + self._batch], attempts, timeout))
        return out

    async def _embed_batch(self, batch: list[str], attempts: int, timeout: float) -> list[list[float]]:
        payload = {"inputs": batch, "normalize": True, "truncate": True}
        last = "no attempt"
        http = self._http or shared_client()
        for attempt in range(attempts):
            try:
                r = await http.post(self._url, json=payload, headers=self._headers, timeout=timeout)
            except httpx.HTTPError as exc:
                last = type(exc).__name__
            else:
                if r.status_code == 200:
                    return self._parse(r.json(), len(batch))
                last = f"HTTP {r.status_code} {r.text[:200]}"
                if r.status_code not in (429, 500, 502, 503, 504):  # 503 = model cold-loading
                    break
            if attempt + 1 < attempts:
                await asyncio.sleep(min(2**attempt, 8))
        raise EmbedError(f"{self.model}: {last}")

    def _parse(self, body: object, n: int) -> list[list[float]]:
        if not isinstance(body, list) or len(body) != n:
            raise EmbedError(f"{self.model}: unexpected response shape")
        vecs: list[list[float]] = []
        for item in body:
            # sentence-level [dim]; some deployments return token-level [tokens][dim] → BGE uses CLS
            if item and isinstance(item[0], list):
                item = item[0]
            if len(item) != self.dim:
                raise EmbedError(f"{self.model}: got dim {len(item)}, expected {self.dim}")
            vecs.append(l2_normalize([float(x) for x in item]))
        return vecs


class E5OnnxEmbedder:
    """CPU fallback: intfloat/multilingual-e5-small exported to ONNX (int8), mean-pooled.

    Needs `onnxruntime` + `tokenizers` and a local model dir (`model.onnx` + `tokenizer.json`), set via
    `E5_MODEL_DIR`. Those deps are not in requirements.txt yet: Tier 1c adds onnxruntime for the
    classifier, and this fallback rides on it.
    """

    model = "intfloat/multilingual-e5-small"
    dim = 384

    def __init__(self, model_dir: str, max_len: int = 512):
        import numpy as np  # noqa: F401 — fail fast if the optional deps are missing
        import onnxruntime as ort
        from tokenizers import Tokenizer

        d = Path(model_dir)
        self._tok = Tokenizer.from_file(str(d / "tokenizer.json"))
        self._tok.enable_truncation(max_length=max_len)
        self._tok.enable_padding()
        self._sess = ort.InferenceSession(str(d / "model.onnx"), providers=["CPUExecutionProvider"])
        self._inputs = {i.name for i in self._sess.get_inputs()}

    async def embed(self, texts: list[str], *, kind: Kind) -> list[list[float]]:
        prefixed = [f"{kind}: {t}" for t in texts]  # e5 is trained with these prefixes
        return await asyncio.to_thread(self._run, prefixed)

    def _run(self, texts: list[str]) -> list[list[float]]:
        import numpy as np

        out: list[list[float]] = []
        for i in range(0, len(texts), 16):
            enc = self._tok.encode_batch(texts[i : i + 16])
            ids = np.array([e.ids for e in enc], dtype=np.int64)
            mask = np.array([e.attention_mask for e in enc], dtype=np.int64)
            feeds = {"input_ids": ids, "attention_mask": mask}
            if "token_type_ids" in self._inputs:
                feeds["token_type_ids"] = np.zeros_like(ids)
            hidden = self._sess.run(None, feeds)[0]  # [batch, tokens, dim]
            m = mask[..., None].astype(hidden.dtype)
            pooled = (hidden * m).sum(axis=1) / np.clip(m.sum(axis=1), 1e-9, None)
            out.extend(l2_normalize(row.tolist()) for row in pooled)
        return out


async def embed_passages(chain: list[Embedder], texts: list[str]) -> tuple[str, int, list[list[float]]]:
    """Embed with the first embedder in `chain` that succeeds → (model, dim, 1024-d padded vectors)."""
    errors: list[str] = []
    for emb in chain:
        try:
            vecs = await emb.embed(texts, kind="passage")
        except Exception as exc:  # EmbedError, or a local-runtime failure in the ONNX fallback
            log.warning("embedder %s failed: %s", emb.model, exc)
            errors.append(f"{emb.model}: {exc}")
            continue
        if len(vecs) != len(texts):
            errors.append(f"{emb.model}: {len(vecs)} vectors for {len(texts)} texts")
            continue
        return emb.model, emb.dim, [pad_to_store(v) for v in vecs]
    raise EmbedError("; ".join(errors) or "no embedder configured")


def build_embedders(settings: Settings) -> list[Embedder]:
    """Primary first, then fallback. Empty = no embedder configured: chunks are stored without vectors
    (full-text search still works) and the video is still `ready`."""
    chain: list[Embedder] = []
    if settings.hf_token:
        chain.append(HFInferenceEmbedder(settings))
    if settings.e5_model_dir:
        try:
            chain.append(E5OnnxEmbedder(settings.e5_model_dir))
        except Exception as exc:  # missing optional deps or model files
            log.warning("e5 fallback unavailable: %s", exc)
    return chain
