# Tier 1c — the real-speech data to record (CO4)

The number we quote for CO4 is **accuracy + macro-F1 on a real-speech test set**: spoken by people, turned into text by
the same speech pipeline the app uses, then passed through `normalize()`. Synthetic and paraphrase data are only for
training. This file is what Rishi and the team need to record, and how.

## 1. What changed since the roadmap was written: record audio, not only text

With D14, the text the classifier sees in production comes from **hosted STT** (Sarvam Saaras codemix → Groq
Whisper → browser fallback), not the browser recognizer. They produce different text for the same speech: Saaras writes
Hindi in Devanagari and numbers as digits; Whisper often romanizes; the browser guesses one language up front.

So **keep the audio of every clip**. Transcribe it with each provider (Sarvam once the key exists, Groq now, browser
text captured live) and report accuracy per provider. The headline number is for the provider we ship, and
re-recording is never needed if the STT changes.

## 2. How much

| | Minimum (CO4 claim) | Target |
|---|---|---|
| Speakers | 6 (4 teammates + 2 friends) | 10+, mixed gender, at least 3 who naturally speak Hinglish |
| Clips per speaker per intent | 5 | 8 |
| Total clips | 6 × 14 × 5 = **420** (30 per intent) | ~1,100 |
| Language mix per speaker | ⅓ English, ⅓ Hinglish, ⅓ Hindi | same |

- **Split by speaker:** test speakers never appear in train/validation. Plan 2–3 held-out speakers who record
  *only* for the test set, and never read the corpus or the prompts file.
- **OOS:** at least 30 clips of small talk, off-topic questions, "help", half sentences and false starts.

## 3. How to record (so it's real speech, not reading)

- **Scenario cards, not scripts.** Show a situation ("you missed the last sentence", "the lecture is too fast",
  "you want to jump to where he explains recursion") and let the speaker say it their own way. Reading a
  written command produces the corpus back, which inflates accuracy.
- **Real conditions:** laptop mic, the lecture playing in the background (the app ducks it to 15 % while `~` is held),
  both with and without headphones, a quiet room and a normal room. Natural pace, including hesitations ("uh,
  go back… thirty seconds").
- **Slots matter:** vary the numbers and timestamps said in Hindi ("tees second", "पंद्रह मिनट", "saade baarah pe"),
  speeds, volume levels, and topics for semantic seek. The action is checked end to end, not just the intent.
- **Per clip, store:** `clip_id, speaker_id (pseudonym), scenario/intended_intent, lang_style (en|hinglish|hi),
  mic, noise, audio file, browser_text, groq_text, sarvam_text (later), final_label, labeler, notes`.
- **Labeling:** the label is the intended intent, *audited* afterwards. If the speaker said something else, relabel
  per the rules in `backend/tests/voice_corpus.py` (e.g. "I didn't hear that" = REPLAY, "I didn't get it" = ASK,
  questions that contain command words = ASK). Two people label the test set independently; disagreements are
  resolved and logged (report the agreement).
- **Consent + privacy:** written consent to record voice for a course project. Audio stays in a private
  Drive folder, **never in git**. Only the transcripts and labels go into the repo (`ml/data/real_speech_*.jsonl`).

## 4. Confusable pairs to cover on purpose (each needs clips in all three styles)

| Pair | Why it's hard | Examples to elicit |
|---|---|---|
| **ASK vs REPLAY** | Questions *about* what was said, vs asking to hear it again | Known regex misfires: "the professor's name was what again" (→ ASK, regex says REPLAY), "I missed the bit where he defined the peak" (→ SEMANTIC_SEEK or REPLAY? label rule needed, see below), "wait what did he just say about the peak" (regex: REPLAY) |
| STOP_SPEAKING vs PAUSE | "stop" / "bas" / "ruko" can mean *stop talking* or *stop the video* | say them while an answer is being spoken vs while the lecture plays |
| SEMANTIC_SEEK vs ASK | "the part about backprop" vs "what about backprop" | "take me to where he explains X" / "X wala part" / "X kya hai" |
| SUMMARIZE vs ASK | "what's this about" vs "what's X" | "ab tak kya hua", "recap karo", "what did I miss" |
| TAKE_NOTE vs ASK | "note that a peak always exists" is a note; "is it important to note that…?" is a question | dictated notes with content |
| SEEK_BACK vs REPLAY | "go back a bit" vs "say that again" | both, with and without durations |
| VOLUME vs SPEED | "too fast" / "too loud" / "slow down" / "dheere" (dheere = slower **or** quieter) | complaints phrased as adjectives |
| SEEK_ABSOLUTE vs SEEK_FORWARD | "go to 12:30" vs "12 minute aage" | Hindi numbers, "saade", "sawa", "paune" |

**Decision needed before labeling (taxonomy is frozen, but the rule isn't written):** "I missed the bit where he defined
X" names a topic, so it's a **SEMANTIC_SEEK** to the definition, or a REPLAY if no topic is named. My proposal:
*topic named → SEMANTIC_SEEK, no topic → REPLAY*. Confirm it, and I'll add it to the labeling rules and the corpus.

## 5. What I can build next to make recording fast (say go)

A dev-only **Collect** page in the app:
- it shows a random scenario card (EN/HI) for a chosen speaker;
- hold `~` to record, using the same `lib/audioCapture.ts` path as the app;
- it saves the WebM clip + browser text + `/api/stt` text + the intended label;
- it exports a ZIP (audio) + JSONL (labels) at the end of the session.

With that, a speaker can do their 70–110 clips in about 20 minutes. The same run also gives the D14 STT comparison
(browser vs Groq vs Sarvam) for free.

Then the Tier 1c pipeline itself (`ml/`): synthetic set from the corpus + paraphrases → the same `normalize()` → the
regex baseline, TF-IDF+LogReg, DistilBERT (+ multilingual variant) → ONNX INT8 → calibration/τ sweep →
`CLASSIFIER=onnx`, reported on the real-speech test set per STT provider.
