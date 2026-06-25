# Gym Management System

Counter-desk management app for a gym: members, memberships and prices, daily check-ins,
payments and takings, shifts/handover, physical keys, and pause/resume — built for a single
physical counter with an online-only Supabase backend.

## Tech stack

Next.js 15 (App Router) · React 19 · TypeScript · Tailwind CSS v4 · shadcn/ui ·
Supabase (Postgres + Auth, RLS) · Resend (password-reset email) · Vercel (hosting).

See [docs/Tech.md](docs/Tech.md) for the full architecture.

## Getting started

```bash
npm install
npm run dev      # http://localhost:3000
npm run build    # production build
npm run lint     # eslint
```

## Environment variables

Copy `.env.example` and fill in values. Full table and notes in
[docs/Tech.md](docs/Tech.md) §10.

> ⚠️ On Vercel, `NEXT_PUBLIC_*` vars must be **Plain, not Sensitive** — Sensitive withholds
> them from the build and the app 500s. Keep only true server secrets Sensitive.

## Backup

USB backup runs 3×/day on the counter PC via Windows Task Scheduler
(`scripts/backup-usb.mjs`). Setup: [docs/backup-setup.md](docs/backup-setup.md).

## Deploy & go-live

Operational runbook (env, accounts, counter registration, smoke test):
[docs/go-live.md](docs/go-live.md).

## Documentation

- [docs/PRD.md](docs/PRD.md) — product requirements and implementation status.
- [docs/Tech.md](docs/Tech.md) — architecture and technical implementation.
- [docs/DB.md](docs/DB.md) — database schema and behavior.
- [docs/go-live.md](docs/go-live.md) — go-live checklist.
- [docs/smoke-test.md](docs/smoke-test.md) — pre-launch smoke test.
- [docs/backup-setup.md](docs/backup-setup.md) — USB backup setup (Windows).
