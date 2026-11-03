# The Corsi Block-Tapping Experiment

A research web app that measures **visuospatial short-term memory (Corsi span)** after three kinds of 15-minute break, using a within-subjects design:

| Condition | What participants do for 15 minutes |
|---|---|
| 🎮 Video Game Break | Play their favorite video game |
| ▶️ YouTube Break | Watch YouTube |
| ☕ No-Screen Break | Rest without any electronic screens |

Every participant completes each condition **exactly once**, in any (counterbalanced) order. The **break always comes first**, followed immediately by the Corsi test, and every result is saved to Supabase and charted live.

> This is an experimental implementation of a Corsi-style task. It is **not** a validated clinical or diagnostic assessment.

## Participant flow

1. **Start** → registration with real first + last name (duplicates blocked; a 6-character access code lets people resume on another device)
2. **Consent** → three required agreements + plain-language explanation of what is collected, who sees it and how it is used
3. **Choose a break** → three cards; completed conditions are disabled with a COMPLETED badge and the previous score
4. **15-minute break** → a real countdown computed from server timestamps (survives refresh, background tabs and closing the browser; cannot be paused, reset or skipped; database refuses an early test)
5. **Corsi test** → 3×3 grid, server-generated sequences, fixed timing, stopping rule
6. **Results** → span, longest correct sequence, correct/incorrect trials, accuracy, test and break duration, completion time, trial-by-trial table
7. **Dashboard** → progress (e.g. *2 of 3 conditions completed*), resume an unfinished break, completion message after all three

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
| `/admin` | Researcher dashboard (Supabase Auth, admins only) |

Charts: average span by break type (with *n*), individual participant comparison (grouped bars), accuracy comparison, overall stats, and a practice-effect check (span by completion order). Missing conditions are never plotted as zero. Filters for condition and participant, plus a table view.

Admin dashboard: all participants, per-participant detail with exact break/test timestamps, trial-by-trial data, completion statistics, unfinished sessions, interrupted breaks, and CSV export (sessions, trials, participants, break events).

## Architecture & data integrity

- **Next.js 16 (App Router) + React 19 + TypeScript + Tailwind CSS v4 + Recharts**, deployed on **Vercel**.
- **Supabase Postgres** holds everything. Schema, RLS and API live in [`supabase/migrations`](supabase/migrations).
- Participants never touch tables directly. The Next.js server calls `SECURITY DEFINER` Postgres functions with the publishable key and an opaque participant token kept in an **httpOnly cookie** (stored only as a SHA-256 hash in the database).
- All rules are enforced **in the database**, so they hold for any tab, browser or direct API call:
  - `UNIQUE (participant_id, condition)` – a condition can never be repeated
  - only one condition in progress at a time
  - break end = start + 15 min (CHECK constraint); `next_trial` refuses to run before it
  - sequences, correctness and all scores are computed server-side
  - triggers make completed sessions and trial rows immutable (no edits, no deletes)
- **Admins** sign in with Supabase Auth; Row Level Security only lets users listed in `public.admins` read data. No service-role key is used anywhere.

## Local development

```bash
npm install
cp .env.example .env.local   # fill in your Supabase URL + publishable key
npm run dev
```

Apply the migration in `supabase/migrations/` to your Supabase project (SQL editor or `supabase db push`).

Make a user an administrator (after creating them in Supabase → Authentication → Users):

```sql
insert into public.admins (user_id) select id from auth.users where email = 'you@example.com';
```

Checks:

```bash
npm run typecheck
npm test
npm run build
```

## Environment variables

| Name | Notes |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Publishable (anon) key – safe for the browser; all access is mediated by token-checked functions and RLS |
