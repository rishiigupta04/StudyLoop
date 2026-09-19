"""Tier 1b through the graph: semantic seek, grounded Q&A with the anti-spoiler rule, summaries, the LLM
router — with a real Retriever over an in-memory lecture and a deterministic keyword embedder."""

import asyncio
import json
import uuid

import pytest
from langgraph.checkpoint.memory import MemorySaver

from app.orchestration.graph import TurnDeps, build_graph, new_turn_input
from app.services.llm import LLMError
from app.services.retrieval import Retriever
from app.services.video_repo import InMemoryVideoRepo

VID = "lecture0001"
TOPICS = ["sorting", "hashing", "graphs", "recursion", "dynamic", "backprop"]

# one ~50 s chunk per topic, spread over the lecture
LECTURE = [
    (0, "welcome everyone today we start with sorting algorithms like merge sort"),
    (180, "now hashing hash tables and collisions with chaining"),
    (360, "graphs breadth first search over vertices and edges"),
    (540, "recursion a function that calls itself with a base case"),
    (720, "dynamic programming memoization overlapping subproblems"),
    (900, "backprop gradient of the loss flows backwards through layers"),
    (1080, "wrap up and more graphs examples with shortest paths"),
]


def vec_for(text: str) -> list[float]:
    """Keyword → axis; normalized. Unrelated text gets a weak shared component."""
    v = [0.0] * 1024
    for i, t in enumerate(TOPICS):
        if t in text.lower() or (t == "backprop" and "backpropagation" in text.lower()):
            v[i] = 1.0
    v[1023] = 0.3
    n = sum(x * x for x in v) ** 0.5
    return [x / n for x in v]


class KeywordEmbedder:
    model, dim = "kw", 1024

    def __init__(self, fail=False):
        self.fail = fail
        self.calls = 0

    async def embed(self, texts, *, kind):
        self.calls += 1
        if self.fail:
            raise RuntimeError("hf down")
        return [vec_for(t) for t in texts]


class FakeLLM:
    configured = True

    def __init__(self, answer="It is covered here [3:00].", tool_msg=None, fail=False):
        self.answer, self.tool_msg, self.fail = answer, tool_msg, fail
        self.messages = None
        self.tool_calls = 0

    async def stream(self, messages, *, on_delta=None, is_cancelled=None, max_tokens=400):
        self.messages = messages
        if self.fail:
            raise LLMError("groq 429")
        out = []
        for word in self.answer.split(" "):
            if is_cancelled and is_cancelled():
                break
            piece = (" " if out else "") + word
            out.append(piece)
            if on_delta:
                await on_delta(piece)
        return "".join(out)

    async def tools(self, messages, tools):
        self.tool_calls += 1
        self.messages = messages
        if self.fail:
            raise LLMError("groq down")
        return self.tool_msg or {"content": None, "tool_calls": []}


def repo_with_lecture(embedded=True):
    repo = InMemoryVideoRepo()
    repo.videos[VID] = {
        "video_id": VID,
        "has_transcript": True,
        "ingest_status": "ready",
        "embed_model": "kw" if embedded else None,
    }
    repo.chunks[VID] = [
        {
            "idx": i,
            "start_s": float(s),
            "end_s": float(s + 50),
            "text": t,
            "embedding": vec_for(t) if embedded else None,
        }
        for i, (s, t) in enumerate(LECTURE)
    ]
    return repo


@pytest.fixture
def graph():
    return build_graph(checkpointer=MemorySaver())


def turn(
    graph, text, *, llm=None, embedded=True, embedder=None, watched=0.0, lang="en", thread=None, **extra
):
    deltas: list[str] = []

    async def emit(d):
        deltas.append(d)

    deps = TurnDeps(
        retriever=Retriever(repo_with_lecture(embedded), [embedder or KeywordEmbedder()]),
        llm=llm or FakeLLM(),
        emit=emit,
        is_cancelled=lambda: False,
    )
    thread = thread or str(uuid.uuid4())
    out = graph.invoke(
        new_turn_input(
            session_id=thread,
            user_id="u",
            video_id=VID,
            language=lang,
            playback_s=watched,
            max_watched_s=watched,
            turn_id=str(uuid.uuid4()),
            raw_text=text,
            transcript_status="ready",
            **extra,
        ),
        {"configurable": {"thread_id": thread, "deps": deps}},
    )
    return out, deltas, deps


# ---------------------------------------------------------------- semantic seek
def test_semantic_seek_jumps_ahead_to_the_topic(graph):
    out, _, deps = turn(graph, "skip to the part about backpropagation", watched=30)
    assert out["route"] == "seek" and out["action"] == {"type": "SEEK_TO", "seconds": 900.0}
    assert out["response_text"] == "Jumped to 15:00"  # jumping ahead is allowed (D7)
    assert deps.llm.tool_calls == 0 and "llm_router" not in out["timings"]  # no LLM on this path


def test_semantic_seek_did_you_mean(graph):
    out, _, _ = turn(graph, "jump to the part about graphs")  # 6:00 and the recap at 18:00
    assert out["action"]["seconds"] == 360.0 and out["action"]["alt_s"] == 1080.0
    assert out["response_text"] == "Jumped to 6:00. It also comes up at 18:00."


def test_semantic_seek_hindi_and_not_found(graph):
    out, _, _ = turn(graph, "hashing wala part dikhao", lang="hi")
    assert out["action"]["seconds"] == 180.0 and out["response_text"] == "3:00 पर पहुँच गए"
    miss, _, _ = turn(graph, "skip to the part about quantum field theory")
    assert miss["action"] is None and miss["answer_key"] == "TOPIC_NOT_FOUND"


def test_semantic_seek_lexical_only_when_embedder_down(graph):
    out, _, _ = turn(graph, "skip to the part about recursion", embedder=KeywordEmbedder(fail=True))
    assert out["action"]["seconds"] == 540.0  # BM25 still finds it


def test_semantic_seek_without_vectors(graph):
    out, _, _ = turn(graph, "go to the part about memoization", embedded=False)
    assert out["action"]["seconds"] == 720.0


# ---------------------------------------------------------------- Q&A + anti-spoiler (roadmap done-when)
def test_spoiler_question_about_future_content_is_not_answered(graph):
    llm = FakeLLM()
    out, deltas, _ = turn(
        graph, "how does backprop work", watched=720, llm=llm
    )  # at 12:00, backprop is 15:00
    assert out["answer_key"] == "NOT_COVERED_YET" and out["action"] is None
    assert llm.messages is None and deltas == []  # the LLM never saw future content


def test_question_answered_once_watched_with_citation_and_stream(graph):
    llm = FakeLLM(answer="Gradients flow backwards through the layers [15:00].")
    out, deltas, _ = turn(graph, "how does backprop work", watched=960, llm=llm)
    assert (
        out["route"] == "rag"
        and out["response_text"] == "Gradients flow backwards through the layers [15:00]."
    )
    assert "".join(deltas) == out["response_text"] and len(deltas) > 3  # streamed
    assert out["citations"] == [{"start_s": 900.0}]
    prompt = llm.messages[-1]["content"]
    assert "[15:00] backprop gradient" in prompt
    assert "18:00" not in prompt  # nothing past max_watched_s is ever in the context
    assert "up to 16:00" in llm.messages[0]["content"]


def test_watched_content_only_even_for_general_questions(graph):
    llm = FakeLLM(answer="Merge sort [0:00] and hash tables [3:00]. Also [18:00].")
    out, _, _ = turn(graph, "what have we seen about sorting and hashing", watched=300, llm=llm)
    prompt = llm.messages[-1]["content"]
    assert "[0:00]" in prompt and "[3:00]" in prompt and "[6:00]" not in prompt
    assert out["citations"] == [{"start_s": 0.0}, {"start_s": 180.0}]  # [18:00] wasn't in the context


def test_hindi_answer_prompt(graph):
    llm = FakeLLM(answer="यह layers से पीछे जाता है [15:00]।")
    out, _, _ = turn(graph, "backprop kaise kaam karta hai", watched=1000, lang="hi", llm=llm)
    assert "Devanagari" in llm.messages[0]["content"] and out["citations"] == [{"start_s": 900.0}]


def test_llm_failure_points_to_best_watched_moment(graph):
    out, _, _ = turn(graph, "explain recursion", watched=700, llm=FakeLLM(fail=True))
    assert out["answer_key"] == "LLM_UNAVAILABLE_AT"
    assert out["response_text"].endswith("is at 9:00.") and out["citations"] == [{"start_s": 540.0}]


def test_follow_up_carries_history(graph):
    thread = str(uuid.uuid4())
    turn(graph, "explain recursion", watched=700, thread=thread)
    llm = FakeLLM()
    turn(graph, "can you say that more simply", watched=700, llm=llm, thread=thread)
    roles = [m["role"] for m in llm.messages]
    assert roles[0] == "system" and roles[1:3] == ["user", "assistant"] and roles[-1] == "user"
    assert llm.messages[1]["content"] == "explain recursion"


# ---------------------------------------------------------------- summaries
def test_summary_covers_only_watched(graph):
    llm = FakeLLM(answer="We covered sorting [0:00] and hashing [3:00].")
    out, _, _ = turn(graph, "summarize so far", watched=400, llm=llm)
    prompt = llm.messages[-1]["content"]
    assert "[0:00]" in prompt and "[3:00]" in prompt and "[6:00]" not in prompt  # 6:00 chunk ends at 6:50
    assert out["intent"] == "SUMMARIZE" and len(out["citations"]) == 2


def test_summary_before_watching_anything(graph):
    out, _, _ = turn(graph, "summarize so far", watched=10)
    assert out["answer_key"] == "NOTHING_WATCHED"


# ---------------------------------------------------------------- llm_router
def tool(name, **args):
    return {"content": None, "tool_calls": [{"function": {"name": name, "arguments": json.dumps(args)}}]}


@pytest.mark.parametrize(
    "msg,action",
    [
        (
            tool("control_player", command="SEEK_BACK", seconds=45),
            {"type": "SEEK_RELATIVE", "delta_s": -45.0},
        ),
        (
            tool("control_player", command="SEEK_ABSOLUTE", timestamp_s=125),
            {"type": "SEEK_TO", "seconds": 125.0},
        ),
        (tool("control_player", command="SPEED", rate=1.25), {"type": "SET_RATE", "rate": 1.25}),
        (tool("control_player", command="SPEED", rate=9), {"type": "RATE_STEP", "delta": 0.25}),
        (
            tool("control_player", command="VOLUME", volume="set", volume_level=30),
            {"type": "VOLUME_SET", "level": 30},
        ),
        (tool("control_player", command="PAUSE"), {"type": "PAUSE"}),
    ],
)
def test_router_player_actions(graph, msg, action):
    out, _, deps = turn(graph, "blorp the flibber please", llm=FakeLLM(tool_msg=msg))
    assert deps.llm.tool_calls == 1
    assert out["route"] == "llm" and out["action"] == action


def test_router_to_seek_and_rag(graph):
    out, _, _ = turn(
        graph,
        "um that bit with the tables thing",
        llm=FakeLLM(tool_msg=tool("jump_to_topic", topic="hashing")),
    )
    assert out["action"] == {"type": "SEEK_TO", "seconds": 180.0} and out["route"] == "seek"
    llm = FakeLLM(tool_msg=tool("answer_question"), answer="A base case stops it [9:00].")
    out, deltas, _ = turn(graph, "hmm recursion stopping thing?", watched=700, llm=llm)
    assert out["route"] == "rag" and out["citations"] == [{"start_s": 540.0}] and deltas


def test_router_direct_answer_and_failures(graph):
    out, _, _ = turn(
        graph, "hello there friend", llm=FakeLLM(tool_msg={"content": "Hi! Ask me about the lecture."})
    )
    assert out["response_text"] == "Hi! Ask me about the lecture." and out["action"] is None
    out, _, _ = turn(graph, "hello there friend", llm=FakeLLM(fail=True))
    assert out["answer_key"] == "NOT_UNDERSTOOD"
    bad = tool("control_player", command="SEEK_ABSOLUTE")  # no timestamp
    out, _, _ = turn(graph, "hello there friend", llm=FakeLLM(tool_msg=bad))
    assert out["answer_key"] == "MISSING_TIME" and out["action"] is None
    junk = {"tool_calls": [{"function": {"name": "control_player", "arguments": "{not json"}}]}
    out, _, _ = turn(graph, "hello there friend", llm=FakeLLM(tool_msg=junk))
    assert out["answer_key"] == "NOT_UNDERSTOOD"


def test_fast_path_never_calls_router(graph):
    out, _, deps = turn(graph, "go back 10 seconds", llm=FakeLLM(tool_msg=tool("summarize")))
    assert out["route"] == "fast" and deps.llm.tool_calls == 0


def test_help_never_calls_llm(graph):
    out, _, deps = turn(graph, "what can I say", llm=FakeLLM(tool_msg=tool("summarize")))
    assert out["answer_key"] == "HELP" and deps.llm.tool_calls == 0


def test_deps_run_on_server_loop_from_worker_thread(graph):
    """The WS path: graph in a worker thread, network coroutines on the server loop."""

    async def main():
        deltas = []

        async def emit(d):
            deltas.append(d)

        deps = TurnDeps(
            retriever=Retriever(repo_with_lecture(), [KeywordEmbedder()]),
            llm=FakeLLM(answer="Base case [9:00]."),
            emit=emit,
            is_cancelled=lambda: False,
            loop=asyncio.get_running_loop(),
        )
        thread = str(uuid.uuid4())
        out = await asyncio.to_thread(
            graph.invoke,
            new_turn_input(
                session_id=thread,
                user_id="u",
                video_id=VID,
                language="en",
                max_watched_s=700,
                turn_id="t",
                raw_text="explain recursion",
                transcript_status="ready",
            ),
            {"configurable": {"thread_id": thread, "deps": deps}},
        )
        return out, deltas

    out, deltas = asyncio.run(main())
    assert out["citations"] == [{"start_s": 540.0}] and "".join(deltas) == "Base case [9:00]."


def test_cjk_citation_brackets_are_normalized(graph):
    llm = FakeLLM(answer="A base case stops it【9:00】.")
    out, deltas, _ = turn(graph, "explain recursion", watched=700, llm=llm)
    assert out["response_text"] == "A base case stops it[9:00]." and "".join(deltas) == out["response_text"]
    assert out["citations"] == [{"start_s": 540.0}]


def test_spoiler_rule_thresholds():
    from app.orchestration.graph import _is_spoiler
    from app.services.retrieval import Hit

    def h(sim, lex=0.0):
        return Hit(idx=0, start_s=0, end_s=1, text="", score=1, sim=sim, lex=lex)

    # calibrated on the MIT lecture at 26:00
    assert _is_spoiler([h(0.447)], [h(0.684)])  # "greedy ascent on a 2D matrix": not watched yet
    assert not _is_spoiler([h(0.591)], [h(0.642)])  # "why log n": covered at 24:38, answer it
    assert not _is_spoiler([h(0.457)], [h(0.474)])  # weak everywhere: let the model say so
    assert not _is_spoiler([h(0.3)], [])
    assert _is_spoiler([], [h(None, lex=2.0)])  # lexical-only index
    assert not _is_spoiler([h(None, lex=2.0)], [h(None, lex=2.5)])


def test_follow_up_retrieves_with_the_previous_question(graph):
    thread = str(uuid.uuid4())
    turn(graph, "explain recursion", watched=700, thread=thread)
    # OOS for the regex classifier → the router sends it to rag_agent, like the live model does
    llm = FakeLLM(answer="It calls itself until a base case [9:00].", tool_msg=tool("answer_question"))
    out, _, _ = turn(graph, "say that more simply", watched=700, llm=llm, thread=thread)
    assert "[9:00] recursion" in llm.messages[-1]["content"]
    assert out["citations"] == [{"start_s": 540.0}]
