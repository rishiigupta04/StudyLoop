import pytest

from studyloop_nlp import normalize, transliterate


@pytest.mark.parametrize(
    "raw,expected",
    [
        ("थोड़ा पीछे जाओ", "thoda peeche jao"),
        ("वीडियो पॉज़ करो", "video pause karo"),
        ("दस सेकंड आगे करो", "10 seconds aage karo"),
        ("12:30 पर जाओ", "12:30 par jao"),
        ("आधा मिनट पीछे", "0.5 minutes peeche"),
        ("आवाज़ बंद करो", "awaaz band karo"),
        ("फिर से दिखाओ", "phir se dikhao"),
        ("मुझे समझ नहीं आया", "mujhe samajh nahi aaya"),
        ("Go back thirty seconds!", "go back 30 seconds"),
        ("speed 1.5 x please", "speed 1.5x please"),
        ("skip 10s", "skip 10 seconds"),
        ("१२:३० पे चलो", "12:30 pe chalo"),
        # number words as a playback rate
        ("स्पीड डेढ़ कर दो", "speed 1.5 kar do"),
        ("speed ko do guna kar do", "speed ko 2 guna kar do"),
        ("play at two times speed", "play at 2 times speed"),
        ("सवा स्पीड", "1.25 speed"),
        # colon-less times in a seek context (how recognizers often write them)
        ("go to 12 30", "go to 12:30"),
        ("go to 1230", "go to 12:30"),
        ("jump to 1.30", "jump to 1:30"),
        ("12 30 पर जाओ", "12:30 par jao"),
        ("1230 पे चलो", "12:30 pe chalo"),
    ],
)
def test_normalize(raw, expected):
    assert normalize(raw) == expected


@pytest.mark.parametrize(
    "raw",
    [
        "speed up a bit",  # "a" is an article here, not a rate
        "speed kam kar do",  # the trailing "do" is the verb "give", not 2
        "set volume to 100",  # not a seek context
        "go to 1275",  # 75 isn't a valid minute
        "go back 130 seconds",  # a duration, not a clock
        "do teen baar",  # "two-three times", not 2:03
    ],
)
def test_normalize_leaves_non_matches_alone(raw):
    assert normalize(raw) == raw


@pytest.mark.parametrize(
    "raw,expected",
    [("करना", "karna"), ("समझना", "samajhna"), ("कमल", "kamal"), ("नमस्ते", "namaste"), ("अभी", "abhi")],
)
def test_schwa_deletion(raw, expected):
    assert transliterate(raw) == expected


def test_latin_passthrough_and_idempotent():
    s = "what is gradient descent"
    assert normalize(s) == s
    assert normalize(normalize("थोड़ा पीछे जाओ")) == normalize("थोड़ा पीछे जाओ")


def test_mixed_script_hinglish():
    assert normalize("gradient descent क्या है") == "gradient descent kya hai"
