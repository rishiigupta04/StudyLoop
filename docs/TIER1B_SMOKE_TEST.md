# Tier 1b smoke test: semantic seek + transcript Q&A

Lecture: MIT 6.006 L1 `HtSuA80QTyo` (already `ready` in the live DB). Restart the backend first (no `--reload`).

## Verified by Claude (19 Sep 2026, live BGE-M3 + Groq + Supabase, over the WebSocket, no browser)
Latency is server-side, warm.

| Check | Result |
|---|---|
| "skip to the part about 2D peak finding" | → 36:15 (2D definition), ~400 ms, no LLM |
| "take me to the part about the course grading" | → 15:08 ("the course grading break down…") |
| "2D peak finding wala part dikhao" (Hinglish) | → 35:27 |
| "skip to the part about quantum physics" | "couldn't find that topic" (best sim 0.451 < 0.5) |
| At 26:00: "what is a peak in a 1D array" | Grounded answer, cites [16:38] [17:27], first token ~1 s |
| At 26:00: "how does greedy ascent work on a 2D matrix" | "The lecture hasn't covered that yet" (future 0.684 vs watched 0.447) — **spoiler test passes** |
| At 26:00: "why log n" | Answered (the 24:38 binary-search part was watched) |
| "summarize so far" / "अब तक क्या पढ़ाया" | Summary of 0–26:00 only, with citations; Hindi in Devanagari |
| "peak kya hota hai" (hi) | Devanagari answer with [16:38] [17:27] |
| "crank that up" (regex misses) | → `llm_router` tool call → VOLUME up, ~520 ms |
| "hello how are you" | Router answers directly, one sentence |
| Fast path with the Postgres checkpointer | "pause" 9–16 ms (was 1.9 s before the write-behind fix) |
| Restart the server, same session, "say that more simply" | Memory restored from Postgres; answer about peaks, cites [24:38] |

Thresholds (`app/orchestration/graph.py`) were calibrated on this lecture: relevant chunks score 0.58–0.65,
off-topic 0.43–0.45. They'll need a second lecture to confirm (ideally a Hindi one).

## For Rishi (needs sign-in + a mic + ears)
1. **Streaming voice answer.** At ~26:00 hold ~, ask "what is a peak?". The text streams into the voice modal, speech
   starts after the first sentence (not after the whole answer), the lecture stays quiet (ducked) until the answer
   finishes, then its volume comes back. Timestamps like `16:38` show as chips; clicking one seeks. They aren't
   read aloud.
2. **Barge-in.** While an answer is being spoken, hold ~ and say "pause". Speech stops at once, the video pauses, and the
   old answer doesn't come back.
3. **Semantic seek by voice.** "skip to the part about 2D peak finding" → jumps to ~36:00; the modal says "Jumped to
   36:15" (sometimes "It also comes up at …").
4. **Spoiler.** At ~12:00 ask "how does greedy ascent work?" → "hasn't covered that yet". At ~40:00 the same question
   gets a real answer.
5. **Q&A tab.** Type "summarize so far" → streams in, with timestamp chips. Type "pause" → the video pauses (typed
   commands work too). Voice Q&A answers also show up in this tab, with a mic icon. No more dummy messages.
6. **Hindi.** Toggle हिं, ask "peak kya hota hai?" and "2D peak finding wala part dikhao". Answers are in Devanagari,
   and the Hindi voice reads them (Tier 1d finishes the voice fallback).
7. **Tier 0 regression.** pause / go back 10 seconds / speed 1.5 / undo still feel instant.

## Known limits (not bugs for 1b)
- The regex classifier grabs some questions as commands ("the professor's name was what **again**" → REPLAY;
  "I missed the bit where he defined the peak" → REPLAY). The Tier 1c trained classifier fixes these; add them to
  the Tier 1c test set.
- Vague follow-ups can miss the relevant chunk (recall), and the model then says the topic hasn't come up.
- Gemini fallback is wired but `GEMINI_API_KEY` is empty, so a Groq outage falls back to the "answer service is busy,
  the most relevant part you've watched is at mm:ss" template.
- Render: set `DATABASE_URL` to the Supabase **session pooler** URL, or the checkpointer falls back to memory (it logs why).
