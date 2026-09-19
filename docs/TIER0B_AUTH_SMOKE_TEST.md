# Tier 0b — Supabase Auth: smoke test

Backend `REQUIRE_AUTH=true`, frontend `npm run dev` → http://localhost:4028.

**One-time Supabase setup** (Dashboard → Authentication → URL Configuration): add `http://localhost:4028/**` and
`https://studylooop.vercel.app/**` to **Redirect URLs**. Without it, confirmation and reset emails send you to the
Site URL instead of back to the app.

## Already verified automatically (19 Sep 2026)
- Signed out, `/video-study-page?v=HtSuA80QTyo` redirects to `/login?next=…` (same video after sign-in).
- Backend loads the project's ES256 keys at startup (`JWKS loaded` in the log); `/health` → `auth: true`.
- Live: anonymous or forged-token WebSocket hello → closed with 4401; REST without a token → 401.
- Unit tests: ES256 via JWKS (good / wrong key / wrong audience / expired), `study_sessions` writes,
  a database outage never breaks voice.

## Your pass (needs a real inbox)
- [ ] **Create an account** → "Check your inbox" → the email link opens `/login` → you land on the dashboard, signed in.
- [ ] Sidebar shows **your name / email** and initials (not the old demo user).
- [ ] Open a lecture → badge turns **Voice ready** → "pause", "go back 10 seconds" work (the socket now sends your token).
- [ ] Backend log shows `session <uuid> started (user …, video …)`; Supabase → Table editor → `study_sessions` has the row.
      Close the tab → the row's `max_watched_s` / `last_seen_at` update. If the log says `could not record start: HTTP …`,
      paste that line — voice keeps working either way.
- [ ] **Reload** the page → still signed in. **Sign out** (sidebar) → back on the landing page; opening `/dashboard-home` asks you to sign in.
- [ ] **Wrong password** → "Wrong email or password." (no crash). Unconfirmed account → message + "Send it again".
- [ ] **Forgot password** → email → link → "Choose a new password" → update → signed in.
- [ ] Hindi toggle still works after signing in (one command from the Tier 0 Hindi table).
