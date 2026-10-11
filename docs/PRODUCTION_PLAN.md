# StudyLoop — Tier 3 + production-readiness plan (6 Oct 2026)

Built from the read-only audit in `docs/AUDIT_2026-10-06.md` (107 findings, IDs `SP-` study page, `T2-` Tier 2 pages,
`SH-` shell/auth/marketing, `BE-` backend, `FQ-` frontend quality; every blocker re-checked by a skeptic: 14 of 14
confirmed, two downgraded). Estimates are effort guesses, not measurements. Nothing was exercised signed-in: the audit
read code and ran a few cheap checks.

## 1. Where the app stands

| Area | Verdict | Why |
|---|---|---|
| **Study page** | **ready for a rehearsed demo, with caveats** | Complete voice pipeline, honest failure states, coherent no-spoiler design, no debug leakage in a prod build. Not safe to improvise: mic-permission race (SP-04), stuck PTT (SP-05), Q&A banner contradicts the spoiler toggle (SP-02), false "Paused" confirmations when the player is unavailable (SP-12), pending turns hang on a socket drop (SP-08). No human spoken pass since the Sarvam/WAV fix. |
| **Front door** (landing, Settings) | **not ready, 5 blockers** | Every landing CTA opens a fake sign-in modal prefilled with `student@studyloop.ai` / `password123` (SH-01). Settings is entirely fake: another person's name and email, "Scholar Pro", "Notion connected", a demo HF token, Save persists nothing (SH-02). The landing page claims in-browser DistilBERT / 100 % on-device privacy / MeloTTS / Notion / Anki / university endorsements / pricing the product does not have (SH-03, SH-04). "Fill Demo" loads a Rick Astley video and the pasted URL is dropped by the login redirect (SH-05). The gear in the study top bar opens that Settings page (SP-01). |
| **Tier 2 pages** | demo-able, not production | Real data, honest states, every query scoped to the user. Library can miss a video you just left (T2-01), progress can regress after a failed resume fetch (T2-02), "hours watched" is inflated by seeking (T2-06), full chapters jsonb on every list call (T2-03), no pagination, no delete/clear for chats (T2-08). Never exercised signed-in. |
| **Backend** | demo-ready, not production | Auth and per-user scoping are sound (no IDOR found). No rate limits or quotas anywhere (BE-01), unbounded in-memory checkpoints that one user can use to OOM 512 MB (BE-02), auth fails open by default (BE-03), no deploy gate (BE-07), almost no observability (BE-10), no retention/deletion for raw speech (BE-08). |
| **Frontend quality** | not production | One 1.7 MB chunk (431 KB gzip), no error boundary, zero tests, `npm run lint` dead, no security headers, missing env vars fall back to localhost silently, stale `frontend/dist` holds leaked keys. |
| **Tier 3** | designed, not started | Auto-quizzes fit as a REST feature outside the voice graph; see section 5. |

**Answer to "is the study page done enough for a live demo?"** Yes for a rehearsed run on Chrome/Edge, after Stage D
below. The surfaces around it (landing, Settings, a few navigation links) are what would embarrass you, and they are
small fixes.

## 2. What "production ready" means here, and the ceiling

Exit criteria for a **supervised public beta** (strangers can sign up):
1. No UI that looks real but is fake; every public claim is true (SH-01..05, SP-01, SP-17).
2. A signed-up user cannot drain shared quotas or take the server down (BE-01, BE-02, BE-04, BE-05, BE-14).
3. Sign-up email actually reaches arbitrary addresses (custom SMTP, one canonical domain: SH-10).
4. Privacy policy, terms, contact, a consent line, delete-my-account and clear-my-chats (SH-08, SH-09, T2-08, BE-08).
5. Errors are visible to you (JSON logs + error tracking, BE-10, FQ-14) and a bad deploy does not ship (BE-07).
6. The demo path and the quota-burning paths have automated tests in CI (FQ-10, FQ-11, BE-18, T2-17).
7. Tier 1c landed and its p95 measured on Render; CO4 real-speech number measured (separate track, needs speakers).

The ceiling: the stack is free tiers (Render 512 MB / 0.1 CPU / sleeps, Supabase free, Groq/Gemini/Sarvam/TranscriptAPI
free credit). Even after every item below, "production" means a **limited beta** unless some of that is paid for. Decide
that explicitly (section 7, D9).

## 3. Branches and landing order

- `tier1c-ml` (f519449, pushed) cannot merge to `main` until `backend/bundle.lock.json` is committed (Docker build and a
  CI test fail by design). **Stage 0a** unblocks that and needs you.
- Branch all new work **off `tier1c-ml`** (it contains Collect, the bilingual fixes and the ONNX serving that the study
  page already depends on locally): `prod-hardening` (Stages D, P1-P3) and `tier3-quiz` (Tier 3). Both merge after
  `tier1c-ml`. If the HF publish is delayed and you need a deploy sooner, the fallback is to merge everything except
  commit `2eefc8c` (hosting) with `render.yaml` left on `CLASSIFIER=regex`; ask before doing that.
- Migrations run **by hand** in the Supabase SQL editor: this plan adds `002_quiz.sql` (Tier 3) and
  `003_rls_hardening.sql` (BE-16, T2-09). Code must degrade to "feature off" when a table is missing.

## 4. Stages

### Stage 0 — things only you can do (start now, in parallel with everything)
| # | Action | Why |
|---|---|---|
| 0a | HF username + `HF_WRITE_TOKEN` in your shell, licence check, then `publish_bundle.py --push` and commit the lock | unblocks merging Tier 1c |
| 0b | Rotate every key that was ever a `VITE_` var (Groq x3, HF, TranscriptAPI, Gemini) and delete both `frontend/dist` folders and the old stash if unneeded | SP-19, BE-06, FQ-06 |
| 0c | Supabase: custom SMTP (Resend/Brevo) with a verified sender; pick **one** canonical Vercel domain and set Supabase Site URL + redirect allow-list (`http://localhost:4028` too) and Render `CORS_ORIGINS` | SH-10 |
| 0d | Check the Render env: `GEMINI_API_KEY`, `SARVAM_API_KEY`, `REQUIRE_AUTH=true`, and that auto-deploy waits for CI | SP open questions, BE-07 |
| 0e | Confirm Sarvam credit, Groq daily limits, TranscriptAPI plan size | demo concurrency and quota design |
| 0f | Live Supabase check: is `user_video_history` the v2 shape? (v1 table would make every history write fail silently) | T2 open question; also run the two `pg_policies` / `information_schema` queries in T2-09 |
| 0g | Pick the 2-3 demo lectures and a Hindi reviewer for their quiz questions | Tier 3 Q5 |

### Stage D — demo hardening ("the front door"), about 2-3 days, mostly S items
Goal: everything a viewer touches first or by accident is true and does not break. Parallelisable bundles in section 6.

| Bundle | Items | Result |
|---|---|---|
| **D1 landing** | SH-01 delete the fake auth modal (CTAs become `<Link to="/login">` / `?mode=signup`; LoginPage reads `mode`); SH-03/FQ-03 rewrite copy to what exists (server-side intent routing, Sarvam/Groq speech, BGE-M3 RAG, voice notes, chapters; real measured numbers from `docs/TIER1C_MODEL.md`); SH-04 remove the university wall, "thousands of students", the 70 % stat and the pricing section; SH-05/FQ-02 demo URL = the verified lecture, validate with `extractYouTubeId`, navigate with `?v=` | a landing page you can stand behind |
| **D2 settings** | SH-02/SP-01/FQ-04 replace with a real page: name and email from `useAuth`, UI language, STT provider, spoiler default, **Sign out** (SH-07: phones cannot sign out today), later Delete account (P2); or hide the gear and `/settings` until it is real | no fake profile |
| **D3 study page** | SP-02 pass `spoilerGuard` to the Q&A tab banner; SP-03 + T2-12 stop silently opening the MIT lecture (explicit "not a YouTube link" state; Study links go to the last-watched video; create history only after real playback); SP-04 mic permission race; SP-05 stuck PTT after blur / turnSeq guard; SP-08 fail pending turns on socket close + "Reconnecting…"; SP-12 report when the player is unavailable instead of confirming; SP-13 browser/mic messaging and a Hindi-voice check; SP-14 nest the STT/TTS timeouts (server 4 s per provider, client 10 s, TTS abort 6 s); SP-06 lower `llm_timeout_s` to ~12 s now (the proper cancel-race fix is P1) | no embarrassing failure mid-demo |
| **D4 error boundary** | SP-07/T2-07/SH-06/FQ-05 root + per-route ErrorBoundary and `try/catch` around `localStorage` in `GamificationProvider`; FQ-19 mount the provider only when `DEMO_PREVIEW` | a render exception no longer white-screens |
| **D5 library race** | T2-01 await/flush this user's pending writes in `library()` / `dashboard()` (the demo flow "study, then Library" hits it); T2-13 resume link without `&t=` | Library shows the video you just left |
| **D6 demo prep** | pre-ingest + pre-outline the demo lectures (EN + HI), reset learner state, warm the instance, rehearse the script twice, record a 90 s fallback capture | the preflight list in `docs/AUDIT_2026-10-06.md` (study-page section) |

**Exit:** `tsc`, `vite build`, backend `pytest`, ruff green; the TIER0/1B/1E/SPEECH/TIER1C spoken checklists run once by
you on the demo origin; the demo script run twice end to end.

### Stage P1 — backend safety and ops, about 3-4 days
BE-03 default `require_auth=True` and refuse to start in prod without it (also T2-10: shared anonymous identity);
BE-01/SP-10 per-user token buckets and daily budgets on `/api/stt`, `/api/tts`, `POST /api/videos`, outline retry,
and a per-session turn rate and max video duration (BE-14); BE-04 body-size middleware before multipart parsing;
BE-05/SP-06 semaphore for LLM-bound turns, LLM waits race the cancel event, fast-path turns outside the turn lock;
BE-02 keep only the latest checkpoint per thread and evict idle threads; BE-12 validate every WS number and survive
bad frames; BE-13 GET status endpoints must not start TranscriptAPI fetches; BE-11 requeue orphaned ingests at start and
flush on shutdown (T2-19); BE-10 JSON logs with session/turn ids, error tracking, deeper `/health`; BE-07
`autoDeployTrigger: checksPass` plus the docker-build-and-boot CI job sketched in `docs/TIER1C_DEPLOY.md`; BE-15 wrap
transcript excerpts as untrusted data in prompts; BE-16/T2-09 `003_rls_hardening.sql` (SELECT-only policies,
idempotent policy creation, length CHECKs); BE-19 hashed lockfile; BE-20 docs off in prod, non-root user, HEALTHCHECK;
BE-18 route-auth sweep test and cross-user tests for library/chats/delete. **Exit:** one abusive script cannot exceed the
daily budget; a load test of 200 turns does not grow memory past the cap; CI gates the deploy.

### Stage P2 — data correctness and privacy, about 4-5 days
T2-02 `greatest()` upsert / seed from history so progress never regresses; T2-03 select JSON paths, not whole chapters;
T2-14 pagination with counts and a sane ordering; T2-04/BE-17 store each turn in `interaction_logs` (write-behind) and
read chat history from it (this is also Tier 1f's logger: build it once); T2-05 titles via embed/oEmbed; T2-06 count real
playing seconds for hours/completed, or relabel as "furthest point"; T2-15 Undo toast instead of `confirm`;
T2-08/BE-08/SH-09 delete-chat, clear-history, **delete account** (service-key delete so cascades run; also delete
LangGraph threads) and a data export; T2-11 refresh-then-prompt on 401, 503 mapping, request timeouts (FQ-15); T2-18 do
not let a client attach to another user's session id; SP-11 product call on the spoiler high-water mark (seek-then-play).
**Exit:** two-user isolation tests green; a signed-in smoke of every Tier 2 path (the riskiest first: history upsert +
resume round trip, library embed, chats from Postgres) run by you.

### Stage P3 — frontend quality and launch surfaces, about 5-6 days
FQ-07/SH-11 route-level `React.lazy` and a named-icon map (the namespace import ships ~650 icons: 1.7 MB to a few hundred
KB); FQ-08/SH-19 `vercel.json` headers (CSP, nosniff, Referrer-Policy, Permissions-Policy for the mic, long-cache assets);
FQ-09 fail `vite build` if `VITE_API_URL` / Supabase vars are missing; FQ-10 vitest for the pure modules (playerActions,
time, wav, zip, notesWorkspace, outline) + FQ-11 a Playwright smoke (landing to login to study, mocked Supabase session)
+ FQ-13 CI runs lint/test/e2e on branches too; FQ-12 a working `eslint.config.js`; SH-08 `/privacy`, `/terms`, contact
and a sign-up consent line (drafted by me, reviewed by you: not legal advice); SH-12/SH-13 resend + expired-session UX;
SH-14 OG/Twitter/canonical/icons; SH-15 contrast fix (`--muted-foreground`), SP-16 dialog semantics and keyboard
toggle for the mic; SH-16 UI-chrome i18n for landing/login/settings/404; SH-17/SH-18 split the 1232-line landing page
and make `AppLayout` a layout route; SP-09/FQ-18 mobile: pointer events on the hold button, sticky mini-player and mic
FAB; SP-18 virtualize the transcript; FQ-14 error reporting; FQ-17/T2-16 delete dead services (`copilotService`,
`supabaseService`) and unused deps. **Exit:** Lighthouse and axe pass on landing/login/study at desktop and 375 px; CI red
on a broken demo path.

## 5. Tier 3 plan (auto-quizzes first)

Full design in `docs/AUDIT_2026-10-06.md` (last section). Decisions in it: **REST + a Quiz tab, outside the voice graph**
(the 14-intent taxonomy, graph shape and WS protocol stay frozen); questions generated **lazily per (video, language,
chapter)** from the chapter's own transcript segments (not overlapping chunks, which would leak the next chapter), 2-4
MCQs each, validated for free (quote must appear in the transcript after `normalize()`, distinct options, answer not
in the question, `t` inside the chapter); delivered only when the chapter end is reached (server-side gate on the
heartbeat high-water mark: a nudge, not a security boundary); graded server-side with per-user option shuffling
(`answer_idx` never in any GET); sets shared across users, attempts per user; **no XP/streak/badges in v1** (the existing
gamification context invents `xp 1420`, `streak 5`); estimated ~30K tokens per lecture per language (not measured), so
a daily token guard, lazy generation and pre-generation for the demo lectures.

| # | Increment | Effort | Needs |
|---|---|---|---|
| Q1 | `002_quiz.sql` (3 tables, no select policy on sets/questions) + pure `services/quiz.py` (prompt, parser, validator, shuffle) + in-memory repo + `scripts/quiz_dry_run.py` | M | decision T3-a |
| Q2 | generation service, daily token budget, read API (`summary`, `quiz`, `prefetch`), spoiler gate, kill switches `QUIZ_ENABLED` / `QUIZ_DAILY_TOKENS` / `QUIZ_MODEL` | M | migration run |
| Q3 | answer/grade/review endpoints | S | |
| Q4 | study-page Quiz tab, chapter chip, non-modal "chapter complete" toast, bilingual, keyboard 1-4 | M | after D3 (same files) |
| Q5 | flag-a-question loop, optional blind-solve verifier, **pre-generate and human-review the demo lectures (incl. Hindi)** | S | demo lectures + Hindi reviewer; **before any live demo of quizzes** |
| Q6 | voice answers via a server-side matcher on `normalize()` (letters, "option two", "dusra", Devanagari ordinals), falls through to the normal turn | M | after Q4 |
| Q7 | server-backed progress, real XP (10 per first-try correct, once per question), honest dashboard widget | M | optional |
| Q8 | CSV/Anki export + reword remaining landing claims | S | optional |

The other Tier 3 items: **#2 joint intent+slot and #3 in-browser classifier: defer** until real-speech data exists (no
span labels; porting `normalize()` to TypeScript needs a parity test; ~46-68 MB download; hosted STT still hits the
same server). If the Render probe misses 150 ms, the first response is the 3-block bundle, not the in-browser port.
Spaced review of missed questions: right after Q4-Q6. **Drop**: vision, wake word, creator analytics. Defer: playlist
mode, cross-video memory, adaptive pacing (needs the Tier 1f logger first). Do not quote the Wong et al. 2024 effect size
anywhere until the Business Need doc (not in the repo) is read.

## 6. Parallelisation map (disjoint files, safe for concurrent agents)

| Bundle | Touches | Avoid colliding with |
|---|---|---|
| A. landing + login + settings + legal + SEO (D1, D2, SH-*, P3 launch surfaces) | `pages/LandingPage.tsx` (-> `components/landing/*`), `SettingsPage`, `LoginPage`, `index.html`, `public/*`, new `pages/Privacy|Terms` | E (App.tsx) |
| B. study page (D3, SP-*, SP-16/18/09) | `app/video-study-page/**`, `hooks/useTildePTT|useStudySocket|useYouTubePlayer`, `lib/audioCapture|playerActions`, `services/speechService` | F-UI (Q4) |
| C. backend safety (P1) | `main.py`, `config.py`, `auth.py`, `ws.py`, `llm.py`, `api/speech.py`, `ingest.py`, `checkpointer.py`, Dockerfile, `render.yaml`, `ci.yml`, `003_*.sql` | D (library.py) |
| D. Tier 2 correctness (P2, D5) | `services/library.py`, `api/library.py`, `services/notes.py`, Library/Dashboard/Notes/ChatHistory pages, `libraryService` | C |
| E. frontend infra (D4, P3 infra) | `App.tsx`, `main.tsx`, `package.json`, vite/eslint/vitest/playwright config, `vercel.json`, `AppIcon`, error boundary | A, B (small shared edits to App.tsx: do E's first) |
| F. Tier 3 backend (Q1-Q3, Q5 script) | new files only: `002_quiz.sql`, `services/quiz*.py`, `api/quiz.py`, tests | none until Q4 |

After each bundle: tests + a smoke checklist (with a Hindi pass) + a note of what changed and what it could affect, then
verify each commit alone from an exported tree (the method used for Tier 1c).

## 7. Decisions needed (ask once; recommendation first)

| # | Decision | Recommendation |
|---|---|---|
| D1 | Demo target: local `tier1c-ml` tree or live Render `main` (58ccbe5: regex, Groq STT, no term repair) | whichever you freeze; live needs Stage 0a first |
| D2 | Landing page: honest rewrite, or redirect `/` to `/login` for the demo | honest rewrite (small), pricing section removed |
| D3 | Settings: reduce to the real settings + sign out + delete account | yes |
| D4 | Beta access: open sign-up, invite/allowlist, or low per-user quotas | allowlist or quotas, given free-tier budgets |
| D5 | Canonical domain, SMTP provider, Google sign-in on/off | one domain, Resend/Brevo, Google later |
| D6 | Legal text: who is the entity/contact; jurisdictions (India DPDP at least); what Sarvam/Groq retain | I draft, you or someone competent reviews |
| D7 | Spoiler mark: does seek-then-play count as watched | advance only by contiguous playback (ignore jumps over ~3 s) |
| D8 | "Study time" / "Hours watched" semantics; does Remove-from-library hide chats and counts; chat-memory retention | real playing seconds; hide; 90 days |
| D9 | Paid infra for "production": Render paid instance, a paid or non-live LLM for quizzes | at least a non-live quiz model; Render paid only if the p95 probe misses |
| T3-a | May I add `002_quiz.sql` and will you run it; which model generates quizzes (live gpt-oss under a daily guard vs qwen3.8-27b separate quota) | yes; qwen or a guarded gpt-oss, never unguarded |
| T3-b | Chapter end: non-modal prompt or pause the video | non-modal |
| T3-c | v1 with no XP/streak/badges | yes |
| T3-d | Demo lectures (2-3) and the Hindi reviewer; the Business Need doc for the research citation | you choose |

## 8. Rough timeline (one person plus parallel agents; estimates)

| Week | Work |
|---|---|
| 1 | Stage 0 (you), Stage D (A, B, D4, D5), Tier 3 Q1; demo rehearsal at the end |
| 2 | Stage P1 (C), Tier 3 Q2-Q3, start P2 (D) |
| 3 | P2 finish, P3 infra (E) + launch surfaces (A), Tier 3 Q4-Q5 |
| 4 | P3 finish (mobile, a11y, tests in CI), Q6, a signed-in smoke of everything, deploy + `probe_ws.py` against Render |
| parallel, not scheduled | real-speech Collect sessions and Stage 2 (CO4 headline), Tier 1f monitoring (shares the P2 logger), Hindi spot checks |

## 9. Risks

- The audit read code; **no signed-in browser pass has happened**. Expect surprises in Tier 2 paths.
- Free-tier quotas decide what "production" can mean; quizzes add ~2-3x the outline's token cost per video.
- A wrong or ambiguous Hindi quiz question in a live demo is worse than no quiz: Q5's human review is mandatory.
- Landing/Settings are demo-day blockers that take hours to fix and are the first thing a viewer sees: do them first.
- `tier1c-ml` is the base for everything but cannot ship until the HF lock exists; keep Stage 0a moving.
