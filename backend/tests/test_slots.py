from studyloop_nlp import normalize, parse_slots
from studyloop_nlp.slots import missing_slots


def s(text, intent):
    return parse_slots(normalize(text), intent)


def test_relative_seek():
    assert s("go back thirty seconds", "SEEK_BACK").duration_s == 30
    assert s("1 minute 30 seconds aage", "SEEK_FORWARD").duration_s == 90
    assert s("आधा मिनट पीछे", "SEEK_BACK").duration_s == 30
    assert s("thoda peeche", "SEEK_BACK").duration_s is None  # vague → executor default


def test_absolute_seek():
    assert s("12:30 पर जाओ", "SEEK_ABSOLUTE").timestamp_s == 750
    assert s("go to 1:02:03", "SEEK_ABSOLUTE").timestamp_s == 3723
    assert s("go to minute 12", "SEEK_ABSOLUTE").timestamp_s == 720
    assert s("go to 12 30", "SEEK_ABSOLUTE").timestamp_s == 750
    assert s("go to 1230", "SEEK_ABSOLUTE").timestamp_s == 750
    assert s("12 30 पर जाओ", "SEEK_ABSOLUTE").timestamp_s == 750
    assert missing_slots("SEEK_ABSOLUTE", s("go there", "SEEK_ABSOLUTE")) == ["timestamp_s"]


def test_speed():
    assert s("speed 1.5x", "SPEED").rate == 1.5
    assert s("स्पीड 1.25 कर दो", "SPEED").rate == 1.25
    assert s("play faster", "SPEED").rate_direction == "up"
    assert s("dheere chalao", "SPEED").rate_direction == "down"
    assert s("normal speed", "SPEED").rate == 1.0
    assert s("स्पीड डेढ़ कर दो", "SPEED").rate == 1.5
    assert s("speed ko do guna kar do", "SPEED").rate == 2
    assert s("play at two times speed", "SPEED").rate == 2
    assert missing_slots("SPEED", s("speed", "SPEED")) == ["rate"]


def test_volume():
    assert s("mute", "VOLUME").volume == "mute"
    assert s("unmute karo", "VOLUME").volume == "unmute"
    assert s("आवाज़ बंद करो", "VOLUME").volume == "mute"
    assert s("awaaz badhao", "VOLUME").volume == "up"


def test_semantic_topic():
    assert s("skip to the part where he explains backpropagation", "SEMANTIC_SEEK").topic == "backpropagation"
    assert s("gradient descent wala part dikhao", "SEMANTIC_SEEK").topic == "gradient descent"
    assert missing_slots("SEMANTIC_SEEK", s("skip to the part", "SEMANTIC_SEEK")) == ["topic"]
