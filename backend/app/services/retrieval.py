"""Hybrid retrieval over one video's transcript chunks (roadmap Tier 1b, D7).

A lecture has ~70–250 chunks, so ranking happens in-process over a per-video cache instead of in
Postgres: cosine over the stored BGE-M3 vectors + BM25 over the chunk text, fused with reciprocal-rank
fusion. Why not `match_chunks` + HNSW: an approximate index scan filtered by `video_id` can return
fewer than k rows once the table holds many videos, and the anti-spoiler cut (`end_s <= max_watched_s`)
must be exact. The table's HNSW / full-text indexes stay for cross-video search later.

The query is embedded with the *same* model that indexed the video (`videos.embed_model`); if that
model isn't available, ranking falls back to BM25 alone.
"""

from __future__ import annotations

import logging
import math
import operator
import re
import time
from array import array
from collections import Counter, OrderedDict
from dataclasses import dataclass, field
from typing import Any

from app.services.embedder import Embedder, pad_to_store
from app.services.video_repo import VideoRepo

log = logging.getLogger("studyloop.retrieval")

_TOKEN = re.compile(r"\w+", re.UNICODE)
# function words in English and romanized Hindi — they carry no topic signal
STOPWORDS = frozenset(
    """a an the and or but if of to in on at by for with from as is are was were be been being it its this that
    these those what which who whom whose why how when where do does did done can could should would will shall
    may might must i me my we our you your he she they them their there here about into over than then so not no
    yes just also very really please tell explain mean means meaning said says say talk talking part section
    video lecture skip jump go take show find move bring get let us lets
    kya hai hain ho hota hoti hote tha thi the ka ki ke ko se me mein par pe aur ya yeh ye woh wo is us isko
    usko iska uska kaise kyun kyon kab kahan kaun batao bataiye samjhao samjhaiye matlab wala wali wale waala
    jao chalo le lo karo kar dikhao""".split()
)

RRF_K = 60


def tokens(text: str) -> list[str]:
    return [t for t in _TOKEN.findall(text.lower()) if len(t) > 1 and t not in STOPWORDS]


def _dot(a: array, b: array) -> float:
    return sum(map(operator.mul, a, b))


@dataclass
class IndexedChunk:
    idx: int
    start_s: float
    end_s: float
    text: str
    vec: array | None
    tf: Counter
    length: int


@dataclass
class VideoIndex:
    video_id: str
    embed_model: str | None
    chunks: list[IndexedChunk]
    df: Counter = field(default_factory=Counter)
    avgdl: float = 1.0
    loaded_at: float = field(default_factory=time.monotonic)

    @property
    def has_vectors(self) -> bool:
        return bool(self.embed_model) and any(c.vec is not None for c in self.chunks)

    def bm25(self, q: list[str], c: IndexedChunk, k1: float = 1.2, b: float = 0.75) -> float:
        n = len(self.chunks)
        score = 0.0
        for term in set(q):
            f = c.tf.get(term)
            if not f:
                continue
            idf = math.log(1 + (n - self.df[term] + 0.5) / (self.df[term] + 0.5))
            score += idf * f * (k1 + 1) / (f + k1 * (1 - b + b * c.length / self.avgdl))
        return score


@dataclass(frozen=True)
class Hit:
    idx: int
    start_s: float
    end_s: float
    text: str
    score: float  # fused RRF score (ordering only)
    sim: float | None  # best cosine over the query variants; None without vectors
    lex: float  # best BM25


def build_index(video_id: str, embed_model: str | None, rows: list[dict[str, Any]]) -> VideoIndex:
    chunks: list[IndexedChunk] = []
    for r in rows:
        toks = tokens(r["text"])
        emb = r.get("embedding")
        chunks.append(
            IndexedChunk(
                idx=int(r["idx"]),
                start_s=float(r["start_s"]),
                end_s=float(r["end_s"]),
                text=r["text"],
                vec=array("f", emb) if emb else None,
                tf=Counter(toks),
                length=max(1, len(toks)),
            )
        )
    chunks.sort(key=lambda c: c.start_s)
    index = VideoIndex(video_id=video_id, embed_model=embed_model, chunks=chunks)
    for c in chunks:
        index.df.update(c.tf.keys())
    index.avgdl = sum(c.length for c in chunks) / max(1, len(chunks))
    return index


class Retriever:
    def __init__(
        self, repo: VideoRepo, embedders: list[Embedder], *, ttl_s: float = 600, cache_size: int = 32
    ):
        self._repo = repo
        self._embedders = {e.model: e for e in embedders}
        self._ttl = ttl_s
        self._size = cache_size
        self._cache: OrderedDict[str, VideoIndex] = OrderedDict()

    async def index(self, video_id: str) -> VideoIndex | None:
        hit = self._cache.get(video_id)
        if hit and time.monotonic() - hit.loaded_at < self._ttl:
            self._cache.move_to_end(video_id)
            return hit
        row = await self._repo.get(video_id)
        if not row or not row.get("has_transcript"):
            return None
        rows = await self._repo.get_chunks(video_id)
        if not rows:
            return None
        index = build_index(video_id, row.get("embed_model"), rows)
        self._cache[video_id] = index
        self._cache.move_to_end(video_id)
        while len(self._cache) > self._size:
            self._cache.popitem(last=False)
        return index

    def invalidate(self, video_id: str) -> None:
        self._cache.pop(video_id, None)

    async def _embed(self, model: str, queries: list[str]) -> list[array] | None:
        emb = self._embedders.get(model)
        if emb is None:
            log.info("no query embedder for %s; lexical ranking only", model)
            return None
        try:
            vecs = await emb.embed(queries, kind="query")
            return [array("f", pad_to_store(v)) for v in vecs]
        except Exception as exc:  # the answer still works on BM25 alone
            log.warning("query embedding failed (%s); lexical ranking only", exc)
            return None

    async def rank(self, video_id: str, queries: list[str]) -> list[Hit]:
        """Every chunk of the video, best first. Callers apply their own time filter (so one ranking
        serves both the watched-only answer and the "is this coming later?" check)."""
        index = await self.index(video_id)
        queries = [q for q in dict.fromkeys(q.strip() for q in queries) if q]
        if index is None or not queries:
            return []
        qvecs = await self._embed(index.embed_model, queries) if index.has_vectors else None

        fused: dict[int, float] = {}
        sims: dict[int, float] = {}
        lexs: dict[int, float] = {}
        n = len(index.chunks)

        def fuse(scores: list[float]) -> None:
            order = sorted(range(n), key=lambda i: scores[i], reverse=True)
            for rank, i in enumerate(order):
                if scores[i] > 0:
                    fused[i] = fused.get(i, 0.0) + 1.0 / (RRF_K + rank + 1)

        for qi, q in enumerate(queries):
            if qvecs is not None:
                qv = qvecs[qi]
                s = [_dot(qv, c.vec) if c.vec is not None else -1.0 for c in index.chunks]
                for i, v in enumerate(s):
                    sims[i] = max(sims.get(i, -1.0), v)
                fuse([v + 1.0 for v in s])  # shift so every real similarity counts as > 0
            qt = tokens(q)
            if qt:
                s = [index.bm25(qt, c) for c in index.chunks]
                for i, v in enumerate(s):
                    lexs[i] = max(lexs.get(i, 0.0), v)
                fuse(s)

        hits = [
            Hit(
                idx=c.idx,
                start_s=c.start_s,
                end_s=c.end_s,
                text=c.text,
                score=fused.get(i, 0.0),
                sim=sims.get(i) if qvecs is not None else None,
                lex=lexs.get(i, 0.0),
            )
            for i, c in enumerate(index.chunks)
        ]
        hits.sort(key=lambda h: h.score, reverse=True)
        return hits

    async def watched(self, video_id: str, max_end_s: float) -> list[IndexedChunk]:
        """Chunks fully watched so far, in time order (summaries)."""
        index = await self.index(video_id)
        if index is None:
            return []
        return [c for c in index.chunks if c.end_s <= max_end_s + 0.5]


_retriever: Retriever | None = None


def get_retriever() -> Retriever:
    global _retriever
    if _retriever is None:
        from app.config import get_settings
        from app.services.embedder import build_embedders
        from app.services.ingest import get_ingest_service

        _retriever = Retriever(get_ingest_service().repo, build_embedders(get_settings()))
    return _retriever


def set_retriever(r: Retriever | None) -> None:
    global _retriever
    _retriever = r
