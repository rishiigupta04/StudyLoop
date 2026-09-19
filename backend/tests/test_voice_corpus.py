"""Every scenario in tests/voice_corpus.py, end to end through the real graph (normalize → classify →
slots → action). Player intents must take the fast path and never touch an LLM or agent node."""

import uuid

import pytest
from langgraph.checkpoint.memory import MemorySaver

from app.orchestration.graph import build_graph, new_turn_input
from app.orchestration.intents import PLAYER_INTENTS, Intent
from tests.voice_corpus import CASES

SLOW_ROUTE = {
    Intent.ASK: "rag",
    Intent.SUMMARIZE: "rag",
    Intent.SEMANTIC_SEEK: "seek",
    Intent.TAKE_NOTE: "notes",
    Intent.OOS: "llm",
}
AGENT_NODES = {"llm_router", "rag_agent", "seek_resolver", "notes_agent", "localize"}


@pytest.fixture(scope="module")
def graph():
    return build_graph(checkpointer=MemorySaver())


def run(graph, text, lang="en"):
    tid = str(uuid.uuid4())
    return graph.invoke(
        new_turn_input(
            session_id=tid,
            user_id="u",
            video_id="v",
            language=lang,
            playback_s=600.0,
            max_watched_s=600.0,
            turn_id=tid,
            raw_text=text,
        ),
        {"configurable": {"thread_id": tid}},
    )


@pytest.mark.parametrize("text,intent,action", CASES, ids=[c[0] for c in CASES])
def test_voice_corpus(graph, text, intent, action):
    out = run(graph, text)
    why = f"{text!r} → {out['normalized_text']!r}"
    assert out["intent"] == intent, why
    assert out["action"] == action, why
    if Intent(intent) in PLAYER_INTENTS:
        assert out["route"] == "fast", why
        assert not AGENT_NODES & set(out["timings"]), why
    else:
        assert out["route"] == SLOW_ROUTE[Intent(intent)], why


def test_corpus_has_no_duplicates():
    texts = [c[0] for c in CASES]
    assert len(texts) == len(set(texts))


@pytest.mark.parametrize(
    "text,lang,reply",
    [
        ("restart", "en", "Playing from the start"),
        ("go to the beginning", "en", "Back to the start"),
        ("go back 30 seconds and play", "en", "Back 30s, playing"),
        ("pause and go back 10 seconds", "hi", "10 सेकंड पीछे, रोक दिया"),
        ("undo", "hi", "वापस वहीं"),
        ("go to 75 percent", "en", "Jumped to 75%"),
        ("go to the end", "en", "Near the end"),
        ("volume 50", "hi", "आवाज़ 50%"),
    ],
)
def test_confirmations_are_localized(graph, text, lang, reply):
    assert run(graph, text, lang)["response_text"] == reply


def test_help_lists_commands_in_both_languages(graph):
    en = run(graph, "what can I say")
    assert en["route"] == "llm" and en["answer_key"] == "HELP" and "go back 10 seconds" in en["response_text"]
    hi = run(graph, "कमांड्स", lang="hi")  # Devanagari "commands" is not a help phrase → still honest
    assert hi["answer_key"] == "NOT_UNDERSTOOD"
    assert "रुको" in run(graph, "help", lang="hi")["response_text"]
