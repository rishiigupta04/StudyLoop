import time
import uuid

import pytest
from langgraph.checkpoint.memory import MemorySaver

from app.orchestration.graph import build_graph, new_turn_input


@pytest.fixture(scope="module")
def graph():
    return build_graph(checkpointer=MemorySaver())


def run(graph, text, lang="en", thread=None):
    thread = thread or str(uuid.uuid4())
    return graph.invoke(
        new_turn_input(
            session_id=thread,
            user_id="u",
            video_id="v",
            language=lang,
            playback_s=100.0,
            max_watched_s=100.0,
            turn_id=str(uuid.uuid4()),
            raw_text=text,
        ),
        {"configurable": {"thread_id": thread}},
    )


@pytest.mark.parametrize(
    "text,action",
    [
        ("pause", {"type": "PAUSE"}),
        ("play", {"type": "PLAY"}),
        ("go back 30 seconds", {"type": "SEEK_RELATIVE", "delta_s": -30.0}),
        ("thoda peeche", {"type": "SEEK_RELATIVE", "delta_s": -10.0}),
        ("दस सेकंड आगे करो", {"type": "SEEK_RELATIVE", "delta_s": 10.0}),
        ("12:30 पर जाओ", {"type": "SEEK_TO", "seconds": 750.0}),
        ("go to 1230", {"type": "SEEK_TO", "seconds": 750.0}),
        ("speed 1.5x", {"type": "SET_RATE", "rate": 1.5}),
        ("स्पीड डेढ़ कर दो", {"type": "SET_RATE", "rate": 1.5}),
        ("play faster", {"type": "RATE_STEP", "delta": 0.25}),
        ("mute", {"type": "MUTE"}),
        ("awaaz badhao", {"type": "VOLUME_STEP", "delta": 20}),
        ("say that again", {"type": "SEEK_RELATIVE", "delta_s": -15.0, "then": "PLAY"}),
    ],
)
def test_fast_path_actions(graph, text, action):
    out = run(graph, text)
    assert out["action"] == action
    assert out["route"] == "fast"
    # the fast path must never touch the LLM router or any agent
    assert not {"llm_router", "rag_agent", "seek_resolver", "notes_agent", "localize"} & set(out["timings"])


def test_localized_confirmation_in_hindi(graph):
    out = run(graph, "थोड़ा पीछे जाओ", lang="hi")
    assert out["response_text"] == "10 सेकंड पीछे"


def test_slow_path_stubs_are_honest(graph):
    ask = run(graph, "what is gradient descent")
    assert ask["action"] is None and ask["route"] == "rag" and "Tier 1b" in ask["response_text"]
    seek = run(graph, "skip to the part about backpropagation")
    assert seek["route"] == "seek" and seek["action"] is None
    note = run(graph, "note this down", lang="hi")
    assert note["route"] == "notes" and "Notes" in note["response_text"]
    oos = run(graph, "the weather is nice")
    assert oos["route"] == "llm" and oos["answer_key"] == "NOT_UNDERSTOOD"


def test_missing_slot_falls_back(graph):
    out = run(graph, "jump to minute")  # SEEK_ABSOLUTE-ish without a time → not a confident action
    assert out["action"] is None


def test_per_turn_fields_reset_and_history_kept(graph):
    thread = str(uuid.uuid4())
    first = run(graph, "pause", thread=thread)
    assert first["action"] == {"type": "PAUSE"}
    second = run(graph, "what is recursion", thread=thread)
    assert second["action"] is None  # previous turn's action must not leak
    assert [h["text"] for h in second["history"] if h["role"] == "user"] == ["pause", "what is recursion"]


def test_fast_path_latency_budget(graph):
    run(graph, "pause")  # warm up
    samples = []
    for _ in range(50):
        t0 = time.perf_counter()
        run(graph, "go back 10 seconds")
        samples.append((time.perf_counter() - t0) * 1000)
    samples.sort()
    p95 = samples[int(0.95 * len(samples)) - 1]
    assert p95 < 150, f"fast path p95 {p95:.1f} ms"
