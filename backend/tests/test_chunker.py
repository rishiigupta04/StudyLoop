import random

import pytest

from app.services.chunker import chunk_segments
from app.services.transcripts import Segment


def segs(n, step=4.0, dur=4.0):
    return [Segment(text=f"s{i}", start=i * step, duration=dur) for i in range(n)]


def covered(chunks):
    return {w for c in chunks for w in c.text.split()}


def test_empty_and_blank():
    assert chunk_segments([]) == []
    assert chunk_segments([Segment(text="  ", start=0, duration=3)]) == []


def test_short_video_is_one_chunk():
    out = chunk_segments(segs(5))  # 20 s
    assert len(out) == 1
    assert (out[0].start_s, out[0].end_s, out[0].text) == (0.0, 20.0, "s0 s1 s2 s3 s4")


def test_windows_sizes_and_overlap():
    out = chunk_segments(segs(300))  # 20 min of 4 s segments
    assert [c.idx for c in out] == list(range(len(out)))
    for c in out[:-1]:
        assert 45 <= c.end_s - c.start_s <= 60
    for a, b in zip(out, out[1:], strict=False):
        assert b.start_s > a.start_s  # always makes progress
        overlap = a.end_s - b.start_s
        assert 0 < overlap <= 12  # ~10 s, snapped to segment boundaries
    assert covered(out) == {f"s{i}" for i in range(300)}  # nothing dropped
    assert out[0].start_s == 0.0 and out[-1].end_s == 1200.0


def test_boundaries_are_segment_boundaries():
    data = segs(100, step=3.1, dur=3.1)
    starts = {round(s.start, 3) for s in data}
    for c in chunk_segments(data):
        assert c.start_s in starts


def test_short_tail_folded_into_previous():
    out = chunk_segments(segs(14, step=4, dur=4))  # 56 s: a 0–52 s window + a 12 s tail (44–56)
    assert len(out) == 1 and (out[0].start_s, out[0].end_s) == (0.0, 56.0)


def test_long_single_segment_stands_alone():
    data = [Segment("a", 0, 5), Segment("long", 5, 90), Segment("b", 95, 5), Segment("c", 100, 30)]
    out = chunk_segments(data)
    assert covered(out) == {"a", "long", "b", "c"}
    assert any(c.text == "long" or "long" in c.text for c in out)


def test_overlapping_asr_segments_and_unsorted_input():
    # YouTube ASR segments often overlap in time and can arrive unsorted
    data = [Segment(f"w{i}", i * 2.0, 5.0) for i in range(120)]
    random.Random(0).shuffle(data)
    out = chunk_segments(data)
    assert covered(out) == {f"w{i}" for i in range(120)}
    assert out[0].start_s == 0.0 and out[-1].end_s == pytest.approx(243.0)


def test_whitespace_collapsed():
    out = chunk_segments([Segment(" hello\n", 0, 2), Segment("  world  ", 2, 2)])
    assert out[0].text == "hello world"


@pytest.mark.parametrize("seed", range(20))
def test_fuzz_terminates_and_covers(seed):
    rng = random.Random(seed)
    t, data = 0.0, []
    for i in range(rng.randint(1, 400)):
        d = rng.choice([0.5, 2, 4, 7, 15, 70])
        data.append(Segment(f"x{i}", t, d))
        t += d * rng.choice([0.6, 1, 1.3])
    out = chunk_segments(data)
    assert covered(out) == {s.text for s in data}
    assert all(c.end_s >= c.start_s for c in out)
    assert len(out) <= len(data)
