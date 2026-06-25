# PRD — Gym Management System

Version: 1.24
Date: 2026-06-25
Status: Approved for development; **Phase 0 live in production** (2026-06-18); **go-live verified** (2026-06-25)
Language note: The product UI is **Serbian (latinica)**. This document is written in English for the development team; Serbian product terms and UI labels are kept in quotes where relevant.

> This document describes **what** the product must do (product & business requirements). It intentionally contains **no technical or database details** — see `Tech.md` and `DB.md` for those.
> v1.3 adds **§9 Implementation status** tracking what is live in the app vs. deferred.
> v1.4 marks **Pazar MVP** (§9.1) as implemented: cash payment, debt settlement, void/revert, daily takings, Admin month/year + CSV export, group Fitpass +300, queued `zakazana` renewals.
> v1.5 notes **Phase 0 auth/shift hardening** delivered in code (shift RPCs, password reset SSR callback, login-attempt cleanup) — see `Tech.md` v1.4 / `DB.md` v1.6.
> v1.6 notes **Phase 0 live in production** (deployed 2026-06-18): login, worker password reset (email link confirmed to point to the production site, not a dev address), shift tracking, and the Admin reconcile of un-attributed check-ins/payments were all verified end-to-end on the live site. Technical deployment notes — and an explanation of the deployment issues that were fixed along the way — are in `Tech.md` §9; the migration-history reconcile is in `DB.md` v1.8.
> v1.7 records **Phase 1a Members fixes**: phone is now **unique across all members** (incl. archived) — the old "family sharing / soft duplicate warning" rule is dropped in favour of a hard, database-enforced block with a readable message (§3.3, §8); the member card and members list now show **"Istekla"** for expired memberships and add a **"Istorija članarina"** history section. See `DB.md` v1.10 / `Tech.md` v1.8.
> v1.8 records **Phase 1a Members review closure**: restore (unarchive) is **Admin-only and DB-enforced** via a `BEFORE UPDATE` trigger (§3.3); **custom price** is intentionally shown only in payment history (per-payment `is_custom_price`/`custom_reason`), not as a separate card field (§3.3). See `DB.md` v1.11 / `Tech.md` v1.9.
> v1.9 records **Phase 0 alignment live in production** (deployed 2026-06-18): access gate for workers off-counter (`/samo-salter`), logout open-shift prompt on counter devices, and **last-active-admin guard** — the system hard-blocks disabling or demoting the sole remaining active Admin (API 400 + disabled UI). Operational minimum of 2 Admins is partially enforced; provisioning a second Admin remains an operational responsibility. See `Tech.md` v1.10 / `DB.md` v1.12.
> v1.10 records a **Phase 0 review label fix**: the Dashboard sidebar item / page title now reads **"Kontrolna tabla"** in the app (Serbian UI), matching `Tech.md` §12. No behavioural change. See `Tech.md` v1.11.
> v1.11 records **Phase 1c Dashboard review follow-ups** (2026-06-19): a **trainer session for a member without an active trainer-based package** is now supported end-to-end (§3.5 "or no active package") — the worker picks the training category, the session is allowed, and it is recorded as a `rezervisano` debt at the **captured daily price** of that category; sessions **never transfer between categories** (a trainer session on, e.g., an active "Otvoreni" package does not consume an Otvoreni session — it is reserved). A member with an active **non-trainer** package gets a confirmation before the debt is recorded. Also: the "soon to expire" list no longer includes already-expired memberships (§3.13). **Accepted edge:** a session-based package whose `end_date` has passed but whose stored status is still `aktivna` is still treated as active (its session is deducted) — the "use remaining sessions after expiry" override (§3.4) remains a later phase. See `Tech.md` v1.14 / `DB.md` v1.15.
> v1.12 records **Payment ↔ Check-in link (Etapa 1)** (2026-06-19): a money-correctness fix for group Fitpass. **Cancelling a group Fitpass arrival now also removes its +300 RSD surcharge from the day's takings** (§3.8, §3.11) — previously the surcharge stayed in the total, inflating the "pazar". The +300 also shows as a badge on that arrival's dashboard row. A genuine membership payment linked to an arrival is never affected by cancelling the arrival. See `Tech.md` v1.15 / `DB.md` v1.17.
> v1.15 aligns **§9 Implementation status** with the codebase (2026-06-19): Phase 1c dashboard scope; **payment `checkin_id` Etapa 2 partial** — "Naplati" on an existing arrival row links the membership payment; search / member card / "Naplati članarinu" before check-in intentionally omit the link. Adds deferred items for session override after expiry (§3.4) and end-of-day unreturned-keys visibility (§3.7). See `Tech.md` v1.16 / `DB.md` v1.17.
> v1.16 records **Pause / resume membership** (2026-06-22): RPCs `pause_membership` / `resume_membership`; member-card controls; dashboard amber „Pauzirana članarina" badge + check-in warning; `create_checkin` frozen branch (no side effects while paused). See `Tech.md` v1.19 / `DB.md` v1.20.
> v1.17 records a **known gap — duplicate check-in while member still present** (§9.2): v1 allows it per §3.2/§8; guard deferred until pre-launch polish.
> v1.18 records **open-visit guard (GYM05) + key-number search** (2026-06-22): `create_checkin` hard-blocks a second member check-in while an open visit exists today (`key_returned=false`, incl. „Bez ključa"); passive UI hints in search + check-in dialog; keys panel search returns last holder ever (incl. Fitpass). See `Tech.md` v1.21 / `DB.md` v1.21.
> v1.19 records **solo auto session deduction for session-based Otvoreni packages** (2026-06-22): solo arrival on active Otvoreni 8/1, 12/1, or 1/1 decrements `sessions_left` without trainer tick; 0 sessions allows check-in without deduction; passive UI hints + last-session toast; time-based Otvoreni 30/1 and Kardio unchanged. See `Tech.md` v1.22 / `DB.md` v1.22.
> v1.20 records **Phase 2 dashboard closure** (2026-06-23): **end-of-day unreturned-keys report** (§3.7) — „Nevraćeni ključevi" section in keys panel with count badge, holder/time/worker per key, closing-time emphasis; **session override after expiry** (§3.4) — worker confirm to burn remaining sessions on expired session-based packages (solo Otvoreni + trainer, same category); search badge „Istekla — preostalo {n} sesija". Supersedes v1.11 accepted edge (silent deduct on `aktivna`+past `end_date`). See `Tech.md` v1.23 / `DB.md` v1.23.
> v1.21 records **Phase 3 — PWA + offline check-in/payment + USB backup** (2026-06-25): installable PWA shell (Serwist), IndexedDB cache + outbox, optimistic check-in/payment while offline, main-thread sync drain with `p_id` idempotency, connectivity UX, `NEXT_PUBLIC_OFFLINE_ENABLED` kill switch, `scripts/backup-usb.mjs`. Offline member create deferred. See `Tech.md` v1.24 / `DB.md` v1.24.
> v1.22 records **Phase 3 rollback — online-only counter** (2026-06-25): product decision to **cancel offline/PWA**; the counter requires internet for check-in and payment. Reliability = **Supabase (primary cloud)** + **USB backup 3×/day** (`scripts/backup-usb.mjs`, Windows Task Scheduler). Additional cloud backup (Supabase scheduled backups / ops plan) is **not implemented in app code**. Removed: PWA, service worker, IndexedDB outbox, offline connectivity UI. See `Tech.md` v1.25 / `DB.md` v1.25.
> v1.23 records **Phase 3 DB rollback — revert offline idempotency** (2026-06-25): Supabase RPCs `create_checkin` / `record_payment` no longer accept client-supplied ids (`p_id` removed). Historical migration `20260625120000` remains in ledger; forward migration `20260625160000` restores pre-offline signatures. No product behaviour change for online-only counter. See `Tech.md` v1.26 / `DB.md` v1.26.
> v1.24 records **go-live verified on production** (2026-06-25): migrations 41/41 in sync, Vercel env confirmed (`NEXT_PUBLIC_*` Plain), full pre-launch smoke test passed, and USB backup verified on the counter PC (`scripts/backup-usb.mjs`, JSON fallback, size logging). Operational runbook + checklists added: `go-live.md`, `smoke-test.md`, `backup-setup.md` (§9.1).
> v1.14 records **Admin Smene history UI** (2026-06-19): `/smene` is no longer a stub — Admins (including remote, without counter cookie) see a **weekly shift history** (Mon–Sun navigation via `?date=`, optional worker filter), per-day worker summaries, how each shift ended (`logout` / `switch` / `auto_close` / open), gaps in counter coverage vs gym opening hours, and CSV export for the displayed week. Shift runtime (open/handover/end, auto-close, reconcile) unchanged. See `Tech.md` v1.17 / `DB.md` v1.18.
> v1.15 records **Payment ↔ Check-in link (Etapa 2 complete)** (2026-06-22): membership payments and same-day arrivals for the **same member** are linked via `payment.checkin_id` regardless of UI entry point or order (pay-then-check-in or check-in-then-pay). Explicit link from the arrivals-row **Naplati**; app-layer auto-match when UI passes `null`. **Accepted edge:** a same-day renewal payment with no training intent may still attach to a later arrival that day (cosmetic badge only — voiding the arrival never voids the membership payment). See `Tech.md` v1.18–v1.20 / `DB.md` v1.19.

---

## 1. Overview

An internal web application for running a single gym (family business) that replaces paper records. Front-desk workers record member arrivals, hand out lockers/keys, take cash payments, and manage memberships. The system must be **fast for one counter** and **requires internet connectivity** at the counter device.

### 1.1 Goals
- Fast daily check-in of members (first name, last name, member number, key, membership status).
- Simple cash-payment tracking with daily / monthly / yearly totals.
- A clear virtual card per member with all data and history.
- Easy creation of members and management of memberships (multiple types and price lists).
- Visibility of expired and soon-to-expire memberships.
- Worker shift tracking for accountability.
- Data reliability via cloud (Supabase) plus scheduled local USB backup (see §3.15).

### 1.2 Key product constraints
- Single gym, single counter device (plus the Admin viewing remotely — see §2).
- Localization: Serbian (latinica), currency RSD.
- Timezone: Europe/Belgrade; the business day resets at **local midnight**.
- Notifications in v1 are **visual only** (in-app); no SMS, and email is used **only for worker password reset** (see §3.1).

---

## 2. User roles & permissions

| Capability | User (front desk) | Admin |
|---|---|---|
| Login / logout | Yes | Yes |
| Check-in, assign/release key | Yes | Yes |
| Cash payment & custom price (with confirmation) | Yes | Yes |
| Create / edit / archive members and their data | Yes (any member, anytime) | Yes |
| Edit daily logs (check-ins / payments) | **Today only** | **Any day** |
| View takings ("pazar") | **Daily only** (today and back) | **Daily, monthly, yearly** |
| View shifts (who worked and until when) | No | Yes |
| Manage worker accounts (create / disable / reset password) | No | Yes |
| Edit price lists | No | Yes |
| Export reports | No | **Yes (Admin only)** |

Notes:
- There is a **minimum of 2 Admins**; only Admins manage worker accounts. **The system hard-blocks disabling or demoting the last remaining active Admin** (API 400 + disabled UI controls); keeping at least two active Admins provisioned remains an operational responsibility.
- Login is via **username + password** (no public email login).
- **Trainers are the workers themselves** — any active worker/Admin account can be selected as the trainer for a session.
- **Admin remote access**: an Admin may log in from home to view daily activity. This remote session is **view-only (overview)** and **does not create a shift**, and is exempt from the single-counter-session rule.

---

## 3. Functional requirements

### 3.1 Login & accounts
- Login page (username + password). After login → main Dashboard ("Kontrolna tabla"). Usernames are case-insensitive.
- Sidebar navigation: Dashboard ("Kontrolna tabla"), Members ("Članovi"), Membership Prices ("Cene članarina"), Daily Payments / Takings ("Dnevne uplate / Pazar"), and Admin-only: Shifts ("Smene"), Accounts ("Nalozi").
- Password policy: **minimum 8 characters**, no other rules.
- **Disabled accounts cannot log in**; after several failed attempts in a row login is **temporarily locked** to deter guessing.
- **Password reset**: self-service via **email**. Each worker account has a **recovery email** (set by an Admin). The worker requests a reset by username (or an Admin triggers it); a reset link valid for **1 hour** is emailed to that address.
- Account management (Admin only): create worker (**Admin sets the password directly**; the worker does not have to change it on first login), disable/enable worker, reset password, set/update recovery email, set role. **Cannot disable or demote the last active Admin.**
- **Counter vs. remote**: the front-desk computer is registered once as "the counter" ("šalter"); only logins on that device create a worker **shift**. An Admin logging in from any other device gets the **view-only overview** with no shift (see §2).

### 3.2 Main Dashboard (daily check-in)
- Shows all arrivals for the selected day: **first name, last name, member number, key number**.
- If the membership is expired at check-in → a red **"istekla članarina"** marker next to the entry (check-in is still allowed).
- If the member pays that day → the entry shows **which membership was paid and how much**.
- **Member search** at check-in: by first name, last name, and member number.
- **Multiple arrivals of the same member** in one day are allowed **after „Otišao"** (each is a separate record). A **second check-in while the member is still present** (open visit: non-voided today row with `key_returned=false`, including „Bez ključa") is **blocked** by the server (`GYM05`); the UI shows a passive hint but staff must record **„Otišao"** first.
- If the member has a trainer-based membership, the worker may **tick the training type**: "vođeni" (guided/group), "individualni", or "duo":
  - If a trainer-based type is ticked → arrival recorded, **1 session deducted**, the session date is **written to the member's card**, and a **trainer is selected** (from the worker accounts list).
  - If not ticked (member trains alone) → arrival recorded, **no session deducted** (members with a session package or time-based membership may train alone).
- **Comment / special needs**: if the member has a comment, it is visible both in the dashboard row (a marker) and on the card; when checking in / charging such a member, a **popup** appears, e.g. "this member may pay less — see the comment for why".
- **"Otišao" (left) button** next to an entry: releases the key for reassignment.
- **Back-navigation through days** (view previous days).

### 3.3 Members & virtual card

**List & search** (page "Članovi"): fuzzy search by **first name, last name, and member number**; phone is shown on rows but **not searchable**. Paginated browse when the search box is empty. Quick-create from the list.

Card fields:
- Member number (auto-incrementing, permanent, never reused).
- First name, Last name.
- Phone number (**required and unique across members**, including archived). Each member has their own number; entering a number already on file is **blocked with a readable message** ("Broj telefona već postoji kod drugog člana."). Uniqueness is by normalized digits (ignores spaces/dashes/`+`) and enforced in the database.
- Current membership: type, payment date, start date, end date, remaining sessions (if a package), status (active / expired / paused / no membership). When the latest membership has expired, the card and the members list show **"Istekla"** (not "no membership"), and a **"Istorija članarina"** section lists past/expired memberships (type · start–end · status).
- Discount flag (family / school) — yes/no. **Any worker can toggle it.**
- Custom price is **not** a separate card field — it is recorded **per payment** (`is_custom_price` / optional `custom_reason`; see `DB.md` §3.8). Discounted payments appear in **"Istorija uplata"** with a discount badge.
- Comment (special needs).
- **History**: previous memberships, payment history, session history (trainer-session dates), reserved/owed sessions.

Rules:
- A member **can be created without a membership** (status "no membership").
- Deletion is **soft (archiving)** — the member disappears from active lists but history is preserved. **An Admin can restore (unarchive) a member** — enforced at the database level (only Admins may set `archived` from `true` to `false`; any worker may still archive).
- Member numbers are **never reused**, even after archiving.

### 3.4 Memberships — model & rules
Training types:
- Open type ("Otvoreni tip") — self-guided training
- Cardio ("Kardio") — cardio machines only
- Individual ("Individualni") — 1-on-1 with a trainer
- Duo ("Duo") — 2 members + 1 trainer, price **per trainee**
- Guided/group ("Vođeni") — group training

Two billing models:
- **Time-based (no sessions)** — unlimited arrivals while the period lasts; only expiry is checked. (e.g. Open type 30/1, Open type discount 30/1, Cardio 30/1.)
- **Session-based** — a package of N sessions, valid **30 days from the start date**; unused sessions expire (with an allowed override, see below). (All individual/duo/guided packages, daily 1/1, and Open type 8/1 and 12/1.)

Rules:
- **One active membership per member** at a time (no parallel memberships).
- **Membership start**: defaults to the payment date; the worker may set it to start **from the first visit** (e.g. the member pays but starts 5 days later). When "from first visit" is chosen, the start date is set automatically on the member's first check-in.
- **Session deduction**:
  - Trainer session (individual/duo/guided) → 1 session per member per session (for duo and group, each present member loses 1, written to their card).
  - Open type session-based (8/1, 12/1, daily) → each arrival deducts 1 session.
  - Time-based → nothing is deducted; only the arrival stays in history.
- **Using remaining sessions after expiry**: allowed via override. **Any worker can approve the override with a confirmation.**
- **Pause ("Pauziraj članarinu")** freezes the membership; **"Nastavi članarinu"** resumes it. Pausing **extends the end date by the exact number of paused days** (applies to both time-based and session-based). **No limit** on pausing — pause/resume anytime.
- **Renewal/extension**: a **new period** is created; the card shows the current period plus the history of earlier ones.

#### Duo & group capture
- **Duo**: the two trainees are **checked in independently** (no linkage between them); each loses 1 session and is charged per trainee.
- **Guided/group**: each participant gets their **own check-in with 1 session deducted**; the **trainer is chosen once** for the session.

### 3.5 Trainer session with 0 sessions — reserved (owed) session
- If a member comes for a trainer session but has 0 sessions (or no active package), the **session is allowed**.
- The card records the **session date as "rezervisano"** (a debt), **without assuming** which membership they'll buy next.
- At the **next payment**, that debt is charged as the **daily price of that training type** (individual / duo / guided), **in addition** to the chosen membership. The owed amount is **the daily price captured at the time the debt was incurred** (so later price changes don't affect old debts).
- A **notification** explains it, e.g.: "On {date} {First Last} attended a {individual/guided/duo} session and did not pay that extra session — charge {daily price}."
- A member can accumulate **multiple reserved dates**; the system **warns after 3 owed sessions** but **still allows training**.
- A member with **unsettled owed sessions cannot be archived** — archiving is blocked with a warning until the debt is settled.

### 3.6 Payment (cash)
- Cash only (no cards).
- A payment may be **standalone** (the member pays without training that day) **or tied to an arrival**. On the counter, same-day membership payment and arrival for the same member are **auto-linked** when either happens second (pay-then-check-in or check-in-then-pay); the worker may also link explicitly via "Naplati" on an arrival row or "Naplati članarinu" after confirming check-in.
- A payment records: member, membership type, amount, date.
- **Custom price**: a worker may enter a **lower** price than standard (must be **greater than 0**), with a **confirmation**: "Are you sure you want a discount for {First Last}?" An **optional free-text reason** can be saved with the payment.
- **Discount (family/school)**: a member flagged as "discount" is automatically offered the **reduced price list** when an **Open type** is selected (12/1 = 2,500; 30/1 = 2,700). The discount applies **only to Open type**.

### 3.7 Keys (22 total)
- At check-in, a **key number** (1–22) is assigned.
- The dashboard shows **occupancy** (which keys are currently assigned).
- The **"otišao"** button releases a key for reassignment.
- At end of day, any key not released → a sign that someone took it home.
- **Shared keys are allowed**: two people may share one key. The system **tracks only the latest assignment** for a key.
- **Key search**: enter a key number → the system shows the **last member who had that key** (so the gym knows whom to contact). **Implemented** in the keys panel (`keys-panel.tsx`): number input + „Nađi" returns the last non-voided holder ever (member card link, or „Fitpass / nema kontakta").
- If **all 22 keys are taken**, a member may still be **checked in without a key** (optional), with a warning.

### 3.8 Fitpass
- **Fast anonymous "Fitpass" entry** on the dashboard with a **mandatory key number** (no member card created).
- A normal (non-group) Fitpass visit is recorded as a **0 RSD check-in** (counted, no money).
- For a **group session via Fitpass** there is a **+300 RSD surcharge**, recorded as a payment that day and **included in the daily total**. The dashboard shows this charge **on the group Fitpass arrival's row**, and **voiding that arrival removes the +300 from the daily total** (a cancelled group Fitpass visit no longer inflates the takings).

### 3.9 Membership prices (page)
- Overview page: **tabbed by training category** (Otvoreni tip, Kardio, Individualni, Duo, Vođeni, plus any Admin-added categories); each tab lists all packages with standard (and, for Open type, discount) prices.
- **Workers**: read-only view of active categories, types, and prices.
- **Admin**: inline price editing (click-to-edit, saved immediately); add new membership types and training categories; soft-deactivate/reactivate types and categories (deactivated items are hidden from workers, greyed for Admins). Discount prices remain **Open type only**.
- Updated prices are used immediately at payment. (No history of old prices is kept in v1.)

### 3.10 Daily payments / Takings ("Pazar")
- Page listing all payments for the selected day with the **total at the bottom**.
- The total is the **net total after voids/corrections**, with all line items visible.
- **Back-navigation through days.**
- **User** sees only the daily takings (today and back).
- **Admin** also sees **monthly and yearly** takings.

### 3.11 Corrections of payments
- A wrongly entered cash payment can be **edited or voided**.
- A **User** can edit/void **same-day** entries; an **Admin** can do so for **any day**.
- Voids are **kept in history** (not hard-deleted) for accountability.
- Voiding a payment that created or extended a membership **automatically reverts** that membership change (sessions/dates).
- Voiding a **group Fitpass arrival** automatically voids its **+300 surcharge** too, so the day's takings stay correct; a real membership payment tied to an arrival is **never** voided by cancelling the arrival.

### 3.12 Shifts & audit
- Shifts are derived **automatically from counter logins** (who was logged in and for which period). A shift **opens automatically** when a worker logs in at the counter.
- **"Završi smenu" ends the shift and signs the worker out** in one action (the worker is returned to the login screen). **Signing out alone does NOT end the shift** — plain logout leaves the shift open (it stays open until handed over or auto-closed), so a worker stepping away briefly can sign back in and resume. This suits the daily two-worker rotation (e.g. 09:00–15:00 and 15:00–21:00), where the changeover is normally a **handover**.
- **Handover** is done via a **"switch worker"** ("Zameni radnika") action that re-authenticates the incoming worker (username + password), closes the outgoing worker's shift, and opens the incoming worker's — without fully logging out of the app.
- A **safety net** auto-closes any shift left open, **20 minutes after the gym's closing time** for that day — **Mon–Fri 21:00, Saturday 18:00, Sunday 16:00** — recording the end time as the actual closing time, so a forgotten logout never produces a bogus multi-hour shift. The worker's session is not disturbed.
- An Admin sees who worked, until when, and when the next shift started.
- Every record carries **who entered it**; edits to past days are restricted to Admins.

### 3.13 Expiry notifications
- **Visual only** in v1: red "istekla članarina" on the dashboard + a **"soon to expire"** list for members whose membership expires in **≤ 3 days**.

### 3.14 Connectivity
- The counter device **must have internet** for check-in, payment, and all operational writes.
- If connectivity is lost, workers wait for reconnection — there is no offline queue in the app.

### 3.15 Backup
- **Automatic export to a local USB drive 3× per day** (the counter computer must be on) via `scripts/backup-usb.mjs` and Windows Task Scheduler.
- Primary data lives in **Supabase** (cloud). A separate **cloud backup** strategy (Supabase dashboard backups / scheduled exports) is an **operational plan**, not implemented in application code.
- The dataset is small (up to ~1,000 members), so exports are fast.

### 3.16 Reports export
- An **Admin-only "Export"** action is available on demand (e.g. monthly takings) to save a report to a file.

---

## 4. Price list (RSD)

### Individual ("Individualni")
- 1/1 (daily): 1,200
- 8/1: 8,800
- 10/1: 9,800
- 12/1: 11,800

### Duo (per trainee)
- 1/1 (daily): 1,000
- 8/1: 6,800
- 10/1: 7,800
- 12/1: 8,800

### Guided / group ("Vođeni")
- 1/1 (daily): 1,000  *(used both as a sellable daily option and to settle guided-session debt)*
- 8/1: 3,600
- 10/1: 4,100
- 12/1: 4,600
- 16/1: 5,100

### Open type / self-guided ("Otvoreni tip")
- 1/1 (daily): 450
- 8/1: 2,600
- 12/1: 2,800
- 30/1: 3,200

### Cardio
- 30/1: 2,600

### Discount (family: mother-daughter, sisters; primary/secondary school) — Open type only
- 12/1: 2,500
- 30/1: 2,700

### Fitpass
- Group-session surcharge: +300 (mandatory key entry).

> Note: "N/1" means N sessions valid for 1 month (30 days), except "30/1" which is a **time-based monthly** membership (unlimited arrivals).

---

## 5. Key workflows

### 5.1 Member check-in
1. Worker searches for the member.
2. If the member doesn't exist → quick-create the member, or use a Fitpass entry.
3. Add to dashboard + assign a key (key optional if all 22 are taken).
4. Trainer session?
   - **No (trains alone)** → record arrival, no session deducted.
   - **Yes (individual/duo/guided)** → choose trainer + type:
     - Has remaining sessions → deduct 1, write the date to the card.
     - No sessions → allow the session + record "rezervisano" (owed) for the next payment.
5. Membership expired? → show red "istekla članarina"; otherwise a normal record.

### 5.2 Payment with debt & discount
1. Select the member to charge.
2. Has reserved sessions? → notification: settle the captured daily debt price + explanation.
3. Has the discount flag **and** Open type selected? → offer the reduced price list; otherwise the standard list.
4. Custom price? → confirmation dialog ("Are you sure you want a discount for {First Last}?"), with an optional reason; otherwise the standard price.
5. Record the payment + update the membership.

---

## 6. Non-functional (product) requirements
- **Performance**: check-in should take a couple of seconds; member search fast (up to ~1,000 members).
- **Reliability**: Supabase as primary store; USB backup 3×/day on the counter PC; no offline operation.
- **Security**: role separation (User/Admin); only Admins manage accounts and view monthly/yearly takings and shifts.
- **Audit**: every record carries who entered it; edits to past days are Admin-only.
- **Localization**: Serbian latinica; currency RSD; time Europe/Belgrade; day resets at midnight.
- **Device/browser**: optimized for one counter (desktop). Target browsers: **Chrome, Edge, Firefox** (standard web app; not installable as PWA).

---

## 7. Out of scope (v1)
- Email/SMS notifications to members (email is used only for worker password reset).
- Trainer performance/earnings reports.
- Multi-location.
- Import of existing members (starting from zero).
- Card payments.
- Member photos and extra fields (date of birth, address, emergency contact).

---

## 8. Confirmed decisions log
- Login: username + password (case-insensitive); min. 2 Admins — **last active Admin cannot be disabled or demoted**. Disabled accounts cannot log in; basic lockout after repeated failed attempts (≥5 in 15 min).
- Password reset: self-service (or Admin-initiated) via email, using a per-worker recovery email set by an Admin; reset link valid 1 hour.
- Password policy: minimum 8 characters. Admin creating a worker sets the password directly; no forced change on first login.
- One counter device, identified by **device registration** ("set as counter"); only counter logins create shifts. Admin may log in remotely **view-only** (no shift created).
- Shifts from counter logins; **shift opens automatically on login**; **ending a shift and logging out are separate** (sign-out does not end the shift); handover via "switch worker" (re-auth by password).
- Shift auto-close safety net (Europe/Belgrade): **Mon–Fri 21:00, Sat 18:00, Sun 16:00**, fired 20 minutes after closing, end time stamped to the actual closing time, without ending the auth session.
- Trainers = worker accounts, chosen from a list.
- One active membership per member; start from payment date or first visit.
- Sessions valid 30 days; unused expire (override allowed by any worker with confirmation).
- Pause/resume extends the end date by exact paused days; no pause limit.
- 22 keys; occupancy view; "otišao" releases; shared keys allowed (track latest assignment only); key search returns last holder; check-in without a key allowed when full.
- Custom price: lower than standard and > 0, with optional reason; family/school discount only for Open type (auto reduced list).
- Fitpass anonymous + key; normal Fitpass = 0 RSD check-in; group Fitpass +300 enters the takings.
- Multiple arrivals of the same member per day; solo arrival logged without deducting a session.
- Trainer session: tick type (individual/duo/guided) → deduct session + write date to card. Duo trainees checked in independently; guided participants each get a check-in, trainer chosen once.
- 0 sessions: allow the session, record "rezervisano" (warn after 3), charge the **captured** daily price at the next payment.
- Soft delete of members (Admin can restore — DB-enforced; see §3.3); member number permanent and never reused; archiving blocked while owed sessions are unsettled.
- User edits all member data, but daily logs only for today; Admin all days.
- Voiding a payment reverts the linked membership change; takings show the net total.
- Takings: User daily; Admin daily/monthly/yearly; Admin-only export on demand.
- Notifications visual only; "soon to expire" threshold 3 days.
- Backup: automatic USB 3× daily (`scripts/backup-usb.mjs`) + Supabase cloud (primary).
- Phone required and **unique across all members** (incl. archived); duplicates are **blocked with a message**, enforced in the database by normalized digits. _(Supersedes the earlier "family sharing / soft warning" decision — Phase 1a, 2026-06-18.)_

---

## 9. Implementation status (as of 2026-06-25)

This section tracks delivery against the requirements above (Phase 0–3, online-only). Technical detail lives in `Tech.md` / `DB.md`. Phase 3 added the unreturned-keys report, session override after expiry, pause/resume, the Fitpass +300 surcharge, and the USB backup script; the offline/PWA layer that was briefly added in Phase 3 was **rolled back to online-only** (2026-06-25, see v1.22–v1.23). **Go-live verified on production 2026-06-25** (env, counter registration, smoke test, USB backup) — operational runbook in `go-live.md` / `smoke-test.md` / `backup-setup.md`.

### 9.1 Done
| Area | Scope |
|---|---|
| **Auth & shell** | Login, password reset (recovery email → link → set new password), accounts (incl. last-active-admin guard), counter-device cookie + `/samo-salter` access gate, shift lifecycle (auto-open, handover, manual end, logout open-shift prompt, auto-close safety net), sidebar nav |
| **Members ("Članovi")** | List + fuzzy search (ime, prezime, broj člana), create/edit, virtual card, archive/restore, discount toggle, comment |
| **Prices ("Cene")** | Tabbed catalog by training category, inline Admin price edit, add/deactivate types |
| **Dashboard v1** | Day view + date navigation; member search (ime, prezime, broj člana); check-in dialog (closes after successful confirm; key, trainer session, comment popup on open); **open-visit guard** (GYM05 + UI hints); Fitpass entry; keys panel + key-number search + "otišao"; void today's check-in / change key; read-only payment badge on rows; expired-membership marker; soon-to-expire header badge (≤3 days, excludes already-expired); quick-create member from search; remote Admin overview (stats + list); non-counter read-only banner. **Phase 1c (2026-06-19):** trainer session without an active trainer-based package (worker picks category; `rezervisano` debt at captured daily price; sessions never transfer across categories); S3 confirm when member has active non-trainer package |
| **Pazar ("Dnevne uplate")** | `/pazar`: daily payments table + net total + date nav; storno (mandatory reason) + edit amount/reason; shared `PaymentDialog` from dashboard search, arrivals row, check-in dialog, member card; membership payment (category → package → auto price, custom discount confirm, `start_mode`); debt settlement (per owed session); queued **`zakazana`** renewal when member already active; Admin month/year breakdown + CSV export |
| **Payments on dashboard** | Membership payment ↔ same-day arrival auto-linked per member (`payment.checkin_id`) in either order; explicit link from arrivals-row **Naplati**; auto-link when UI passes `null` (search, check-in dialog pay-before-confirm, member card); counter + today guard on `recordPayment` |
| **Group Fitpass +300 RSD** | Charged immediately on group Fitpass check-in (`fitpass_surcharge` payment, included in daily total); **voiding the arrival reverses the +300** and the charge shows as a per-arrival badge (Etapa 1, v1.12) |
| **Smene (shift history)** | Admin `/smene`: weekly Mon–Sun view (`?date=`, optional `?staff=` filter); per-day worker summaries; shift end reason badges; coverage-gap warnings vs gym hours (09:00–close); CSV export; remote Admin access without counter cookie (`Tech.md` §5) |
| **Pause / resume membership** | Member card: „Pauziraj članarinu" / „Nastavi članarinu" with confirm dialogs; extends `end_date` by exact paused calendar days on resume; dashboard amber badge + check-in warning; check-in while paused records arrival without session/debt side effects (`DB.md` §10.2, §11.4) |
| **Solo Otvoreni session deduction** | Solo arrival on active session-based Otvoreni package (8/1, 12/1, 1/1) auto-decrements `sessions_left`; 0 sessions → check-in allowed without deduction (passive UI hint); last-session toast on 1→0; void restores session; time-based Otvoreni 30/1 and Kardio unchanged (`DB.md` §10.2) |
| **Unreturned keys (§3.7)** | Keys panel „Nevraćeni ključevi" section: live list of physical keys not returned via „Otišao" for the selected `business_date` (holder, check-in time, worker); destructive count badge; stronger styling after gym close / on past days; workers + remote Admin overview |
| **Session override after expiry (§3.4)** | Worker confirm to use 1 remaining session on an expired session-based package (solo Otvoreni or trainer, same category); decline → arrival without deduction (trainer → `reserved_session` debt); search badge „Istekla — preostalo {n} sesija"; void restores session (`DB.md` §10.2) |
| **USB backup (Phase 3)** | `scripts/backup-usb.mjs` — `pg_dump` or JSON export; schedule 3×/day on counter PC via Task Scheduler |
| **Online-only counter (Phase 3 rollback)** | Offline/PWA layer removed (2026-06-25); check-in and payment require internet; direct server actions only |

### 9.2 Dashboard v1 — explicitly deferred
Nema preostalih deferred stavki za dashboard v1. (Duplicate check-in while member still present je sada Done — open-visit guard **GYM05**, migracija `20260622130000_open_visit_guard`; vidi §9.1 „Dashboard v1".)

### 9.3 Not started (post-MVP)
- Cloud backup automation beyond Supabase defaults (operational plan; not in app code).
