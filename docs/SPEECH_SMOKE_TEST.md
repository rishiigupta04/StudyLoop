# Hosted speech (roadmap D14): smoke test

What changed:
- **Speech to text.** Push-to-talk audio is recorded (Opus/WebM) and sent to `POST /api/stt`.
  - Primary: **Sarvam Saaras v3** (`codemix`, language auto-detected).
  - Fallback: **Groq Whisper large-v3** (Hinglish prompt).
  - If both fail, the browser's own transcript is used.
- **Text to speech.** Answers are spoken with **Sarvam Bulbul v3** (`POST /api/tts`, one sentence per request, prefetched). The browser voice is the fallback.
- **Text layer.** Hindi number words now match loose romanized spellings ("chaalis", "pandra", "tis"), and "10 percent pe volume set karo" works in any word order.
- **Diagnostics.** The voice modal shows `speech: sarvam|groq|browser NNN ms`.

Could affect earlier tiers: the PTT flow (`useTildePTT`, `lib/tts.ts`). Without keys, the behaviour is exactly Tier 0/1b's.

## Setup (Rishi)
1. Create a Sarvam account at dashboard.sarvam.ai (₹100 in free credits) and copy the API key.
2. Put `SARVAM_API_KEY=` in `backend/.env`, and in the Render dashboard (it's listed in `render.yaml` with `sync: false`).
3. Restart the backend. `/health` should then show `"stt": true, "tts": true`.
4. Render must rebuild, because `python-multipart` was added to `requirements.txt`.

## Verified by Claude (19 Sep 2026; no Sarvam key yet, so Groq Whisper was the STT)
- SAPI-synthesized clips (an English voice reading English and Hinglish) → `/api/stt` → Groq, about 250 ms each (the first call was 570 ms):
  - "tees second aage jao" → SEEK_FORWARD 30 s
  - "pandrah minute aage jao" → SEEK_FORWARD 900 s
  - "volume das percent karo" → VOLUME set 10
  - "go back thirty seconds" → SEEK_BACK 30 s
  - "set the volume to ten percent" → VOLUME set 10
  - "skip fifteen minutes ahead" → SEEK_FORWARD 900 s
- From the browser (the Vite page importing `speechService`): the upload came back as "tees second aage jao" in a 429 ms round trip.
- TTS without a key: the server answers 503, the client falls back to the browser voice for the page's lifetime, and the stream finishes cleanly.
- 1074 backend tests pass (11 new STT/TTS tests using mocked Sarvam and Groq, plus 11 for spellings and volume word order). tsc and a scratch build pass.
- **Not verified:** real Sarvam calls (no key), a real microphone, and real Hindi speech. Those are the pass below.

## Your pass (Chrome/Edge first, then Firefox)
Hold `~` and speak naturally. After each command, check the `speech:` chip in the voice modal.

| Say | Expect |
|---|---|
| tees second aage jaao | Forward 30s |
| pandrah minute aage jao | Forward 15 min |
| 10 percent pe volume set karo | Volume 10% |
| दो मिनट पीछे जाओ | Back 120s |
| speed dedh karo | Speed 1.5x |
| chaalis second peeche | Back 40s |
| 12:30 pe jao | Jumped to 12:30 |
| volume pachaas karo | Volume 50% |
| go back thirty seconds | Back 30s |
| peak finding wale part pe jao | Jumps to the peak-finding part |
| ये नोट कर लो | Note saved |

- [ ] Every row above is correct, with `speech: sarvam` and a speech time under ~800 ms.
- [ ] Ask a question in हिं mode: the answer is spoken in a natural Indian voice (Bulbul), and the first sentence starts within ~1.5 s of the text appearing.
- [ ] Barge-in: press `~` while an answer is being spoken → the audio stops at once.
- [ ] Temporarily set `STT_PROVIDERS=groq` → the same table still works (`speech: groq`).
- [ ] Temporarily remove `SARVAM_API_KEY` → answers use the browser voice, and nothing breaks.
- [ ] **Firefox** (no browser SpeechRecognition): with hosted STT, voice commands now work (there are no live captions while holding the key).
- [ ] Deny the mic permission → the error message is clear.
- [ ] A 1 s tap of `~` with silence → "Didn't catch anything"; no "Thank you." hallucination.

Tell me any phrase that misfires. It goes into the Tier 1c test set.
