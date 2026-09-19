"""Timing-based retrieval chunks (roadmap Tier 1a).

Windows of ~45–60 s cut on segment boundaries with ~10 s overlap, so an answer that straddles a cut
is still whole in one chunk. `start_s`/`end_s` are kept exact: `end_s` drives the anti-spoiler filter
(`end_s <= max_watched_s`, D7) and `start_s` is where semantic seek jumps to.
"""

from __future__ import annotations

import re
from collections.abc import Sequence
from dataclasses import dataclass
from typing import Protocol

_WS = re.compile(r"\s+")


class SegmentLike(Protocol):
    text: str
    start: float
    duration: float


@dataclass(frozen=True)
class Chunk:
    idx: int
    start_s: float
    end_s: float
    text: str


def _end(seg: SegmentLike) -> float:
    return float(seg.start) + max(0.0, float(seg.duration))


def chunk_segments(
    segments: Sequence[SegmentLike],
    *,
    target_s: float = 50.0,
    max_s: float = 60.0,
    overlap_s: float = 10.0,
    min_tail_s: float = 20.0,
) -> list[Chunk]:
    """Greedy windows: grow until `target_s` (never past `max_s` unless a single segment is longer),
    then start the next window at the earliest segment that begins within `overlap_s` of the previous
    window's end. Every window contains at least one segment the previous window didn't, so this always
    terminates. A short tail (< `min_tail_s`) is folded into the previous chunk."""
    segs = sorted((s for s in segments if s.text and s.text.strip()), key=lambda s: float(s.start))
    if not segs:
        return []

    spans: list[tuple[int, int]] = []  # inclusive segment index ranges
    n = len(segs)
    i, must = 0, 0  # `must`: first segment the next window has to include (new material)
    while must < n:
        j = must
        start = float(segs[i].start)
        end = max(_end(segs[k]) for k in range(i, j + 1))
        while j + 1 < n and end - start < target_s:
            nxt = max(end, _end(segs[j + 1]))
            if nxt - start > max_s:
                break
            j, end = j + 1, nxt
        spans.append((i, j))
        must = j + 1
        if must >= n:
            break
        # overlap: back up over segments that start within `overlap_s` of this window's end, but not so
        # far that the new material alone would push the next window past `max_s`
        k = must
        while (
            k - 1 > i
            and float(segs[k - 1].start) >= end - overlap_s
            and _end(segs[must]) - float(segs[k - 1].start) <= max_s
        ):
            k -= 1
        i = k

    if len(spans) > 1:
        (pi, _), (li, lj) = spans[-2], spans[-1]
        tail = max(_end(s) for s in segs[li : lj + 1]) - float(segs[li].start)
        if tail < min_tail_s:
            spans[-2:] = [(pi, lj)]

    chunks: list[Chunk] = []
    for idx, (a, b) in enumerate(spans):
        window = segs[a : b + 1]
        text = _WS.sub(" ", " ".join(s.text.strip() for s in window)).strip()
        chunks.append(
            Chunk(
                idx=idx,
                start_s=round(float(window[0].start), 3),
                end_s=round(max(_end(s) for s in window), 3),
                text=text,
            )
        )
    return chunks
