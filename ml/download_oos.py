"""Download the out-of-scope negatives: CLINC150 (CC BY 3.0) and SNIPS (CC0) → data/external/ (gitignored).

    ml/.venv/Scripts/python ml/download_oos.py

The datasets themselves are never committed; dataset.py samples from them with a fixed seed. Intents that
overlap StudyLoop's taxonomy are excluded rather than relabelled (see EXCLUDE): for us "can you repeat that" is
REPLAY, "turn up the volume" is VOLUME, "thanks" dismisses the answer, "define X" is a question about the lecture.
"""

from __future__ import annotations

import json

import httpx

from common import EXTERNAL

CLINC_URL = "https://raw.githubusercontent.com/clinc/oos-eval/master/data/data_full.json"
SNIPS_URL = "https://raw.githubusercontent.com/sonos/nlu-benchmark/master/2017-06-custom-intent-engines/{i}/train_{i}_full.json"
SNIPS_INTENTS = [
    "GetWeather",
    "BookRestaurant",
    "RateBook",
    "SearchCreativeWork",
    "SearchScreeningEvent",
    "AddToPlaylist",
]
# PlayMusic is left out on purpose: "play some jazz" would teach the model that "play ..." can be OOS.

EXCLUDE = {
    # would be a StudyLoop intent
    "repeat",  # REPLAY
    "change_volume",  # VOLUME
    "change_speed",  # SPEED (of the assistant's voice, but worded like ours)
    "whisper_mode",  # VOLUME-like
    "play_music",  # PLAY-like
    "cancel",  # STOP_SPEAKING-like
    "thank_you",  # STOP_SPEAKING (acknowledgement)
    "goodbye",  # STOP_SPEAKING-like
    "yes",
    "no",
    "maybe",
    # general-knowledge questions a student could ask about a lecture (ASK)
    "definition",
    "meaning_of_life",
    "fun_fact",
    "calculator",
    "spelling",
    "translate",
    "measurement_conversion",
    # "skip this song" / "add it to my list" / "remind me" read like SEEK_FORWARD, PLAY and TAKE_NOTE
    "next_song",
    "what_song",
    "update_playlist",
    "reminder",
    "reminder_update",
    "todo_list",
    "todo_list_update",
    "shopping_list",
    "shopping_list_update",
}
# CLINC's own "oos" split is not used either: it is full of academic questions ("why are exponents performed
# before multiplication") — exactly what ASK means for a student watching a lecture.


def main() -> None:
    EXTERNAL.mkdir(parents=True, exist_ok=True)
    with httpx.Client(timeout=60, follow_redirects=True) as client:
        r = client.get(CLINC_URL)
        r.raise_for_status()
        (EXTERNAL / "clinc150_full.json").write_bytes(r.content)
        clinc = r.json()
        print(f"CLINC150: {len(clinc['train'])} train, {len(clinc['oos_train'])} oos_train")
        for intent in SNIPS_INTENTS:
            r = client.get(SNIPS_URL.format(i=intent))
            r.raise_for_status()
            data = json.loads(r.content.decode("utf-8", errors="replace"))
            texts = ["".join(part["text"] for part in ex["data"]).strip() for ex in data[intent]]
            (EXTERNAL / f"snips_{intent}.json").write_text(
                json.dumps(texts, ensure_ascii=False), encoding="utf-8"
            )
            print(f"SNIPS {intent}: {len(texts)}")


if __name__ == "__main__":
    main()
