import time
import uuid

import pytest
from langgraph.checkpoint.memory import MemorySaver

from app.orchestration.graph import build_graph, new_turn_input


@pytest.fixture(scope="module")
def graph():
    return build_graph(checkpointer=MemorySaver())


def run(graph, text, lang="en", thread=None, **extra):
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
            **extra,
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


def test_slow_paths_degrade_honestly_without_index_or_llm(graph):
    # transcript "ready" but nothing indexed for this video and no LLM configured (hermetic tests)
    ask = run(graph, "what is gradient descent", transcript_status="ready")
    assert ask["action"] is None and ask["route"] == "rag" and ask["answer_key"] == "LLM_NOT_CONFIGURED"
    seek = run(graph, "skip to the part about backpropagation", transcript_status="ready")
    assert seek["route"] == "seek" and seek["action"] is None and seek["answer_key"] == "TOPIC_NOT_FOUND"
    note = run(graph, "note this down", lang="hi")
    assert note["route"] == "notes" and note["response_text"].endswith("पर note कर लिया।")
    assert note["note"]["is_auto"] and note["note"]["raw_text"] == "note this down"
    oos = run(graph, "the weather is nice")
    assert oos["route"] == "llm" and oos["answer_key"] == "NOT_UNDERSTOOD"


@pytest.mark.parametrize(
    "status,reason,key",
    [
        ("pending", None, "TRANSCRIPT_PREPARING"),
        ("transcribing", None, "TRANSCRIPT_PREPARING"),
        ("embedding", None, "TRANSCRIPT_PREPARING"),
        ("unavailable", "unavailable", "NO_TRANSCRIPT_unavailable"),
        ("unavailable", "no_speech", "NO_TRANSCRIPT_no_speech"),
        ("unavailable", "weird", "NO_TRANSCRIPT_unavailable"),
        ("failed", "no_plan", "NO_TRANSCRIPT_failed"),
        ("failed", "embed_error", "NO_TRANSCRIPT_failed"),
    ],
)
@pytest.mark.parametrize("lang", ["en", "hi"])
def test_transcript_dependent_intents_name_the_reason(graph, status, reason, key, lang):
    from app.orchestration.localize import t

    for text, route in (("what is gradient descent", "rag"), ("skip to the part about backprop", "seek")):
        out = run(graph, text, lang=lang, transcript_status=status, transcript_fail_reason=reason)
        assert out["route"] == route and out["action"] is None
        assert out["answer_key"] == key and out["response_text"] == t(key, lang)
    # player commands never depend on the transcript
    assert run(graph, "pause", lang=lang, transcript_status=status)["action"] == {"type": "PAUSE"}


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


@pytest.mark.parametrize(
    "text,bookmarked",
    [
        ("bookmark this", True),
        ("बुकमार्क करो", True),
        ("note this and star it", True),
        ("note from the start", False),
    ],
)
def test_note_bookmark_detection(graph, text, bookmarked):
    out = run(graph, text)
    assert out["route"] == "notes" and out["note"]["is_bookmarked"] is bookmarked
    assert out["note"]["at_s"] == 100.0 and set(out["timings"]) >= {"notes_agent"}
