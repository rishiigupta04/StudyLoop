# StudyLoop — the 3-day plan (college project cut)

Supersedes the scope of `docs/PRODUCTION_PLAN.md` for now (that plan stays as the "if this were a real launch" list; item IDs
below refer to `docs/AUDIT_2026-10-06.md`). Goal: **functional, usable, and the USP works every time in the demo.** Not a
launch. Branch: `prod-hardening` (off `tier1c-ml`).

**The USP, in demo terms:** hold `~` and talk to a lecture video in English / Hindi / Hinglish: fast commands (a trained
classifier, no LLM), "skip to the part about X", answers that only use what you have watched, voice notes.
**The course needs one more thing:** CO4 = a trained classifier measured on *real speech* (>= 90 % target), plus monitoring.

## Cut (not doing, on purpose)
Tier 3 quizzes, rate limits and quotas (BE-01..), mobile layout (SP-09), accessibility passes, lazy-loading / bundle work,
Playwright/vitest in CI, legal pages, account deletion, error tracking, the HF-hosted model + Render deploy (unless the
course requires a live URL, see "Decision" below). They are listed in `PRODUCTION_PLAN.md` for later.

## Day 1 — make the demo path safe (BUILT and reviewed on `prod-hardening`; waiting for your spoken pass)
Done: 25 audit items fixed by four builders, then an independent review (0 blockers, 0 highs; two mediums fixed:
stale "Study" nav link, and a race in the library read path; plus a revert of `llm_timeout_s` to 30 s, which also bounds
chapter outlines). Checks: tsc, production build (+ the Collect build), backend 1245 passed, ruff clean. The landing page
and Settings are honest, the study page has the failure-mode fixes, the stale `dist` folders are deleted.
**Known gaps, accepted for the demo:** the hero accepts any bare 11-character word as a video id; `lastVideo` is per
browser, not per user; "Ask again" can re-save a voice note whose first attempt actually reached the server; Dashboard
"minutes today" can lag by one request after leaving the study page; removing a video while its study tab is still open
lets the next heartbeat re-add it; `AuthContext` has no catch on `getSession`; the quiz widget (flag-hidden) still has
hard-coded Stanford/Harvard titles. **The landing page says a DistilBERT classifier runs server-side: true on this
laptop (ONNX build), NOT on the live Render site until it is redeployed (it still runs the regex build).**
Original plan for the day:
| Who | What |
|---|---|
| Me | Front door honest (SH-01..05, SP-01, SH-07), study-page failure modes (SP-02..05, 08, 12-14, T2-12), error boundary + inert gamification (SP-07, T2-07), library race (T2-01, T2-13); verified together |
| **You** | **Recruit 3-4 speakers for Collect today** (20 min each, see Day 2). Check Sarvam credit and Groq limits. Decide the deploy question below. |
| **You** | When the build lands: run the spoken pass (Chrome, headset mic, ~40 min) while I watch the backend log and fix what breaks |

## Day 2 — evidence for CO4
| Who | What |
|---|---|
| **You + speakers** | Collect sessions on `http://localhost:4029/collect` (configs `backend-1a` + `frontend-1a`): 70 clips per speaker, ~20 min. **Minimum honest set: 4 speakers (2 for validation, 2 held-out for test) = 280 clips; 6 is better.** Get consent; export each ZIP + JSONL; audio never goes into git. |
| Me | Minimal monitoring (CO4 "monitor"): write-behind turn log into `interaction_logs` (+ `model_version`), a simple implicit-correction rule, `GET /api/insights/model`, one plain `/insights/model` page (intent mix, fast-path coverage, low-confidence rate, p50/p95 per route, correction rate), and a short documented retrain cycle |
| Me | As exports arrive: audit the labels (two-reviewer pass against `ml/review_brief.md`), put transcripts + labels in `ml/data/real_speech_*.jsonl` |

## Day 3 — the number, then freeze
| Who | What |
|---|---|
| Me | `eval_real_speech.py` per STT provider on held-out speakers; re-pick tau on the validation speakers; accuracy + macro-F1 + the confusable pairs, honest small-n caveats, written into `docs/TIER1C_MODEL.md` |
| Both | Demo rehearsal x2 with the script in the audit (study-page section); final preflight; **freeze** (no new changes after the second rehearsal) |
| Me | Commit in reviewable commits when you say so |

## Decision (one question)
**Do your instructors need a live URL that shows the new work, or is a laptop demo enough?** Default: laptop demo (no Render
cold start, no 0.1-CPU risk, runs the ONNX classifier). If you need the URL: send the HF username + token on Day 1; I publish
the bundle, commit the lock, merge and deploy on Day 2 morning, and we measure `probe_ws.py` against Render. The live site is
still the old build (regex classifier, Groq STT, no term repair) until then.

## "USP works" acceptance checklist (run on the demo machine)
1. `~` then "pause" / "go back thirty seconds" / "speed one point five": acts, chip says Fast path, server under 150 ms.
2. "skip to the part about 2D peak finding": jumps, video stays paused; "go back to where I was" returns.
3. Question at about 26:00: streams, is spoken, citation chip seeks; a question about later content says it is not covered
   yet; with the switch on "Spoilers on" it answers from the whole lecture.
4. "note this down": card at once, summary a second later, appears in Library > Notes; Markdown export opens.
5. Hindi: switch to हिं, "थोड़ा पीछे जाओ" acts and answers in Hindi; a Hindi question gets a Devanagari answer.
6. Landing page: every button leads to a real login; pasting a lecture link lands on that lecture after sign-in.
7. Study, then Library: the video you just watched is there at the right position.
