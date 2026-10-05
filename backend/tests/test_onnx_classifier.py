"""CLASSIFIER=onnx (Tier 1c): the real serving path — onnxruntime + tokenizers + calibration.json — on a tiny
fixture bundle (tests/fixtures/tiny_intent_bundle, built by ml/make_test_bundle.py), plus the fallback to regex,
per-intent τ in routing, /health and the WS `ready` message. The trained bundle (~65 MB) is not in git: the last
test runs only where one exists (INTENT_MODEL_DIR, or ml/saved_models/intent-onnx/LATEST)."""

import os
import time
import uuid
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from langgraph.checkpoint.memory import MemorySaver

from app.config import get_settings
from app.main import create_app
from app.orchestration import onnx_classifier
from app.orchestration.graph import build_graph, new_turn_input
from app.orchestration.intents import Intent
from studyloop_nlp import normalize
from tests.conftest import recv

FIXTURE = Path(__file__).parent / "fixtures" / "tiny_intent_bundle"
REPO = Path(__file__).resolve().parents[2]


@pytest.fixture
def tiny():
    assert onnx_classifier.load(FIXTURE) == "onnx"
    yield onnx_classifier.active()
    onnx_classifier.unload()


@pytest.fixture
def onnx_env(monkeypatch):
    def use(model_dir: Path) -> None:
        monkeypatch.setenv("CLASSIFIER", "onnx")
        monkeypatch.setenv("INTENT_MODEL_DIR", str(model_dir))
        get_settings.cache_clear()

    yield use
    get_settings.cache_clear()
    onnx_classifier.unload()


def run(graph, text: str) -> dict:
    tid = str(uuid.uuid4())
    turn = new_turn_input(
        session_id=tid, user_id="u", video_id="v", language="en", turn_id=tid, raw_text=text
    )
    return graph.invoke(turn, {"configurable": {"thread_id": tid}})


def test_same_contract_as_the_regex_classifier(tiny):
    intent, conf = tiny.classify("pause")
    assert intent is Intent.PAUSE and isinstance(conf, float) and 0.8 < conf < 0.81
    assert tiny.classify("   ") == (Intent.OOS, 0.0)
    assert tiny.classify("kuch bhi")[0] is Intent.OOS  # unknown words vote OOS in the fixture


def test_temperature_softens_confidence_without_changing_the_answer(tiny, monkeypatch):
    intent, conf = tiny.classify("awaaz badhao")
    monkeypatch.setattr(tiny, "temperature", 3.0)
    hot_intent, hot_conf = tiny.classify("awaaz badhao")
    assert hot_intent is intent is Intent.VOLUME and hot_conf < conf


def test_per_intent_tau_falls_back_to_the_global_one(tiny):
    assert tiny.threshold(Intent.SEEK_BACK) == 0.95
    assert tiny.threshold("PAUSE") == tiny.threshold(Intent.VOLUME) == 0.5


def test_graph_routes_on_the_models_own_tau(tiny):
    g = build_graph(checkpointer=MemorySaver())
    fast = run(g, "pause")  # PAUSE at 0.81 ≥ τ 0.5 → fast path, no agent
    assert fast["route"] == "fast" and fast["action"] == {"type": "PAUSE"}
    assert "llm_router" not in fast["timings"]
    unsure = run(g, "thoda peeche jao")  # SEEK_BACK at 0.45 < its own τ 0.95 → llm_router, never a blind jump
    assert unsure["intent"] == "SEEK_BACK" and unsure["route"] == "llm" and unsure["action"] is None


def test_a_missing_bundle_keeps_the_regex_serving(tmp_path):
    status = onnx_classifier.load(tmp_path / "no-such-bundle")
    assert status.startswith("regex (onnx failed:") and onnx_classifier.active() is None
    out = run(build_graph(checkpointer=MemorySaver()), "go back 10 seconds")
    assert out["intent"] == "SEEK_BACK" and out["confidence"] == 0.95  # the regex's confidence
    onnx_classifier.unload()


def test_health_and_ws_say_onnx_when_it_serves(onnx_env):
    onnx_env(FIXTURE)
    with TestClient(create_app()) as c:
        body = c.get("/health").json()
        assert body["classifier"] == "onnx" and body["classifier_model"] == "tiny-test"
        with c.websocket_connect("/ws/session") as ws:
            ws.send_json({"type": "hello", "video_id": "HtSuA80QTyo"})
            assert recv(ws)["classifier"] == "onnx"
    assert onnx_classifier.active() is None  # unloaded on shutdown


def test_health_says_why_onnx_is_not_serving(onnx_env, tmp_path):
    onnx_env(tmp_path / "missing")
    with TestClient(create_app()) as c:
        body = c.get("/health").json()
        assert body["classifier"].startswith("regex (onnx failed:") and body["classifier_model"] is None
        with c.websocket_connect("/ws/session") as ws:
            ws.send_json({"type": "hello", "video_id": "HtSuA80QTyo"})
            assert recv(ws)["classifier"] == "regex"


def _real_bundle() -> Path | None:
    if os.environ.get("INTENT_MODEL_DIR"):
        return Path(os.environ["INTENT_MODEL_DIR"])
    latest = REPO / "ml" / "saved_models" / "intent-onnx" / "LATEST"
    if latest.exists():
        return latest.parent / latest.read_text(encoding="utf-8").strip()
    return None


@pytest.mark.skipif(_real_bundle() is None, reason="no trained bundle on this machine (ml/export_onnx.py)")
def test_trained_bundle_is_fast_and_sane():
    model = onnx_classifier.OnnxIntentClassifier(_real_bundle())
    for text, want in [
        ("go back 10 seconds", Intent.SEEK_BACK),
        ("वीडियो को pause कर दो", Intent.PAUSE),
        ("thoda aage badhao", Intent.SEEK_FORWARD),
        ("summarize so far", Intent.SUMMARIZE),
    ]:
        assert model.classify(normalize(text))[0] is want, text
    samples = [
        normalize(t) for t in ("pause", "10 second peeche jao", "speed 1.5 कर दो", "why is the peak unique")
    ]
    ms = []
    for _ in range(50):
        for s in samples:
            t0 = time.perf_counter()
            model.classify(s)
            ms.append((time.perf_counter() - t0) * 1000)
    ms.sort()
    assert ms[int(len(ms) * 0.95)] < 150  # the fast-path budget, server-side
