# Gym Management System

Counter-desk management app for a single gym: members, memberships and prices, daily
check-ins, payments and takings, worker shifts and handover, physical keys, and
membership pause/resume. It is built for the staff working one physical counter — not
for members — and runs online-only against a Supabase backend, with the UI in Serbian.

## Tech stack

Next.js 15 (App Router) · React 19 · TypeScript · Tailwind CSS v4 · shadcn/ui ·
Supabase (Postgres + Auth, RLS) · Resend (password-reset email) · Vercel (hosting).

## Architecture in brief

- **Rendering** — Server Components read through a cached server-side Supabase client;
  interactive pieces (search, dialogs, table actions) are Client Components.
- **Mutations** — Server Actions for writes. Check-ins go through Postgres RPCs
  (`create_checkin`, `void_checkin`) so session deduction, reserved debt and first-visit
  activation happen atomically in one transaction.
- **Auth** — username + password, mapped onto Supabase Auth via a synthetic internal
  email so roles and audit still work. `middleware.ts` refreshes the JWT cookie once per
  request. Two roles, per the `staff_role` enum: `user` (counter worker) and `admin`.
- **Authorization** — Postgres RLS is the authoritative boundary, and some rules are pushed
  further down still: archiving a member with unsettled debt is blocked by a trigger
  (`member_archive_no_debt_guard`), and the open-visit guard lives inside the
  `create_checkin` RPC, so both hold even if the app layer is bypassed. Others, such as the
  last-active-admin guard, are enforced in the accounts API route.
- **Counter binding** — check-in and payment require a signed `gym_counter` device cookie,
  so takings can only be recorded from the registered counter machine.
- **Shifts** — derived from auth sessions, with attribution and handover between workers.
- **Backup** — `scripts/backup-usb.mjs` dumps the database to a local USB disk 3×/day via
  Windows Task Scheduler, keeping the last 7 runs.

Full diagram, folder layout and feature → implementation map: [docs/Tech.md](docs/Tech.md).

## Documentation

All of it lives in [`docs/`](docs/) and is versioned alongside the code:

- [docs/PRD.md](docs/PRD.md) — product requirements and implementation status.
- [docs/Tech.md](docs/Tech.md) — architecture, deployment, environment variables.
- [docs/DB.md](docs/DB.md) — database schema, triggers, RPCs and behavior.
- [docs/go-live.md](docs/go-live.md) — go-live checklist.
- [docs/smoke-test.md](docs/smoke-test.md) — pre-launch smoke test.
- [docs/backup-setup.md](docs/backup-setup.md) — USB backup setup (Windows).

## Getting started

```bash
npm install
npm run dev      # http://localhost:3000
npm run build    # production build
npm run lint     # eslint
```

Copy `.env.example` to `.env.local` and fill in the values. The full table with notes is in
[docs/Tech.md](docs/Tech.md) §10.

> ⚠️ On Vercel, `NEXT_PUBLIC_*` vars must be **Plain, not Sensitive** — Sensitive withholds
> them from the build and the app 500s. Keep only true server secrets Sensitive.

The two initial admin accounts are provisioned with `scripts/seed-admins.mjs`, which reads
usernames, passwords and recovery emails from the environment. There are no default
credentials in this repo.

## Demo

<!-- TODO -->

## How it was built

This project was built with [Claude Code](https://claude.com/claude-code) as the main
implementation tool, working against docs rather than ad-hoc prompts:

- **Docs are the source of truth.** [AGENTS.md](AGENTS.md) instructs any agent working in
  the repo to read `docs/PRD.md`, `docs/Tech.md` and `docs/DB.md` before implementing, and
  forbids inventing requirements or introducing patterns outside the architecture docs.
  Those three docs carry their own changelogs, so each phase records what changed and why.
- **Delivery was phased**, mapped to the scope of work in [docs/Tech.md](docs/Tech.md) §12 —
  auth and shift attribution first, then members, prices, check-ins and payments.
- **Pinned agent skills.** [`skills-lock.json`](skills-lock.json) and
  [`.agents/skills/`](.agents/skills/) vendor Supabase's Postgres and Supabase skills at a
  content hash, so schema and RLS work followed a fixed reference instead of whatever the
  model recalled.
- **MCP servers** were used for Supabase (migrations, advisors) and shadcn/ui (pulling
  component primitives) — see [docs/Tech.md](docs/Tech.md) §2 and §9.
- 17 of the 57 commits on this branch carry a `Co-Authored-By: Claude` trailer; the rest
  are human-authored or merge commits.

Working this way had real failure modes, which are recorded rather than tidied away:
[docs/Tech.md](docs/Tech.md) §9 keeps a running **deployment incidents & lessons** table —
for example, applying migrations through the Supabase MCP stamped the remote ledger with
its own timestamps and drifted it from the repo filenames, which had to be reconciled with
`supabase migration repair`.

## Where the AI got it wrong

<!-- TODO -->
