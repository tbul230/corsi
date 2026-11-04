# The Corsi Block-Tapping Experiment

A research web app that measures **visuospatial short-term memory (Corsi span)** after three kinds of 15-minute break, using a within-subjects design:

| Condition | What participants do for 15 minutes |
|---|---|
| 🎮 Video Game Break | Play their favorite video game |
| ▶️ YouTube Break | Watch YouTube |
| ☕ No-Screen Break | Rest without any electronic screens |

Every participant completes each condition **exactly once**, in any (counterbalanced) order. The **break always comes first**, followed immediately by the Corsi test, and every result is saved to Firebase (Cloud Firestore) and charted live.

> This is an experimental implementation of a Corsi-style task. It is **not** a validated clinical or diagnostic assessment.

## Participant flow

1. **Start** → **Sign in with Google** (Firebase Authentication). Everyone must sign in; there are no passwords or access codes.
2. **Confirm name** (pre-filled from Google; real first + last name, duplicates blocked) and **consent** (three required agreements and a plain-language explanation of what is collected, who sees it and how it is used)
3. **Choose a break** → three cards; completed conditions are disabled with a COMPLETED badge and the previous score
4. **15-minute break** → a real countdown computed from server timestamps (survives refresh, background tabs and closing the browser; cannot be paused, reset or skipped; the server refuses an early test)
5. **Corsi test** → 3×3 grid, server-generated sequences, fixed timing, stopping rule
6. **Results** → span, longest correct sequence, correct/incorrect trials, accuracy, test and break duration, completion time, trial-by-trial table
7. **Dashboard** → progress (e.g. *2 of 3 conditions completed*), resume an unfinished break, completion message after all three. Signing in with the same Google account on any device continues where you left off.

## Corsi task parameters

| Parameter | Value |
|---|---|
| Blocks | 9, fixed 3×3 grid |
| Block lit / gap / lead-in | 1000 ms / 500 ms / 1000 ms |
| Start length | 2 blocks, +1 after each correct trial (max 9) |
| Sequences | random, generated in the database, no repeated block within a sequence |
| Stopping rule | two failed attempts at the same length (or success at length 9) |
| Corsi span | longest length reproduced correctly (0 if none) |
| Also recorded | total score (span × correct), accuracy, per-trial sequence, response, correctness and response time |

## Pages

| Route | Purpose |
|---|---|
| `/` | Landing page |
| `/register` | New/returning participant + consent |
| `/dashboard` | Participant progress |
| `/select` | Break-condition cards |
| `/session/[id]` | Break timer → Corsi test → results (state-driven, refresh-safe) |
| `/results` | Public, anonymised live charts (auto-refresh every 10 s) |
| `/methodology` | Full procedure for reporting/replication |
| `/admin` | Researcher dashboard (Google sign-in, admin emails only) |
| `/admin/login` | Google sign-in for researchers |

Charts: average span by break type (with *n*), individual participant comparison (grouped bars), accuracy comparison, overall stats, and a practice-effect check (span by completion order). Missing conditions are never plotted as zero. Filters for condition and participant, plus a table view.

Admin dashboard: all participants, per-participant detail with exact break/test timestamps, trial-by-trial data, completion statistics, unfinished sessions, interrupted breaks, and CSV export (sessions, trials, participants, break events).

## Admin tools

**Administrators** are the Google accounts listed in the `ADMIN_EMAILS` environment variable. They sign in with Google at `/admin` like everyone else and are recognised automatically, with no password and no code.

**Test mode**: in the admin dashboard (*Export & account* → *Start a test run*), an admin becomes a throw-away "Admin Test ###" participant. Breaks can be skipped and conditions redone; test runs are flagged `is_test` and excluded from the public results, charts, statistics and CSV exports (admins can show them with a toggle).

**Deleting data**: admins can delete a participant (with all attempts and trials) or a single attempt. Every deletion is written to `deletion_log` with a JSON snapshot of what was removed.

## Architecture & data integrity

- **Next.js 16 (App Router) + React 19 + TypeScript + Tailwind CSS v4 + Recharts**, deployed on **Vercel**.
- **Firebase** project `corsitask`: **Authentication** (Google sign-in) and **Cloud Firestore**.
- The browser only signs in with Google. It sends the Firebase ID token once to `/api/auth/session`, where the server verifies it with the **Firebase Admin SDK** (Google provider + verified email required) and issues a signed, httpOnly session cookie.
- **All reads and writes go through the Next.js server using the Admin SDK.** `firestore.rules` denies every client read/write, so nobody can touch the database directly from a browser.
- All experiment rules run on the server inside Firestore transactions (`src/lib/server/experiment.ts`):
  - one session document per participant per condition (`sessions/{participant}__{condition}`), so a condition can never be repeated
  - only one condition in progress at a time
  - break end = start + 15 min; the test is refused before then
  - sequences, correctness and all scores are computed by the server
  - completed results are never modified; only admins can delete, and every deletion is logged

Firestore layout: `participants/{uid}`, `names/{nameKey}` (unique names), `sessions/{id}` with `trials/` and `events/` sub-collections, `deletion_log/`, `meta/counters` (counterbalancing).

## Local development

```bash
npm install
cp .env.example .env.local      # fill in the values
npm run dev
```

Run against the Firestore emulator (no credentials needed):

```bash
npx firebase emulators:start --only firestore
FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 SESSION_SECRET=any-32-character-string-here npm run dev
```

Checks:

```bash
npm run typecheck
npm test
npm run build
# full browser flow (mints a session cookie instead of the Google popup)
BASE_URL=http://localhost:3000 SESSION_SECRET=... ADMIN_EMAIL=you@example.com BACKDATE=1 \
  FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 node tests/e2e/flow.mjs
```

Deploy Firestore rules and Auth config: `npx firebase deploy --only firestore,auth`.

## Environment variables

| Name | Notes |
|---|---|
| `NEXT_PUBLIC_FIREBASE_API_KEY`, `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`, `NEXT_PUBLIC_FIREBASE_PROJECT_ID`, `NEXT_PUBLIC_FIREBASE_APP_ID`, `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`, `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` | Firebase web app config (public) |
| `FIREBASE_SERVICE_ACCOUNT` | **Secret.** Service-account JSON from Firebase console → Project settings → Service accounts → *Generate new private key* (raw JSON or base64) |
| `SESSION_SECRET` | **Secret.** Random string (32+ chars) that signs session cookies |
| `ADMIN_EMAILS` | Comma-separated Google accounts with admin access |
