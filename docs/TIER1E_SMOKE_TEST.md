# Tier 1e — voice notes: smoke test

What changed: `TAKE_NOTE` now makes a real note. `notes_agent` drafts it in-process (no I/O). The WebSocket
sends `note.created` at once, then a background task inserts the row into `notes`, asks the LLM for a
1–2 sentence summary of the last ~60 s of transcript plus what was said (in the UI language), stores it
only if the note still has no summary (a user edit wins), and sends `note.updated`.
REST `GET/POST/PATCH/DELETE /api/notes` handles typed notes, edits, stars and deletes. The Notes tab is
real: list, add, edit, delete, star, click-to-seek, a live badge count, and Markdown/PDF export (PDF
= the print dialog → "Save as PDF").

Could affect earlier tiers: `ws.py` (a `note.*` event is sent before the turn's `answer.done`),
`useStudySocket` (note events are intercepted before turn resolution), the Q&A chat (voice-note acks
are no longer logged there).

## Verified by Claude (19 Sep 2026, `backend-1a` on :8001, no auth → in-memory notes; live Groq + transcript)

MIT 6.006 L1 (`HtSuA80QTyo`), WS probe:

| Said | Lang | at | note.created | ack (server) | note.updated |
|---|---|---|---|---|---|
| note this down | en | 26:00 | 21 ms | 39 ms "Noted at 26:00." | 0.97 s, divide-and-conquer 1D peak summary |
| ये नोट कर लो | hi | 26:00 | 21 ms | 41 ms "26:00 पर note कर लिया।" | 1.36 s, Devanagari with English terms |
| bookmark this | en | 10:20 | 13 ms, starred | 12 ms "Bookmarked 10:20." | 0.74 s |
| note that a peak always exists in 1D | en | 25:00 | 8 ms | 8 ms | 0.58 s "A peak is guaranteed to exist in any one-dimensional array." |
| बुकमार्क करो | hi | 15:00 | 16 ms, starred | 16 ms | 0.62 s |

`GET /api/notes?video_id=…` then lists them in time order. 1047 backend tests (20 new in `tests/test_notes.py`
cover PostgREST request shapes, owner scoping, the session-FK retry, the edit-wins rule, and summary
failure/skip); tsc + a scratch build pass; the export builders were checked in Node.

**Not verified by Claude:** the Supabase write path with a real signed-in user (the probe runs anonymous,
so notes stay in memory), and the Notes tab UI (behind sign-in). That's the pass below.

## Your pass (signed in, Chrome/Edge, `?v=HtSuA80QTyo`)

Setup: backend + frontend running with this branch, signed in, transcript chip gone (ready).

1. [ ] Notes tab on a fresh video: honest empty state, no badge, both export buttons disabled.
2. [ ] Play to ~25:00, hold `~`, say **"note this down"**: the card appears at once (voice modal says
       "Noted at 25:0x."), badge = 1, and "Writing a summary from the last minute…" is replaced by the
       summary within ~2 s. The Q&A tab gets **no** new entry.
3. [ ] **"note that a peak always exists"** → the summary keeps your content; "You said: …" is shown below it.
4. [ ] **"bookmark this"** → the card is starred.
5. [ ] Click a card's time chip → the video seeks there.
6. [ ] Type a note → "Add note at mm:ss" → a **Typed** card appears at the current time; Ctrl+Enter also works.
7. [ ] Edit (pencil) a voice note → Save → reload the page → the edit persists and the summary didn't overwrite it.
8. [ ] Star/unstar, then delete a card → reload → the state persists. Delete a voice note *immediately*
       after saying it (while it's still summarizing) → reload → it stays deleted.
9. [ ] Filters: All / Voice / Typed / Starred counts match.
10. [ ] **Markdown** → the downloaded `.md` has the title, time-ordered bullets with `youtube…&t=Ns` links, ⭐ on
        starred ones, "You said" lines; the links open the right moment.
11. [ ] **PDF** → the print dialog opens with a clean page (title, link, one row per note, ★) → "Save as PDF"
        looks right. Nothing of the app UI is printed.
12. [ ] Supabase → Table editor → `notes`: rows have your `user_id`, `video_id`, `at_s`, `is_auto`, `summary`,
        `session_id` (or null). A second account sees none of them.
13. [ ] Backend log: `note … saved=True summary=done` per voice note; no errors.

### Hindi pass (toggle **हिं**)
14. [ ] **"ये नोट कर लो"**, **"नोट करो"**, **"note karo"**, **"likh lo"** → Hindi ack "mm:ss पर note कर लिया।", the summary in
        Devanagari. **Judge the quality**: technical terms should stay in English (array, peak, O(log n));
        some still come out transliterated ("एल्गोरिद्म"). Tell me if it reads badly.
15. [ ] **"बुकमार्क करो"** → "mm:ss bookmark कर लिया।", starred.
16. [ ] Export MD + PDF with Hindi notes: Devanagari renders (PDF uses Nirmala UI / Noto Sans Devanagari).

### Degradation
17. [ ] A video whose transcript is still preparing / unavailable: "note this down" still saves the note;
        it shows "No transcript here to summarize — kept what you said."
18. [ ] Backend stopped: the Notes tab shows "Couldn't load your notes — is the server awake?" + Try again.
