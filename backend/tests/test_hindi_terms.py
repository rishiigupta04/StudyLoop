"""English-only words spelled in Devanagari go back to English letters in Hindi answers, notes and outlines."""

import pytest

from app.services.hindi_terms import TermStream, latinize_terms
from app.services.outline import public


@pytest.mark.parametrize(
    "text, expected",
    [
        ("इस लेक्चर में प्रोफ़ेसर एल्गोरिद्म समझाते हैं।", "इस lecture में professor algorithm समझाते हैं।"),
        ("एरे के हर एलिमेंट को देखो", "array के हर element को देखो"),
        ("सारे एलिमेंट्स और नेबर्स", "सारे elements और neighbors"),  # plural -्स
        ("टाइम कॉम्प्लेक्सिटी Θ(n) है", "टाइम complexity Θ(n) है"),  # टाइम is everyday Hindi too: kept
        ("प्रोफेसर / प्रोफ़ेसर", "professor / professor"),  # with or without the nukta
        ("अरे, रो मत", "अरे, रो मत"),  # Hindi words that look like English ones are never touched
        ("पायथन में कोड", "Python में code"),
        ("plain English stays as it is", "plain English stays as it is"),
        ("", ""),
    ],
)
def test_latinize_terms(text, expected):
    assert latinize_terms(text) == expected


def test_term_stream_never_splits_a_word():
    s = TermStream()
    pieces = ["इस लेक्", "चर में एल्गो", "रिद्म [12:30] ", "है"]
    out = "".join(s.push(p) for p in pieces) + s.flush()
    assert out == "इस lecture में algorithm [12:30] है"
    s = TermStream()
    assert s.push("इस लेक्") == "इस "  # the unfinished word waits for the next delta
    assert s.push("चर ") == "lecture "


def test_stored_hindi_outline_is_fixed_on_the_way_out():
    doc = {
        "status": "ready",
        "langs": {
            "en": {"overview": "The lecture", "chapters": [], "parts": []},
            "hi": {"overview": "यह लेक्चर", "chapters": [{"start_s": 0, "title": "कोर्स परिचय"}], "parts": []},
        },
    }
    out = public(doc)["outline"]
    assert out["hi"]["overview"] == "यह lecture" and out["hi"]["chapters"][0]["title"] == "course परिचय"
    assert out["hi"]["chapters"][0]["start_s"] == 0 and out["en"]["overview"] == "The lecture"


def test_hindi_answer_streams_and_ends_in_english_letters():
    from langgraph.checkpoint.memory import MemorySaver

    from tests.test_rag import FakeLLM, build_graph, turn

    graph = build_graph(checkpointer=MemorySaver())
    llm = FakeLLM(answer="इस लेक्चर में एरे का पीक [3:00] होता है।")
    out, deltas, _ = turn(graph, "पीक क्या होता है?", watched=780, llm=llm, lang="hi")
    assert out["answer_text"] == "इस lecture में array का peak [3:00] होता है।"
    assert "".join(deltas) == out["answer_text"]
    assert (
        "Devanagari" in llm.messages[0]["content"]
        and "never spell an English word" in llm.messages[0]["content"]
    )


def test_english_answer_is_untouched():
    from langgraph.checkpoint.memory import MemorySaver

    from tests.test_rag import FakeLLM, build_graph, turn

    graph = build_graph(checkpointer=MemorySaver())
    out, deltas, _ = turn(
        graph, "what is hashing", watched=780, llm=FakeLLM(answer="Hashing maps keys [3:00].")
    )
    assert out["answer_text"] == "Hashing maps keys [3:00]." and "".join(deltas) == out["answer_text"]


def test_devanagari_question_finds_the_english_transcript_without_embeddings():
    # embeddings down (lexical only): "पीक" alone scores zero against an English transcript; its English spelling
    # is searched too
    import asyncio

    from app.services.retrieval import Retriever
    from tests.test_rag import VID, repo_with_lecture

    class Down:
        model, dim = "kw", 1024

        async def embed(self, texts, *, kind):
            raise RuntimeError("402 no credits")

    retriever = Retriever(repo_with_lecture(), [Down()])
    hits = asyncio.run(retriever.rank(VID, ["रिकर्शन क्या होता है"]))
    assert hits[0].start_s == 540.0 and hits[0].lex > 0  # "recursion a function that calls itself"
    hits = asyncio.run(retriever.rank(VID, ["हैश टेबल समझाओ"]))
    assert hits[0].start_s == 180.0 and hits[0].lex > 0  # "hashing hash tables and collisions"
