# Tier 2 — retention layer: smoke test

What changed:

1. **Chapters + structured summary** (`backend/app/services/outline.py`). Once ingestion reaches `ready`, one
   background LLM map → reduce pass runs over the stored `transcript_chunks`:
   - map: ~10-minute windows → topics, with times copied from the chunk markers (gpt-oss-20b);
   - reduce: the topics → chapters, a parts/sections/bullets summary and an overview. It runs once per
     language, EN and HI, and HI is written directly in Devanagari (gpt-oss-120b).
   - Times are snapped to real chunk starts. A lopsided split (one chapter swallowing the lecture) gets
     one retry. A closing chapter of a few seconds is merged into the previous one. Rate limits (429)
     are waited out.

   Storage needs no schema change: `videos.chapters` (jsonb) holds `{v, status, at, error, model, ms, langs:{en,hi}}`,
   and `videos.summary` holds the EN overview. It rides on `video.status` as `outline_status` + `outline`.
   **Backfill:** opening any ready video without an outline (or with an older `v`) starts the run from the
   stored chunks, so TranscriptAPI is never called. There's also `POST /api/videos/{id}/outline {retry}`.
   The claim is a conditional PATCH, so two instances never generate the same video twice.
2. **Real VideoPane**:
   - chapter markers on the progress bar, a chapter list with a "Now" badge, and the structured summary,
     all click-to-seek;
   - honest states: waiting for the transcript, no transcript, generating…, failed + Retry, not generated +
     Generate;
   - bilingual UI, and the outline follows the EN/हिं toggle (it falls back to the other language with a note).
   - **No spoilers:** chapter titles and markers always show (navigation, like semantic seek). A chapter's
     blurb shows once you reach it; a summary section shows once you've watched it to its end. The guard
     toggle off shows everything.
3. **Resume + library** (`backend/app/services/library.py`, `api/library.py`). The WS heartbeat (every 5 s) and
   each utterance update an in-memory resume point. A background flusher upserts `user_video_history` at
   most every 20 s per video, and again when the socket closes. Nothing is written or awaited on a turn.
   - Opening a video fetches `GET /api/library/{id}`: it resumes at `last_position_s` (paused, with a
     "Resumed at … · Start over" toast; a `?t=` deep link wins) and seeds the high-water mark from earlier
     sessions, so what you watched yesterday isn't a spoiler today.
   - `GET /api/library`, `DELETE /api/library/{id}`, `GET /api/dashboard`, and `GET /api/chats` (each
     session's Q&A from the checkpointer memory, now timestamped and kept to 30 turns).
4. **Pages**:
   - Library: cards with progress, transcript/chapters/notes chips, resume, remove, search, filters, paste
     a link to study.
   - Notes workspace: every note across videos, full-text search in any script, per-video filter,
     starred, inline edit/star/delete, click-to-seek, a combined Markdown export, and PDF for one video.
   - Dashboard: real counts, continue studying, recent notes, and minutes per day from `study_sessions`.
   - Chat history: questions and answers per session, citation chips that open the video at that moment,
     player commands hidden by default.
   - Quiz and gamification (XP banner, quiz widget, "+XP" toasts) are hidden unless `VITE_DEMO_PREVIEW=true`.
   - Every page has an EN/हिं switch (the same setting as the study page).
5. Gemini fallback: `gemini-2.5-flash` is closed to new keys (404), so the default is now `gemini-3.6-flash`
   with `reasoning_effort=low` + token headroom (verified live: Devanagari answer, ~4–10 s).

Could affect earlier tiers:
- `ws.py`: heartbeat/utterance → `note_position`, flush on disconnect.
- `graph.respond`: history entries gain `at`, and `MAX_HISTORY` goes from 20 to 60. The prompt still uses
  the last 4.
- `ingest.ensure`: may start the outline backfill.
- `LLMClient.stream(fast=)`.
- `VideoStudyLayout`: resume/deep-link placement and `duration_s` in the heartbeat.

## Verified by Claude (19 Sep 2026, `backend-1a` on :8001, anonymous; live Groq + Supabase videos cache)

- **Backfill of `HtSuA80QTyo`** (ingested before Tier 2): `GET /api/videos/HtSuA80QTyo` → `outline_status: generating`
  (the live PostgREST accepted the jsonb claim filter), then `ready` in ~35–64 s (with 429 waits) with no
  TranscriptAPI call. v2 output: 8 EN + 8 HI chapters spread over 0:00–53:22 (longest ~11 min),
  3 parts × 2–6 sections. HI titles are in Devanagari, but some technical terms still come out
  transliterated (e.g. "पीक फाइंडिंग", "ग्रेडी एसेन्ट"). That's the known issue; please judge it in your Hindi pass.
- WS: `video.status` right after `ready` carries `outline_status: ready` + both languages (19 KB); a "go back 30
  seconds" turn in the same session: 15 ms server-side.
- One map window returned broken JSON on the first run → now retried once (unit-tested).
- Library loop: a WS session with heartbeats + 3 turns, disconnect → `GET /api/library` shows the video (title,
  8 chapters, position, `in-progress`); `/api/library/{id}` resume point; `/api/chats` has the 3 turns with routes;
  `/api/dashboard` counts. Turns stayed on budget: `pause` 19 ms, `go back 30 seconds` 9 ms.
  - The first command sent within milliseconds of `ready` measured 147 ms. That's the existing wait for
    the Postgres memory prefetch (`hydrate`) on a new session, not this tier.
- UI, through a throwaway harness that mounts the real pages and the real study layout outside `RequireAuth`
  (anonymous backend), then deleted:
  - chapters, markers, "Now", and the locks at 28:20 watched (2 + 6 sections locked);
  - Hindi outline with the guard off;
  - every empty/waiting/no-transcript state;
  - click-to-seek;
  - Dashboard / Library / Notes (Hindi UI, inline edit saved to the backend, Devanagari search) / Chat history;
  - the study page resuming at the stored position, paused, with chapters past the seeded mark locked.
- 1106 backend tests (38 new: `test_outline.py`, `test_library.py`), ruff + format, tsc, a scratch build. The pure
  TS logic (`lib/outline.ts`, `lib/notesWorkspace.ts`, `resumeTarget`, `timeAgo`) was checked in Node.

**Not verified by Claude:**
- the signed-in path: `user_video_history` upserts via PostgREST, the library embed
  `videos(...)`, `study_sessions` minutes, and chat history read back from Postgres for a real user;
- the Supabase-backed outline for a *brand-new* video;
- anything spoken.

## Your pass (signed in, Chrome/Edge, backend + frontend on this branch)

### A. Chapters + summary
1. [ ] Open `?v=HtSuA80QTyo`. The Chapters tab lists 8 chapters, markers sit on the progress bar, "Now" follows
       playback. Clicking a chapter / marker / summary timestamp seeks there.
2. [ ] Guard on, fresh account (nothing watched): every chapter blurb says "Summary unlocks when you reach this
       chapter", and the Structured Summary shows only locked counts. Watch/scrub-play to ~11:00: the first
       chapters' blurbs and first summary sections appear. Toggle "Spoilers on": everything shows.
3. [ ] New video you've never opened (a 10–20 min lecture): the pane says "Chapters and the summary appear once the
       transcript is ready" → "Generating…" → chapters appear without a reload (pushed over the socket).
4. [ ] A captions-disabled or failing video: "No transcript for this video…", no spinner forever.
5. [ ] (Optional) Stop the backend's Groq key → Retry shows "Couldn't generate chapters" + Retry; restore it → Retry works.

### B. Hindi pass (toggle हिं)
6. [ ] Pane labels switch to Hindi (अध्याय, सारांश, "इस अध्याय तक पहुँचने पर सारांश दिखेगा").
7. [ ] Chapter titles, blurbs and bullets are Hindi in Devanagari, technical terms in English letters. **Judge:** are
       transliterations like "पीक फाइंडिंग" acceptable, or should the prompt be stricter?
8. [ ] Library / Notes / Dashboard / Chat history in हिं: labels, empty states, "3 घंटे पहले" style times.
9. [ ] Ask by voice in Hindi, "ab tak kya hua?", then open Chat history: the question and the Devanagari answer are listed,
       and its citation chips open the video at that moment.

### C. Resume + library
10. [ ] Watch `HtSuA80QTyo` to ~20:00, close the tab, wait ~5 s, open Library: card at ~37 %, "Resume at 20:0x".
11. [ ] Click it: the video opens paused at ~20:00 with a "Resumed at 20:0x · Start over" toast; "Start over" goes to 0:00.
12. [ ] Chapters before 20:00 are unlocked right away (the high-water mark came from the library, not this session).
13. [ ] A deep link `…&t=600` (e.g. a note's timestamp) opens at 10:00, not at the resume point.
14. [ ] Remove the video from the Library (confirm): it disappears; its notes are still in Notes.
15. [ ] Supabase table editor → `user_video_history`: one row per video you watched, `last_position_s` / `max_watched_s`
        sensible, `status` = `completed` once you've watched ≥90 %.

### D. Notes workspace, dashboard, chat history
16. [ ] Notes: notes from two videos grouped per video; search (English and Devanagari), video filter, Starred.
17. [ ] Edit, star and delete a note inline; reload: the changes stuck. Markdown export downloads every shown video; PDF
        with one video selected opens the print dialog.
18. [ ] Dashboard: counts match the Library/Notes; the study-time chart shows today's minutes after a session closes.
19. [ ] Chat history: sessions newest first; "Show player commands" reveals "pause", "go back…".
20. [ ] No XP banner in the sidebar, no quiz widget, no "+XP" toasts anywhere (unless `VITE_DEMO_PREVIEW=true`).

### E. Earlier tiers still fine
21. [ ] Voice commands, Q&A, voice notes and the spoiler toggle behave as in TIER0/1B/1E. The first command after
        opening a video still feels instant.

### F. Resume where you left off, every time (11 Oct)
What changed: the position is also kept in this browser (`lib/resumePosition.ts`, every 3 s, on pause, on page hide,
at unmount, per user); the newer of the server's and the browser's copy wins; the resume fetch retries; nothing is
reported until the playhead has landed (no heartbeat of 0 over the saved place); the video is cued at the place
(no autoplay needed); a `?t=` deep link applies once and is stripped from the URL; the server never lowers the
stored high-water mark; an idle paused tab stays quiet.
22. [ ] Play to about 2:00, pause, press F5: the toast says "Resumed at 2:xx", the video sits cued there, paused.
23. [ ] Play to about 3:00 and close the tab with Ctrl+W. Reopen the lecture from the Study link and from the Library
        card: both resume at about 3:00 (within the 5 s heartbeat).
24. [ ] Open a note's timestamp link, keep watching to a later point, press F5: it resumes at the later point, not at
        the note's time, and the URL no longer has `&t=`.
25. [ ] Two tabs on one lecture: leave one paused, watch in the other, close the watching tab first. Reopening resumes
        at the watched place, not at the idle tab's old position.
26. [ ] Stop the backend, reload the study page: the video still resumes from this browser's copy (a notice that the
        server is unreachable is fine). Restart the backend: no jump back to 0:00 in the Library afterwards.
27. [ ] Remove the video from the Library, then open it again: it starts at 0:00 (the browser's copy was cleared too).
28. [ ] Hindi pass: the "Resumed at" toast reads `m:ss से आगे शुरू किया` with the "शुरू से देखें" action in हिं mode.

## G. Voice caption in fullscreen (Chrome, signed in)

What changed: YouTube's own fullscreen button is off (`fs: 0`; an iframe in fullscreen can't show anything of ours on
top, so the voice modal was invisible there and only the spoken answer came through). The fullscreen button in our
control bar now fullscreens the video box itself, and a voice turn shows as a small floating card in the bottom-left
of the video (`VoiceCaption.tsx`) instead of the blocking modal: listening state + live words, then the answer as it
streams, fading out 5 s after it has been spoken. Out of fullscreen nothing changed (the modal as before).

29. [ ] Click the fullscreen button under the video: the video fills the screen, a "Hold ~ to talk to the video" hint
        shows for ~3 s, an exit button sits top-right, and YouTube's own control bar has no fullscreen button.
30. [ ] Hold ~ and ask "what is a peak?": a red "Listening… keep holding ~" card appears bottom-left with your words as
        you speak; on release "Thinking…", then the answer streams in while it is spoken; the card fades ~5 s after the
        voice stops. The lecture stays visible around it; YouTube's control bar (mouse over the video) is not covered.
31. [ ] "pause" / "go back 30 seconds" in fullscreen: the card shows the confirmation and closes on its own (~1.6 s).
32. [ ] A long answer scrolls inside the card (newest words in view); a `[mm:ss]` chip in it seeks; the × closes it
        and stops the voice.
33. [ ] Click the video (YouTube play/pause) in fullscreen, then hold ~ again: it still listens.
34. [ ] Esc or the exit button leaves fullscreen; holding ~ now opens the normal modal. Leaving fullscreen mid-answer
        moves the turn into the modal without losing it.
35. [ ] Hindi pass (हिं): the card reads "सुन रहा हूँ… ~ दबाए रखें" / "सोच रहा हूँ…" / "जवाब", the answer in Hindi.

## H. The lecture pauses while the answer is spoken

What changed (`useTildePTT.ts`): the lecture is still ducked while `~` is held, but a spoken answer now PAUSES it
(when it was playing) and plays it again once the answer has been spoken. Only a pause made by the voice copilot is
undone: a lecture the learner had paused stays paused. A voice note's short "Noted" only ducks, as before. Checked
without a mic on 11 Oct (dev hook, no-auth backend): playing → paused at the first streamed words → TTS → playing
again the moment the audio ended; learner-paused stayed paused; "go back 10 seconds" during an answer → seek + playing;
closing the answer → playing.

36. [ ] Lecture playing, hold ~, ask a question: the lecture is quiet while you speak, pauses as the answer starts, and
        plays on by itself right after the last word.
37. [ ] Pause the lecture yourself, ask a question: it stays paused after the answer.
38. [ ] During an answer, hold ~ and say "go back 10 seconds": the answer stops, the video jumps and keeps playing.
        Saying "pause" instead leaves it paused.
39. [ ] Close the answer (× / click outside the modal) while it is being spoken: the voice stops, the lecture plays.
40. [ ] "Take a note: …" while playing: the lecture does not pause (only gets quieter for the short "Noted").

## I. Auto language (answer in the language spoken)

What changed: the top-bar toggle is now **Auto | EN | हिं**, Auto by default. In Auto the server picks each turn's
reply language from the utterance (`reply_language.py`): English → English; Hindi in Devanagari → Hindi; Hinglish
(romanized Hindi, or Devanagari mixed with English) → a Hinglish answer (Hindi in Devanagari, English terms in
English letters). Very short commands ("pause", "12:30") keep the conversation's language. The reply language comes
back on every delta, so the right voice speaks it; the page's labels and chapters follow it. EN / हिं force a
language as before. Checked 11 Oct without a mic: 273/273 on the Collect deck's EN / Hinglish / Hindi lines; live
over the WS with Groq (English, Hindi, Hinglish answers; "pause" kept Hinglish); in the page the voice switched
en → hi with the question.

41. [ ] Auto is selected on a fresh browser. Ask "what is a peak?" in English: English answer, English voice.
42. [ ] Ask "peak kya hota hai, simple words mein samjhao": a Hinglish answer (Hindi in Devanagari, words like array
        / element / algorithm in English letters), read by the Hindi voice; the page's labels switch to Hindi.
43. [ ] Ask in pure Hindi ("पीक क्या होता है?"): a Hindi answer.
44. [ ] Right after a Hinglish answer say "pause": the confirmation is in Hindi ("रोक दिया"). Then a full English
        sentence: back to English.
45. [ ] Hover Auto: the tooltip says which language it is answering in now.
46. [ ] Pick EN, ask in Hinglish: the answer is English. Pick हिं, ask in English: the answer is Hindi.
47. [ ] Typed questions in the Q&A tab follow the same rule.

## J. Follow-ups, "I'm lost", voice feel, revision sheet

What changed: (1) follow-up chips under every grounded answer (voice modal, fullscreen caption, latest Q&A answer):
Explain with an example / Simpler / the other language / Jump to the cited moment; follow-ups search with the
previous exchange, and "in Hindi" / "in English" override Auto and the toggle. (2) "I'm lost", "I didn't get that",
"samajh nahi aaya" (one phrase rule ahead of the classifier, `regex_classifier.is_lost`) re-explain the last ~90 s
in simpler words, with a "Replay from …" chip. (3) a soft tone on ~ press / release; "One sec…" (prefetched, same
voice) when no reply has come after 1.5 s; the sentence being spoken is highlighted. (4) a Revision sheet button in
the top bar: big picture, key points watched so far, chapters, every question about this lecture (all sessions),
notes, moments to rewatch → Save as PDF. Checked 11 Oct without a mic: recap + chips live over the WS (English and
Hinglish), chips in the modal and the Q&A tab, highlight followed 3 sentences, filler fetched once per language,
the sheet built (6 sections, 63 links). Not heard by a human: the tones and the filler.

48. [ ] Ask "what is a peak?": a soft rising tone on press, a falling one on release. Under the answer: Explain with
        an example · Simpler · हिंदी में · Jump to 16:38. Each chip works (the first three answer aloud).
49. [ ] While the answer is spoken, the sentence being said is highlighted in the modal / fullscreen caption.
50. [ ] Ask something slow (a whole-lecture summary): "One sec…" is heard if nothing comes for 1.5 s, and stops as
        the answer starts. It never plays for "pause" / "go back 10 seconds".
51. [ ] At ~25:00 say "I'm lost" (and "samajh nahi aaya"): a simpler re-explanation of the last ~90 s, with a
        "Replay from 23:01" chip that jumps there. "I didn't understand recursion" is a normal answer (topic named).
52. [ ] Fullscreen: the chips show on the caption; hovering the caption keeps it up.
53. [ ] Revision sheet (top bar): the print dialog opens; the PDF has the overview, key points only up to where
        you've watched (spoiler guard on), chapters, your questions with clickable timestamps, notes, moments to
        rewatch. In हिं / a Hindi conversation the headings are Hindi.
54. [ ] Hindi answer (हिं, or ask in Devanagari): English vocabulary stays in English letters ("इस lecture में
        professor ने algorithm…"), the rest is Hindi; the same in voice-note summaries and the हिं chapters/summary
        (`services/hindi_terms.py`: prompt rule + a dictionary net on the stream; stored outlines fixed when served).
55. [ ] "पीक क्या होता है?" in a fresh session finds the 16:38 definition (Devanagari loanwords are also searched in
        English letters, which matters while BGE-M3 is down: HF credits ran out on 11 Oct, HTTP 402).
