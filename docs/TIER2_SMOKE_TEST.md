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
