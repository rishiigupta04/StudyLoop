# Tier 0 — Push-to-talk playback control: smoke test

Run in **Chrome or Edge** (Firefox has no Web Speech recognition). Backend: `uvicorn app.main:app --reload --port 8000`; frontend: `npm run dev` → http://localhost:4028/video-study-page

Open with any video: `/video-study-page?v=<youtube id or url>` (default: MIT 6.006 Lecture 1, `HtSuA80QTyo`).

## Setup checks
- [ ] Header badge turns **Voice ready** (green) within a few seconds (on Render free tier the first wake can take ~1 min).
- [ ] Player loads the real video; ▶/⏸, ±10 s, mute, speed buttons and the progress bar all control it; time readout moves.
- [ ] First press of `~` asks for microphone permission once.
- [ ] Click inside the video, then press `~` — it still works (focus is pulled back to the page).

## English (EN toggle) — hold `~`, speak, release
| Say | Expect | Badge |
|---|---|---|
| "pause" / "play" | pauses / plays | Fast path |
| "go back 30 seconds" | −30 s from the *current* time | Fast path |
| "skip ten seconds" | +10 s | Fast path |
| "go to 12:30" | jumps to 12:30 | Fast path |
| "say that again" | −15 s and plays | Fast path |
| "play faster" / "speed 1.5" / "normal speed" | 1.25× / 1.5× / 1× | Fast path |
| "mute" / "unmute" / "louder" | as said | Fast path |
| "what is a peak" | honest "arrives with transcript Q&A (Tier 1b)", spoken aloud | Transcript Q&A |
| "skip to the part about complexity" | honest "arrives with transcript search" | Semantic seek |
| "note this down" | honest "voice notes arrive in Tier 1e" | Notes agent |
| "the weather is nice" | "didn't catch that" + examples | LLM fallback |

- [ ] Every fast-path reply shows `server < 150 ms` in the modal badges (typically 5–15 ms) and the modal closes itself.
- [ ] While `~` is held during playback the lecture audio ducks, and restores after.
- [ ] Pressing `~` while an answer is being spoken stops the speech immediately (barge-in).

## Hindi / Hinglish (हिं toggle) — manual pass by a Hindi speaker is required
| Say | Expect |
|---|---|
| "रुको" / "चलाओ" | pause / play |
| "थोड़ा पीछे जाओ" | −10 s, confirmation "10 सेकंड पीछे" |
| "दस सेकंड आगे करो" | +10 s |
| "बारह तीस पर जाओ" or "12:30 पर जाओ" | jump to 12:30 |
| "स्पीड डेढ़ कर दो" / "स्पीड 1.5 कर दो" | 1.5× |
| "आवाज़ बंद करो" | mute |
| "फिर से दिखाओ" | replay last 15 s |
| "ये क्या है" | Hindi "Q&A आएगा" message, spoken in a Hindi voice if the OS has one |

- [ ] The modal's "normalized" intent badges show the command went **Fast path**, not LLM fallback — if a Hindi command lands on "LLM fallback", note the exact phrase: it's classifier training data for Tier 1c.

## Natural, hands-free phrasing (any toggle unless noted)
The full scenario list (743 phrasings, EN / Hinglish / Devanagari) runs in CI as `tests/test_voice_corpus.py`; this is the part worth hearing through a real microphone.

| Say | Expect |
|---|---|
| "go back half a minute" / "a minute and a half back" | −30 s / −90 s |
| "go back 30 seconds **and play**" / "pause and go back 10 seconds" | seeks, then plays / stays paused |
| "restart" / "शुरू से चलाओ" | 0:00 and playing |
| "go to the middle" / "go to 75 percent" / "go to the end" | 50% / 75% / 30 s before the end |
| "undo" / "go back to where I was" / "wapas wahin jao" | returns to the spot before the last jump (say it twice to toggle) |
| "it's too fast" / "बहुत तेज़ बोल रहा है" | one step slower |
| "speed dedh karo" / "double speed" / "normal speed" | 1.5× / 2× / 1× |
| "volume 50" / "full volume" / "awaaz aadhi karo" | 50% / 100% / 50% |
| "I can't hear" / "आवाज़ नहीं आ रही" | louder (and unmuted) |
| "what did he say?" / "kya bola?" / "I didn't catch that" | replays the last 15 s |
| "can you pause the video?" / "kya aap video rok sakte hain" | pauses (polite requests work) |
| "thanks" / "got it" / "theek hai samajh gaya" | modal closes, nothing else happens |
| "help" / "what can I say?" | spoken list of commands |

## Precision — these must NOT move the video
| Say | Expect |
|---|---|
| "why did he go back to the previous slide?" | Transcript Q&A (Tier 1b stub), no seek |
| "is merge sort faster than quick sort?" | Transcript Q&A, speed unchanged |
| "what is the volume of a sphere?" | Transcript Q&A, volume unchanged |
| "don't skip" / "mat skip karo" | "didn't catch that", nothing happens |
| "ye algorithm tez kyun hai?" | Transcript Q&A |

Dev tip: without a microphone (e.g. the Claude preview pane), `await window.__studyloopSay('go back 30 seconds')` in the console runs the same pipeline as a spoken turn. Dev builds only.

## Resilience
- [ ] Stop the backend mid-session → badge goes "Connecting…"; restart → reconnects on its own; a command during the outage shows a clear error instead of hanging.
- [ ] A 5-minute session of mixed commands: no console errors, no crash.
