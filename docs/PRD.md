# PRD — Gym Management System

Version: 1.1
Date: 2026-06-11
Status: Approved for development
Language note: The product UI is **Serbian (latinica)**. This document is written in English for the development team; Serbian product terms and UI labels are kept in quotes where relevant.

> This document describes **what** the product must do (product & business requirements). It intentionally contains **no technical or database details** — see `Tech.md` and `DB.md` for those.

---

## 1. Overview

An internal web application for running a single gym (family business) that replaces paper records. Front-desk workers record member arrivals, hand out lockers/keys, take cash payments, and manage memberships. The system must be **fast for one counter** and **resilient to short internet outages**.

### 1.1 Goals
- Fast daily check-in of members (first name, last name, member number, key, membership status).
- Simple cash-payment tracking with daily / monthly / yearly totals.
- A clear virtual card per member with all data and history.
- Easy creation of members and management of memberships (multiple types and price lists).
- Visibility of expired and soon-to-expire memberships.
- Worker shift tracking for accountability.
- Continued operation during short internet outages (offline-first for check-in and payment).

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
- There is a **minimum of 2 Admins**; only Admins manage worker accounts. *(The system does **not** hard-block dropping below 2 Admins — it is an operational guideline.)*
- Login is via **username + password** (no public email login).
- **Trainers are the workers themselves** — any active worker/Admin account can be selected as the trainer for a session.
- **Admin remote access**: an Admin may log in from home to view daily activity. This remote session is **view-only (overview)** and **does not create a shift**, and is exempt from the single-counter-session rule.

---

## 3. Functional requirements

### 3.1 Login & accounts
- Login page (username + password). After login → main Dashboard. Usernames are case-insensitive.
- Sidebar navigation: Dashboard, Members ("Članovi"), Membership Prices ("Cene članarina"), Daily Payments / Takings ("Dnevne uplate / Pazar"), and Admin-only: Shifts ("Smene"), Accounts ("Nalozi").
- Password policy: **minimum 8 characters**, no other rules.
- **Disabled accounts cannot log in**; after several failed attempts in a row login is **temporarily locked** to deter guessing.
- **Password reset**: self-service via **email**. Each worker account has a **recovery email** (set by an Admin). The worker requests a reset by username (or an Admin triggers it); a reset link valid for **1 hour** is emailed to that address.
- Account management (Admin only): create worker (**Admin sets the password directly**; the worker does not have to change it on first login), disable/enable worker, reset password, set/update recovery email, set role.
- **Counter vs. remote**: the front-desk computer is registered once as "the counter" ("šalter"); only logins on that device create a worker **shift**. An Admin logging in from any other device gets the **view-only overview** with no shift (see §2).

### 3.2 Main Dashboard (daily check-in)
- Shows all arrivals for the selected day: **first name, last name, member number, key number**.
- If the membership is expired at check-in → a red **"istekla članarina"** marker next to the entry (check-in is still allowed).
- If the member pays that day → the entry shows **which membership was paid and how much**.
- **Member search** at check-in: by first name, last name, member number, and phone.
- **Multiple arrivals of the same member** in one day are allowed (each is a separate record).
- If the member has a trainer-based membership, the worker may **tick the training type**: "vođeni" (guided/group), "individualni", or "duo":
  - If a trainer-based type is ticked → arrival recorded, **1 session deducted**, the session date is **written to the member's card**, and a **trainer is selected** (from the worker accounts list).
  - If not ticked (member trains alone) → arrival recorded, **no session deducted** (members with a session package or time-based membership may train alone).
- **Comment / special needs**: if the member has a comment, it is visible both in the dashboard row (a marker) and on the card; when checking in / charging such a member, a **popup** appears, e.g. "this member may pay less — see the comment for why".
- **"Otišao" (left) button** next to an entry: releases the key for reassignment.
- **Back-navigation through days** (view previous days).

### 3.3 Members & virtual card
Card fields:
- Member number (auto-incrementing, permanent, never reused).
- First name, Last name.
- Phone number (**required**). Phone is normally unique, but **family members may share one** — a **duplicate-phone warning** is shown rather than a hard block.
- Current membership: type, payment date, start date, end date, remaining sessions (if a package), status (active / expired / paused / no membership).
- Discount flag (family / school) — yes/no. **Any worker can toggle it.**
- Custom price — if one exists.
- Comment (special needs).
- **History**: previous memberships, payment history, session history (trainer-session dates), reserved/owed sessions.

Rules:
- A member **can be created without a membership** (status "no membership").
- Deletion is **soft (archiving)** — the member disappears from active lists but history is preserved. **An Admin can restore (unarchive) a member.**
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
- A payment may be **standalone** (the member pays without training that day) **or tied to an arrival** — the worker chooses.
- A payment records: member, membership type, amount, date.
- **Custom price**: a worker may enter a **lower** price than standard (must be **greater than 0**), with a **confirmation**: "Are you sure you want a discount for {First Last}?" An **optional free-text reason** can be saved with the payment.
- **Discount (family/school)**: a member flagged as "discount" is automatically offered the **reduced price list** when an **Open type** is selected (12/1 = 2,500; 30/1 = 2,700). The discount applies **only to Open type**.

### 3.7 Keys (22 total)
- At check-in, a **key number** (1–22) is assigned.
- The dashboard shows **occupancy** (which keys are currently assigned).
- The **"otišao"** button releases a key for reassignment.
- At end of day, any key not released → a sign that someone took it home.
- **Shared keys are allowed**: two people may share one key. The system **tracks only the latest assignment** for a key.
- **Key search**: enter a key number → the system shows the **last member who had that key** (so the gym knows whom to contact).
- If **all 22 keys are taken**, a member may still be **checked in without a key** (optional), with a warning.

### 3.8 Fitpass
- **Fast anonymous "Fitpass" entry** on the dashboard with a **mandatory key number** (no member card created).
- A normal (non-group) Fitpass visit is recorded as a **0 RSD check-in** (counted, no money).
- For a **group session via Fitpass** there is a **+300 RSD surcharge**, recorded as a payment that day and **included in the daily total**.

### 3.9 Membership prices (page)
- Overview page: **select a membership type → see all prices for that type**.
- **Admin can edit prices** in-app; updated prices are used immediately at payment. (No history of old prices is kept in v1.)

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

### 3.12 Shifts & audit
- Shifts are derived **automatically from counter logins** (who was logged in and for which period). A shift **opens automatically** when a worker logs in at the counter.
- **Ending a shift and logging out are separate actions**: a worker can **end the shift** ("Završi smenu") and stay in the app, and **signing out** alone does **not** end the shift. This suits the daily two-worker rotation (e.g. 09:00–15:00 and 15:00–21:00), where the changeover is normally a **handover**.
- **Handover** is done via a **"switch worker"** ("Zameni radnika") action that re-authenticates the incoming worker (username + password), closes the outgoing worker's shift, and opens the incoming worker's — without fully logging out of the app.
- A **safety net** auto-closes any shift left open, **20 minutes after the gym's closing time** for that day — **Mon–Fri 21:00, Saturday 18:00, Sunday 16:00** — recording the end time as the actual closing time, so a forgotten logout never produces a bogus multi-hour shift. The worker's session is not disturbed.
- An Admin sees who worked, until when, and when the next shift started.
- Every record carries **who entered it**; edits to past days are restricted to Admins.

### 3.13 Expiry notifications
- **Visual only** in v1: red "istekla članarina" on the dashboard + a **"soon to expire"** list for members whose membership expires in **≤ 3 days**.

### 3.14 Offline operation
- Internet is mostly stable but occasionally drops.
- Must work offline: **daily check-in** and **payment**.
- On reconnection, data **synchronizes** automatically.
- Creating new members / edits may **wait for connectivity** (outside the mandatory offline scope). A member created offline gets a **temporary "pending" number** and is assigned the next real member number on sync (in sync order).

### 3.15 Backup
- **Automatic export to a local USB drive 3× per day** (the counter computer must be on).
- Data also stays in the cloud (an additional safety layer).
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
- **Reliability/offline**: offline check-in and payment with sync on reconnect; never lose entries.
- **Security**: role separation (User/Admin); only Admins manage accounts and view monthly/yearly takings and shifts.
- **Audit**: every record carries who entered it; edits to past days are Admin-only.
- **Localization**: Serbian latinica; currency RSD; time Europe/Belgrade; day resets at midnight.
- **Device/browser**: optimized for one counter (desktop). Target browsers: **Chrome/Edge (primary, installable app)** and **Firefox (supported in-browser; offline works, not installable as an app)**.

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
- Login: username + password (case-insensitive); min. 2 Admins manage accounts (no hard enforcement of the minimum). Disabled accounts cannot log in; basic lockout after repeated failed attempts (≥5 in 15 min).
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
- Soft delete of members (Admin can restore); member number permanent and never reused; archiving blocked while owed sessions are unsettled.
- User edits all member data, but daily logs only for today; Admin all days.
- Voiding a payment reverts the linked membership change; takings show the net total.
- Takings: User daily; Admin daily/monthly/yearly; Admin-only export on demand.
- Notifications visual only; "soon to expire" threshold 3 days.
- Backup: automatic USB 3× daily + cloud copy.
- Phone required; family sharing allowed with a duplicate warning (not a hard unique rule).
