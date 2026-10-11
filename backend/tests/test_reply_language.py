"""Auto language: the reply follows the language the learner used (English / Hindi / Hinglish)."""

import pytest

from app.orchestration.graph import _system_prompt
from app.orchestration.reply_language import detect_reply_language
from tests.conftest import recv
from tests.test_ws import client

EN, HI, MIX = ("en", False), ("hi", False), ("hi", True)


@pytest.mark.parametrize(
    "text, expected",
    [
        ("what is a peak in this algorithm?", EN),
        ("go back 30 seconds", EN),
        ("summarize the last five minutes", EN),
        ("can you explain the time complexity again", EN),
        ("what is the matlab of this", EN),  # one Hindi word in an English sentence stays English
        ("पीक क्या होता है", HI),
        ("पिछले पांच मिनट का सारांश बताओ", HI),
        ("binary search क्या है", MIX),  # Devanagari next to as many English words: Hinglish
        ("yeh peak kya hota hai", MIX),
        ("pichhle 5 minute ka summary do", MIX),
        ("ye algorithm samjhao", MIX),
        ("thoda peeche jao", MIX),
        ("time complexity ko simple words mein batao", MIX),
    ],
)
def test_detects_the_language_used(text, expected):
    assert detect_reply_language(text) == expected


@pytest.mark.parametrize("text", ["pause", "12:30", "volume 50", "speed up"])
def test_a_short_command_keeps_the_conversation_language(text):
    assert detect_reply_language(text, previous=MIX) == MIX
    assert detect_reply_language(text, previous=EN) == EN
    assert detect_reply_language(text) == EN  # nothing to go on: English
    assert detect_reply_language(text, stt_language="hi-IN") == MIX  # the STT provider heard Hindi


def test_a_clear_sentence_wins_over_the_previous_language():
    assert detect_reply_language("what does the professor say about peaks", previous=MIX) == EN
    assert detect_reply_language("yeh kya hai", previous=EN) == MIX


def test_prompt_names_the_reply_language():
    assert "Reply in English" in _system_prompt("en", 60, False)
    hi = _system_prompt("hi", 60, False)
    assert "Hindi, written in Devanagari" in hi and "Hinglish" not in hi
    mix = _system_prompt("hi", 60, False, code_mix=True)
    assert "Hinglish" in mix and "Devanagari" in mix


def test_ws_auto_mode_answers_in_the_language_of_each_turn():
    with client().websocket_connect("/ws/session") as ws:
        ws.send_json({"type": "hello", "video_id": "HtSuA80QTyo", "language": "auto"})
        assert recv(ws)["type"] == "ready"

        ws.send_json({"type": "utterance", "turn_id": "t1", "text": "go back 30 seconds", "playback_s": 120})
        msg = recv(ws)
        assert msg["language"] == "en" and msg["code_mix"] is False and msg["message"] == "Back 30s"

        ws.send_json({"type": "utterance", "turn_id": "t2", "text": "thoda peeche jao", "playback_s": 120})
        msg = recv(ws)
        assert msg["language"] == "hi" and msg["code_mix"] is True
        assert msg["action"]["type"] == "SEEK_RELATIVE" and msg["message"] != "Back 10s"  # the Hindi template

        ws.send_json({"type": "utterance", "turn_id": "t3", "text": "pause", "playback_s": 120})
        assert recv(ws)["language"] == "hi"  # too short to tell: stays in the conversation's language

        ws.send_json({"type": "utterance", "turn_id": "t4", "text": "what is this lecture about"})
        assert recv(ws)["language"] == "en"


def test_ws_forced_language_ignores_what_was_said():
    with client().websocket_connect("/ws/session") as ws:
        ws.send_json({"type": "hello", "video_id": "HtSuA80QTyo", "language": "en"})
        assert recv(ws)["type"] == "ready"
        ws.send_json({"type": "utterance", "turn_id": "t1", "text": "thoda peeche jao", "playback_s": 120})
        msg = recv(ws)
        assert msg["language"] == "en" and msg["code_mix"] is False and msg["message"] == "Back 10s"


@pytest.mark.parametrize(
    "text, expected",
    [
        ("Explain that in Hindi", MIX),
        ("उसे हिंदी में समझाओ", MIX),
        ("hindi mein batao", MIX),
        ("Explain that in English", EN),
        ("english mein samjhao", EN),
        ("what is a peak", None),
    ],
)
def test_explicit_language_request(text, expected):
    from app.orchestration.reply_language import requested_language

    assert requested_language(text) == expected


def test_ws_explicit_request_beats_auto_and_the_toggle():
    with client().websocket_connect("/ws/session") as ws:
        ws.send_json({"type": "hello", "video_id": "HtSuA80QTyo", "language": "en"})
        assert recv(ws)["type"] == "ready"
        ws.send_json({"type": "utterance", "turn_id": "t1", "text": "Explain that in Hindi"})
        assert recv(ws)["language"] == "hi"
        ws.send_json({"type": "language", "language": "auto"})
        ws.send_json({"type": "utterance", "turn_id": "t2", "text": "english mein samjhao"})
        assert recv(ws)["language"] == "en"
