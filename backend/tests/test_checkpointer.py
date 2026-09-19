"""WriteBehindSaver: the graph never waits on the durable store, and memory survives a restart."""

import time
import uuid

from langgraph.checkpoint.memory import MemorySaver

from app.orchestration.checkpointer import WriteBehindSaver
from app.orchestration.graph import build_graph, new_turn_input


class SlowStore(MemorySaver):
    """Stands in for Postgres: every write is a slow network round trip."""

    def __init__(self, delay=0.3):
        super().__init__()
        self.delay, self.puts = delay, 0

    def put(self, *args, **kwargs):
        time.sleep(self.delay)
        self.puts += 1
        return super().put(*args, **kwargs)


def turn(graph, thread, text):
    return graph.invoke(
        new_turn_input(
            session_id=thread, user_id="u", video_id="v", language="en", turn_id="t", raw_text=text
        ),
        {"configurable": {"thread_id": thread}},
    )


def test_fast_path_does_not_wait_for_the_durable_store():
    cold = SlowStore(delay=0.3)
    saver = WriteBehindSaver(MemorySaver(), cold)
    graph = build_graph(checkpointer=saver)
    thread = str(uuid.uuid4())
    saver.hydrate(thread)  # what the WS hello does
    t0 = time.perf_counter()
    for text in ("pause", "play", "go back 10 seconds"):
        assert turn(graph, thread, text)["route"] == "fast"
    assert time.perf_counter() - t0 < 0.3  # a synchronous store would take >= 0.3 s per graph step
    assert saver.flush(5)
    assert 1 <= cold.puts <= 6  # coalesced: far fewer writes than graph steps (3 turns × ~5 steps)
    saver.close()


def test_memory_survives_a_restart():
    cold = SlowStore(delay=0)
    thread = str(uuid.uuid4())
    first = WriteBehindSaver(MemorySaver(), cold)
    g1 = build_graph(checkpointer=first)
    turn(g1, thread, "pause")
    turn(g1, thread, "mute")
    first.close()

    second = WriteBehindSaver(MemorySaver(), cold)  # a new process: empty hot store
    g2 = build_graph(checkpointer=second)
    out = turn(g2, thread, "play")
    texts = [h["text"] for h in out["history"]]
    assert texts[:4] == ["pause", "Paused", "mute", "Muted"] and texts[-2:] == ["play", "Playing"]
    second.close()


def test_unknown_session_and_failing_store_are_harmless():
    class Down(MemorySaver):
        def get_tuple(self, config):
            raise ConnectionError("db down")

        def put(self, *a, **k):
            raise ConnectionError("db down")

    saver = WriteBehindSaver(MemorySaver(), Down())
    graph = build_graph(checkpointer=saver)
    thread = str(uuid.uuid4())
    assert turn(graph, thread, "pause")["action"] == {"type": "PAUSE"}
    assert turn(graph, thread, "play")["history"][0]["text"] == "pause"  # the hot store still remembers
    assert saver.flush(5)
    saver.close()
