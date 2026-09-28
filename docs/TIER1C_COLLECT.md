# Collect page (Tier 1c): running a recording session

The dev-only page that turns `docs/TIER1C_DATA_PLAN.md` into clips. One speaker does 70 clips (14
intents × 5, the CO4 minimum) in about 20 minutes, hands-on-keyboard the whole time, and walks away
with a ZIP of audio + a JSONL of labels.

**It is not part of the product.** The route only exists when `VITE_COLLECT=true`: with the flag
unset, Rollup drops the branch and the whole chunk, `/collect` falls through to NotFound, and none of
the scenario text is in the bundle. It is also deliberately outside `RequireAuth` — six speakers
should not each sign in to hold down a key.

## Run it

```bash
# backend on 8001 with REQUIRE_AUTH=false, frontend on 4029 with the flag (preview_start configs)
VITE_COLLECT=true npm run dev -- --port 4029
```

Then open `http://localhost:4029/collect`. `/health` should say `"stt": true` — without it the clips
still record, they just carry no hosted transcript (`stt_status: "skipped"`).

On this machine the two `preview_start` configs `backend-1a` and `frontend-1a` already do exactly
this; `frontend-1a` carries `VITE_COLLECT=true`.

## The session

1. **Setup screen** — speaker pseudonym (never a real name), clips per intent (5 = CO4 minimum,
   8 = target), mic, room, and the background lecture's YouTube id. Earlier sessions on the machine
   are listed with Resume / JSONL / ZIP / Delete.
2. **Press play on the lecture** (button, or `L`). Real conditions matter: the app ducks it to 15%
   while `~` is held, which is the noise floor the classifier will actually see.
3. **Cards.** One situation at a time, in the language assigned to that card — never the command
   itself. The speaker says whatever they would really say.

| key | |
|---|---|
| `~` hold | record while held |
| `→` / `Enter` | skip this card |
| `←` | back one card |
| `⌫` | drop the last clip and return to its card (re-record) |
| `T` | operator view: the intent, the scenario id, the other two languages, the pair tags |
| `L` | play/pause the lecture |

The card advances the moment the key comes up. Storing the clip, the browser transcript and the
`/api/stt` round trip (~300–560 ms observed) all happen behind the speaker, so there is no waiting
between cards. A press under 350 ms is dropped and the card comes back.

Clips (audio included) live in IndexedDB, so a stray reload costs nothing — resume picks up on the
same card with every transcript intact.

## What a clip stores

`clip_id`, `session_id`, `speaker_id`, `recorded_at`, `scenario_id`, the scenario text as shown,
`intended_intent`, `final_label` (= intended, for the auditor to overwrite), `labeler`, `lang_style`,
`mic`, `noise`, `lecture_playing`, `audio_file`, `audio_type`, `duration_ms`, `browser_text`,
`groq_text`, `sarvam_text`, `stt_provider`, `stt_ms`, `stt_status`, `notes`.

**Export ZIP** → `real_speech_<speaker>_<yyyymmdd>.zip` = `audio/<clip_id>.webm` + `labels.jsonl`.
**Export JSONL** → the labels alone.

The ZIP goes to the private Drive folder. **Audio never enters git** — only the JSONL, as
`ml/data/real_speech_*.jsonl`. Get written consent to record voice for the course project first.

## The deck

`frontend/src/lib/collectScenarios.json`, 91 scenarios × 3 languages, every intent in
`orchestration/intents.py` with at least 5 situations each so a 5-clip bucket never repeats one.
Scenarios tagged `pairs` are the confusable pairs of data plan §4; the sidebar shows whether each
pair has been hit in all three styles.

`backend/tests/test_collect_scenarios.py` guards the deck: intents in step with the taxonomy, ids
unique, all three languages written, Hindi actually in Devanagari, no card that reads like the
command itself, every §4 pair declared and spanning both of its intents, and both halves of the
decided rule ("I missed the bit where he defined X" → SEMANTIC_SEEK, "I missed that" → REPLAY).

Adding a scenario is a JSON edit; the test tells you if it breaks the balance.

## Known limits

- **Sarvam STT never sees these clips.** The key is configured and Sarvam works (an MP3 round-trips
  in ~540 ms), but its `/speech-to-text` rejects `audio/webm;codecs=opus` — *"Only ['audio/mpeg',
  'audio/mp3', …, 'audio/wav', …]"* — so `/api/stt` falls through to Groq Whisper for every browser
  recording, in this page **and in the live app**. `sarvam_text` therefore stays empty for now. This
  is exactly why the audio is kept: a `webm → wav` transcode re-runs Sarvam over the whole corpus
  later without re-recording anyone. Fixing it properly means transcoding (or recording WAV) in
  `services/speech.py` — a D14 change, not a Collect-page one.
- **`browser_text` needs Chrome or Edge** with microphone permission; the Web Speech API uses the
  real device, not the recorded blob. Where it is unavailable the page says so and the field stays
  empty.
- Groq romanizes Hindi and sometimes translates it outright ("रनिंग टाइम वाले हिस्से पर ले चलो" came
  back as "take it to the part of running time"). That is a finding for the per-provider accuracy
  table, not a bug.

## Verified by Claude (28 Sep 2026, backend-1a + frontend-1a)

Real audio, synthetic mic: hosted TTS speech was fed into a `MediaStreamAudioDestinationNode` in
place of the microphone (the pane blocks device capture), so `audioCapture` → `MediaRecorder` →
`POST /api/stt` → IndexedDB → export all ran for real. The `~` press was a dispatched
`KeyboardEvent`.

- 4 clips recorded across EN and HI cards; every one transcribed by Groq in 299–557 ms while the
  next card was already on screen.
- `⌫` dropped clip `…_004` and returned to card 4/70; the re-record came back as `…_005`.
- Full page reload → the session listed with 4 clips → Resume landed on card 5/70 with all four
  audio blobs (3.8–6.2 kB) and transcripts intact.
- Export JSONL: 4 rows, schema above, Devanagari intact. Export ZIP: 22,730 bytes, 5 entries
  (4 × `audio/<clip_id>.webm` + `labels.jsonl`), all stored.
- The ZIP writer separately round-tripped a 20 kB binary through Python's `zipfile`:
  `testzip()` → `None` (CRCs pass), bytes identical, UTF-8 filenames and content preserved.
- Builds: with `VITE_COLLECT=true` a separate 62 kB `CollectPage` chunk; without it, no chunk and no
  trace of the page in `index.js`.

**Not verified:** a real microphone, real human speech, `browser_text`, and the lecture-ducking with
audible playback. Those need Rishi's first live session.
