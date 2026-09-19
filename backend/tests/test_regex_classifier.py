import pytest

from app.orchestration.intents import Intent
from app.orchestration.regex_classifier import classify
from studyloop_nlp import normalize

CASES = [
    # English
    ("pause", Intent.PAUSE),
    ("stop the video", Intent.PAUSE),
    ("play", Intent.PLAY),
    ("resume", Intent.PLAY),
    ("go back 10 seconds", Intent.SEEK_BACK),
    ("rewind a bit", Intent.SEEK_BACK),
    ("skip 30 seconds", Intent.SEEK_FORWARD),
    ("go forward one minute", Intent.SEEK_FORWARD),
    ("go to 12:30", Intent.SEEK_ABSOLUTE),
    ("jump to minute 12", Intent.SEEK_ABSOLUTE),
    ("say that again", Intent.REPLAY),
    ("play faster", Intent.SPEED),
    ("speed 1.5x", Intent.SPEED),
    ("mute", Intent.VOLUME),
    ("skip to the part where he explains backpropagation", Intent.SEMANTIC_SEEK),
    ("what is gradient descent", Intent.ASK),
    ("why do we square the error", Intent.ASK),
    ("summarize so far", Intent.SUMMARIZE),
    ("note this down", Intent.TAKE_NOTE),
    ("stop talking", Intent.STOP_SPEAKING),
    ("the weather is nice", Intent.OOS),
    # Hinglish (Latin)
    ("ruko", Intent.PAUSE),
    ("chalao", Intent.PLAY),
    ("thoda peeche jao", Intent.SEEK_BACK),
    ("das second aage karo", Intent.SEEK_FORWARD),
    ("12:30 pe jao", Intent.SEEK_ABSOLUTE),
    ("phir se dikhao", Intent.REPLAY),
    ("speed tez karo", Intent.SPEED),
    ("awaaz band karo", Intent.VOLUME),
    ("gradient descent wala part dikhao", Intent.SEMANTIC_SEEK),
    ("ye kya hai", Intent.ASK),
    ("ab tak kya hua", Intent.SUMMARIZE),
    ("ye note kar lo", Intent.TAKE_NOTE),
    ("bas", Intent.STOP_SPEAKING),
    # Devanagari (as Chrome hi-IN returns it) — must work via normalize()
    ("रुको", Intent.PAUSE),
    ("वीडियो पॉज़ करो", Intent.PAUSE),
    ("थोड़ा पीछे जाओ", Intent.SEEK_BACK),
    ("दस सेकंड आगे करो", Intent.SEEK_FORWARD),
    ("12:30 पर जाओ", Intent.SEEK_ABSOLUTE),
    ("आवाज़ बंद करो", Intent.VOLUME),
    ("स्पीड 1.5 कर दो", Intent.SPEED),
    ("फिर से दिखाओ", Intent.REPLAY),
    ("चलाओ", Intent.PLAY),
    ("मुझे समझाओ", Intent.ASK),
    ("स्पीड डेढ़ कर दो", Intent.SPEED),
    ("12 30 पर जाओ", Intent.SEEK_ABSOLUTE),
    # recognizer output without a colon
    ("go to 12 30", Intent.SEEK_ABSOLUTE),
    ("go to 1230", Intent.SEEK_ABSOLUTE),
]


@pytest.mark.parametrize("text,expected", CASES)
def test_regex_baseline(text, expected):
    intent, conf = classify(normalize(text))
    assert intent == expected, f"{text!r} → {normalize(text)!r} → {intent}"
    assert (conf >= 0.9) == (expected != Intent.OOS)


def test_empty():
    assert classify("") == (Intent.OOS, 0.0)
