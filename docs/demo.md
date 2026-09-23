# Public demo

The hosted Supabase + Vercel project is a **permanent public demo**. The gym itself has
not moved onto the app yet. When it does, it gets a **new, clean** Supabase and Vercel
project ([go-live.md](go-live.md)), without anything from this page.

The demo contains only generated data. The gym's own records are not used.

## What is different in demo mode

`DEMO_MODE=true` is a server-only flag (`lib/demo.ts`, not `NEXT_PUBLIC`). It changes
only the things below. All other behaviour is the same as a real deployment.

| Where | Demo behaviour |
|---|---|
| `/login` | Adds **Isprobaj kao radnik** / **Isprobaj kao admin** under the form (`app/(auth)/login/demo-actions.ts`). |
| Worker button | Signs in as `jelena` and sets the signed `gym_counter` cookie, so the browser acts as the counter: check-in, payments, shift. |
| Admin button | Signs in as `dragan` and clears the counter cookie, which gives the owner's remote view: takings, shifts, prices, accounts. |
| App shell | Shows the English guide banner (`components/demo-banner.tsx`). A visitor can dismiss it, and the choice is kept in `localStorage`. |
| `/nalozi` API | Account changes are refused with 403 "Onemogućeno u demo režimu." The nightly reset does not touch auth, so a visitor must not be able to lock the shared accounts. |
| Forgot password | The usual neutral confirmation shows, but no email is sent. |

Before signing in, each button also restores its account: active, expected role, and the
password from the Vercel env. The env passwords are therefore the source of truth, even
if `scripts/demo-staff.mjs` was run with different ones.

Visitors can change prices, packages and operational data. The nightly reset puts all of
it back.

`/login` is prerendered, so `DEMO_MODE` is read **at build time**. After changing it,
redeploy.

## Pieces

| File | Role |
|---|---|
| `supabase/demo/demo_generator.sql` | `demo` schema: `demo.generate(from, to)`, `demo.reset(today)` and helpers. The schema is not exposed through the API (revoked from `anon` / `authenticated`, not in the exposed schemas). **Not a migration**, so a real project never gets it. |
| `supabase/demo/demo_cron.sql` | pg_cron job `demo-nightly-reset` at `30 0 * * *` UTC (01:30 in winter, 02:30 in summer in Belgrade), after the gym's own jobs. |
| `supabase/seed.sql` | Local and CI only: creates the demo staff directly in `auth.users`, then runs `select demo.reset()`. `config.toml` loads the generator before it. |
| `scripts/demo-staff.mjs` | Hosted demo only: creates the six demo accounts through the Auth admin API. |
| `scripts/capture-media.mjs` | Captures the README screenshots and GIF from a running demo. |

Demo staff:

- `dragan`: owner, Admin
- `jelena`, `marko`, `ana`: counter workers. The worker button uses `jelena`.
- `nikola`, `milica`: trainers

Only `dragan` and `jelena` have known passwords. The others get random ones, because they
exist only in the generated history.

## What `demo.reset()` does

1. Deletes all operational rows: sessions, payments, check-ins, memberships, members,
   shifts, login attempts. It then restarts `member_no_seq`.
2. Restores the catalog snapshot that was taken the first time the generator was applied:
   categories, packages, prices. It also re-activates all keys and puts the demo staff back
   to their roles.
3. Runs `demo.generate(today − 394, today)`: 12 months plus one warm-up month, simulated
   day by day. The simulation covers members with personas, seasonal, weekday and hourly
   arrival patterns, payments at the listed prices, pauses, prepaid renewals, session
   debt, voids, Fitpass guests, and shifts with handover. Today stops at 11:00 with
   `jelena`'s shift still open.
4. Stores the counts in `demo.meta` (`last_reset`).

The generator is deterministic (`setseed`), so the same date always produces the same
data. For 2026-09-23 it produced 372 members, 28,021 check-ins, 3,480 payments and 675
shifts, both locally and on the hosted demo. Before 11:00 Belgrade time, the morning's
generated arrivals carry times that are still in the future. There is no daytime tick.

Timing: a reset takes about 10 seconds locally and about 5 minutes on the hosted project.
The Supabase SQL connection used by tools has a 2-minute statement timeout, so run it
manually with `set statement_timeout = 0; select demo.reset();`. pg_cron jobs run without
that limit.

## Setting up the hosted demo

Every step changes the remote project. Run them in order, deliberately.

1. Back up the database.
2. Wipe operational data. Delete any real accounts: first their `staff` row, then the auth
   user, because `staff.id → auth.users` is `on delete restrict`. `price.updated_by` and
   `training_category.updated_by` must be nulled first.
3. Apply all migrations (`supabase db push`).
4. Create the demo staff, with `.env.local` pointing at the demo project:
   `DEMO_ADMIN_PASSWORD=… DEMO_WORKER_PASSWORD=… node scripts/demo-staff.mjs`.
   Use at least 12 characters.
5. Apply `supabase/demo/demo_generator.sql` in the SQL editor, **not** as a migration.
   Then apply `demo_cron.sql`, then run `set statement_timeout = 0; select demo.reset();`.
6. Set these Vercel env vars (Production), then redeploy:
   - `DEMO_MODE=true` (Plain)
   - `DEMO_ADMIN_PASSWORD` and `DEMO_WORKER_PASSWORD` (Sensitive)
7. Smoke test:
   - both buttons work;
   - as the worker: a check-in and a payment;
   - `/nalozi` changes are refused;
   - the banner shows;
   - the next day, the dates have moved forward.

## Turning the demo off

1. In Vercel, remove `DEMO_MODE` and the `DEMO_*` passwords, then redeploy. The buttons
   and the banner disappear.
2. In Postgres:

   ```sql
   select cron.unschedule('demo-nightly-reset');
   drop schema demo cascade;
   ```

3. Delete the six demo accounts, `staff` row first.

Never reuse this project for the gym: its auth users and history come from the
generator.
