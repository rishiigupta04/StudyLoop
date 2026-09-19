# Tier 1a smoke test: transcript ingestion

Run after the Tier 0 / 0b passes. The backend must run the **current** code: restart it after pulling,
because the preview config has no `--reload`. Keep a terminal on the backend log; the log lines are part of the check.

## Already verified by Claude (19 Sep 2026, live TranscriptAPI + Supabase + HF, no browser)
- [x] New video `HtSuA80QTyo` → `fetching → embedding → ready`, 440 segments, 68 chunks, `embed_model=BAAI/bge-m3`,
      title/lang/source stored. Log: `fetched 440 segments (lang=en, source=creator)` then `ready (68 chunks …)`.
- [x] Second request → `served from the videos cache, no TranscriptAPI call`: no credit spent.
- [x] Nonexistent video `zzzzzzzzzz0` → `unavailable` / `unavailable`. In Hindi, "रुको" still pauses, and
      "yeh kya hai" / "backprop wala part dikhao" answer with the Hindi reason. A second connect re-uses the cached result.
- [x] WS: `ready`, then `video.status` right after; duplicates suppressed.

## For Rishi (needs sign-in, which Claude can't do)
1. **Transcript tab, ready video.** Open `/video-study-page?v=HtSuA80QTyo`. The tab shows the real lecture lines
   (not the old dummy peak-finding text). The playing line is highlighted and the list follows playback without scrolling
   the page. Clicking a line seeks. Search highlights matches, and typing `(` or `*` doesn't crash.
2. **New video, live progress.** Open a lecture nobody has opened before. The top bar shows *Preparing transcript…*,
   then *Indexing…*, then the chip disappears. The tab shows a spinner, then lines appear while it is still *Indexing for search…*.
3. **Captions-disabled video** (roadmap done-when, D10b). Pick a lecture whose uploader turned captions off. Expect
   *Transcribing…* (after ~8 s), then ready, with an *Auto-generated* badge in the tab. Record in the log: latency, the
   `lang=`/`source=` line, and the TranscriptAPI dashboard credit cost.
4. **Failure.** Open a private/removed/live video (or `?v=zzzzzzzzzz0`). The chip says *Playback only*, and the tab says
   *No transcript for this video* with the reason and **no** Retry button. Voice `pause` / `go back 10 seconds` still work, and
   "what is this about?" answers with the reason (EN and हिं).
5. **Retry** (transient). Stop the backend's network or put a wrong `HF_TOKEN` in `.env`, then open a new video → the tab
   shows the lines plus *Search index failed · Retry*. Fix the token, restart, click Retry → `ready`. The log shows
   `transcript cache hit (N segments), no TranscriptAPI call`: re-indexing never re-buys the transcript.
6. **Hindi toggle.** Every message in steps 2–4 shows in Hindi with हिं selected.
7. **Tier 0 regression.** Run the quick pass from `TIER0_SMOKE_TEST.md` (pause, seek, speed, undo) on a ready video
   and on a failed one.

## Not in 1a (don't file as bugs)
- Q&A and semantic seek still answer "arrives with … (Tier 1b)" once a transcript is ready.
- The e5-small ONNX fallback embedder is wired but off (`E5_MODEL_DIR` unset; needs onnxruntime, which lands in Tier 1c).
