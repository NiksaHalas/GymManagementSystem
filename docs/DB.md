# DB — Database Schema

Version: 1.8
Date: 2026-06-18
Engine: **PostgreSQL (Supabase)**
Companion docs: `PRD.md` (product), `Tech.md` (architecture).

> v1.1 aligns this doc with the applied migrations in `supabase/migrations/` (UUID defaults, helper functions, the `handle_new_user` trigger, and the implemented RLS policies). Refinement deltas vs. v1.0 are called out inline.
> v1.2 adds the authentication-system artifacts: the `login_attempt` rate-limit table (§3.13) and the `pg_cron` shift auto-close job (§8). Migrations: `20260614142000_add_login_attempt_table`, `20260614142100_pgcron_shift_autoclose`.
> v1.3 replaces the `training_type` enum with a runtime-manageable `training_category` lookup table; `membership_type`, `checkin`, `session_log`, and `reserved_session` now reference `training_category_id`. Migration: `20260615120000_training_category_refactor`.
> v1.4 adds dashboard support: `checkin.is_group_fitpass`, soft-void columns, updated `checkin_open_key_idx`, and RPCs `create_checkin`, `void_checkin`, `capture_daily_price`. Migration: `20260615140000_dashboard_support` (applied to remote Supabase as `dashboard_support`, version `20260615192407`). Phone matching in `search_members` was briefly restored in v1.4 and removed again in `20260615200000_member_search_no_phone`; ambiguous 5-arg `match_phone` overload dropped in `20260615210000_search_members_single_overload`.
> v1.5 adds **Pazar / payment MVP**: `membership_status` value `zakazana` (pre-paid queued renewal), RPCs `record_payment`, `void_payment`, `offered_membership_price`, `promote_memberships()` + daily `pg_cron` job, and group Fitpass +300 RSD charged atomically in `create_checkin`. Migrations: `20260617100000_add_membership_status_zakazana`, `20260617100100_payment_rpcs`, `20260617100200_payment_pgcron`, `20260617100300_group_fitpass_surcharge`, `20260617100400_fix_payment_rpcs_reserved_session_columns`.
> v1.6 adds **shift lifecycle RPCs** `ensure_open_shift()` and `end_shift()` (migration `20260617100500_shift_rpcs`) and **login attempt cleanup** cron (migration `20260617100600_login_attempt_cleanup`).
> v1.7 adds **shift attribution**: `shift_id` + `waived_*` on `checkin`/`payment`, `shift_one_open_uidx`, pending partial indexes on `created_at`, RPCs `open_or_resume_shift()` / `handover_shift()` / INVOKER `end_shift()`; drops `ensure_open_shift()`. Migration: `20260617100700_shift_attribution`.
> v1.8 — **no schema change.** Records the **migration-ledger reconcile** (2026-06-18). Migrations had been applied via Supabase **MCP `apply_migration`**, which stamps the remote ledger with its own execution timestamp instead of the migration filename's — so the remote `supabase_migrations` ledger drifted from the repo files (mismatched versions, a duplicated `shift_attribution`, and a `login_attempt` table created outside the recorded ledger). The repo migration files remain the **source of truth** and were confirmed to cleanly rebuild the full schema (`supabase db reset`; `db diff --linked` showed only Supabase-managed noise — `pg_net`, default-privilege `anon` grants, migra function re-emission — **never apply the diff's `DROP EXTENSION pg_net` to remote**). The remote ledger was re-aligned **1:1** with the repo via `supabase migration repair`. Going forward prefer `supabase db push` over MCP to keep the ledger in sync. See `Tech.md` §9 (Deployment incidents & lessons).

This document defines the database schema for the Gym Management System. It follows the Supabase Postgres best-practices skill: lowercase `snake_case` identifiers, an index on every foreign key, partial/composite indexes for hot paths, and **RLS enabled and forced** on every table.

---

## 1. Conventions & decisions

- **Identifiers**: lowercase `snake_case`; tables are singular nouns.
- **Timestamps**: `timestamptz` everywhere (UTC). The **business day** is derived in `Europe/Belgrade` and stored as a `date` (`business_date`) on `checkin`/`payment` so day-grouping survives the midnight reset and offline sync.
- **Primary keys**:
  - **Reference/config tables** (`training_category`, `membership_type`, `price`, `gym_key`): `bigint generated always as identity` (sequential, compact). (`staff` is UUID, 1:1 with `auth.users`.)
  - **Operational tables that can be created offline** (`member`, `membership`, `checkin`, `payment`, `session_log`, `reserved_session`, `shift`): **UUID** primary keys. **Refinement (v1.1):** the server-side column default is **`gen_random_uuid()`** (UUIDv4), because the `pg_uuidv7` extension is **not available on Supabase**. Clients that create rows offline still generate a **client-side UUIDv7** (time-ordered, stable id before sync) and send it as the `id`, so sync stays an idempotent upsert by `id`; only the DB fallback default differs (UUIDv4 instead of v7).
- **Money**: integer RSD (`amount_rsd int`), no decimals.
- **Soft delete**: `member.archived` (history preserved). Member numbers are never reused.
- **Audit**: mutable rows carry `created_by` / `updated_by` (→ `staff.id`) and `created_at` / `updated_at`.
- **RLS**: `enable row level security` + `force row level security` on all tables. Helper functions (`security definer`, `set search_path = public`): `current_staff()` resolves the caller's `staff` row from `auth.uid()`, `is_admin()` checks the role, and `business_today()` (`search_path = ''`) returns the Europe/Belgrade business day used by same-day write rules. A `handle_new_user()` trigger on `auth.users` auto-creates the linked `staff` row. See §5 for the implemented policies.

### 1.1 Enumerated types
```sql
create type staff_role          as enum ('user', 'admin');
create type membership_status   as enum ('aktivna', 'istekla', 'pauzirana', 'zakazana');
create type membership_start_mode as enum ('payment', 'first_visit');
create type payment_kind        as enum ('membership', 'debt_settlement', 'fitpass_surcharge');
create type shift_end_reason    as enum ('logout', 'switch', 'auto_close', 'inactivity');
```

> Note on membership status: the **"no membership"** state is represented by the **absence** of an active `membership` row for the member (not an enum value). **`zakazana`** = pre-paid renewal queued while the member still has an `aktivna`/`pauzirana` membership; it is intentionally **outside** `membership_one_active_uidx` so one active + N queued rows can coexist.

---

## 2. Entity-relationship overview

```mermaid
erDiagram
    STAFF ||--o{ SHIFT : "works"
    STAFF ||--o{ CHECKIN : "recorded_by"
    STAFF ||--o{ PAYMENT : "took"
    STAFF ||--o{ SESSION_LOG : "trained_as_trainer"
    MEMBER ||--o{ MEMBERSHIP : "has"
    MEMBER ||--o{ CHECKIN : "attends"
    MEMBER ||--o{ PAYMENT : "pays"
    MEMBER ||--o{ SESSION_LOG : "sessions"
    MEMBER ||--o{ RESERVED_SESSION : "owes"
    MEMBERSHIP_TYPE ||--o{ PRICE : "priced_by"
    TRAINING_CATEGORY ||--o{ MEMBERSHIP_TYPE : "categorizes"
    TRAINING_CATEGORY ||--o{ CHECKIN : "typed"
    TRAINING_CATEGORY ||--o{ SESSION_LOG : "typed"
    TRAINING_CATEGORY ||--o{ RESERVED_SESSION : "typed"
    MEMBERSHIP_TYPE ||--o{ MEMBERSHIP : "defines"
    MEMBERSHIP ||--o{ PAYMENT : "settled_by"
    MEMBERSHIP ||--o{ SESSION_LOG : "consumes"
    GYM_KEY ||--o{ CHECKIN : "assigned"
    PAYMENT ||--o{ RESERVED_SESSION : "settles"
```

---

## 3. Tables

### 3.1 `staff`
Worker/Admin profile, 1:1 with `auth.users`. Trainers are staff.

```sql
create table staff (
  id             uuid primary key references auth.users (id) on delete restrict,
  username       text not null unique,
  role           staff_role not null default 'user',
  recovery_email text,                 -- set by Admin; used for password reset via Resend
  active         boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index staff_role_idx   on staff (role);
create index staff_active_idx on staff (active) where active;
```
- `username` is unique; login maps `username → <username>@gym.local` synthetic email for Supabase Auth.
- Minimum-2-Admins is an operational guideline (not DB-enforced), per product decision.

**Auto-provisioning of `staff` (refinement v1.1):** a trigger on `auth.users` creates the linked `staff` row on user creation, deriving `username` / `role` / `recovery_email` from the auth metadata (falling back to the email local-part for `username`). This lets accounts created later (Dashboard, app, or a seed script) link automatically.
```sql
create or replace function handle_new_user()
returns trigger language plpgsql
  security definer set search_path = public as $$
begin
  insert into public.staff (id, username, role, recovery_email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'username', split_part(new.email, '@', 1)),
    coalesce((new.raw_user_meta_data->>'role')::staff_role, 'user'),
    new.raw_user_meta_data->>'recovery_email'
  )
  on conflict (id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();
```

### 3.2 `shift`
Derived from login sessions; one row per worked shift.

```sql
create table shift (
  id          uuid primary key default gen_random_uuid(),
  staff_id    uuid not null references staff (id) on delete restrict,
  started_at  timestamptz not null default now(),
  ended_at    timestamptz,
  ended_reason shift_end_reason,
  created_at  timestamptz not null default now()
);

create index shift_staff_id_idx  on shift (staff_id);
create index shift_started_at_idx on shift (started_at);
create index shift_open_idx       on shift (staff_id) where ended_at is null;
create unique index shift_one_open_uidx on shift ((true)) where ended_at is null;
```
- Handover closes the open shift (`ended_reason = 'switch'`) and opens a new one.
- A `pg_cron` job auto-closes stale open shifts (`auto_close`) at the gym's closing time + 20 min — see §8.
- Admin **remote view-only** logins do not create a shift (the device is not the registered counter — see `Tech.md` §3/§5).
- **Shift lifecycle (implemented):** opens automatically on counter login; a worker may **end** it manually (`ended_reason = 'logout'`); plain **sign-out does NOT close** the shift (it stays open until ended, handed over, or auto-closed).
- **Counter workers** use RPCs **`open_or_resume_shift()`**, **`handover_shift()`**, **`end_shift()`** (migration `20260617100700_shift_attribution`; see §12). Active staff may SELECT the open shift via RLS policy `shift_select_open`; admins see all shifts via `shift_select`.

### 3.3 `member`
The virtual card. Soft-deletable; permanent member number.

```sql
create table member (
  id            uuid primary key default gen_random_uuid(),
  member_no     bigint,                -- null until assigned on sync; never reused (uniqueness via partial unique index below)
  first_name    text not null,
  last_name     text not null,
  phone         text not null,         -- required; NOT unique (family sharing allowed, soft warning in app)
  discount_flag boolean not null default false,  -- family/school; any worker may toggle
  comment       text,                  -- special needs; triggers popup at check-in/payment
  archived      boolean not null default false,
  archived_at   timestamptz,
  created_by    uuid references staff (id),
  created_at    timestamptz not null default now(),
  updated_by    uuid references staff (id),
  updated_at    timestamptz not null default now()
);

-- member_no is unique only when assigned
create unique index member_member_no_uidx on member (member_no) where member_no is not null;
create index member_created_by_idx on member (created_by);
create index member_updated_by_idx on member (updated_by);
create index member_active_idx     on member (archived) where not archived;
create index member_phone_idx      on member (phone);
-- fast search by name / surname (trigram or prefix); enable pg_trgm if using fuzzy search
create index member_name_idx       on member (lower(last_name), lower(first_name));
```

**Member number assignment (offline-safe):**
```sql
create sequence member_no_seq;

-- Assign the next permanent number when a member is finalized (on server-side sync/insert)
create or replace function assign_member_no()
returns trigger language plpgsql
  security definer set search_path = public as $$   -- refinement (v1.1): runs as owner so it can use the sequence regardless of caller role
begin
  if new.member_no is null then
    new.member_no := nextval('member_no_seq');
  end if;
  return new;
end $$;

create trigger member_assign_no
  before insert on member
  for each row execute function assign_member_no();
```
- Offline-created members are shown with a temporary "pending" number client-side; the real `member_no` is assigned on sync (in sync order). Numbers are never reused because they come from a monotonic sequence and archiving does not free them.

### 3.4 `training_category`
Runtime-manageable training categories (replaces the former `training_type` enum). Admins can add categories; seeded with the five original types.

```sql
create table training_category (
  id               bigint generated always as identity primary key,
  code             text not null unique,          -- stable slug, e.g. 'otvoreni'
  label            text not null,                 -- display label (Serbian)
  is_trainer_based boolean not null default false, -- deducts session + requires trainer at check-in
  per_trainee      boolean not null default false, -- duo pricing (price per trainee)
  active           boolean not null default true,
  sort_order       int not null default 0,
  updated_by       uuid references staff (id),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
```

Seeded rows: `otvoreni`/`kardio` (self-guided); `individualni`/`duo`/`vodjeni` (trainer-based); `duo` also has `per_trainee = true`.

### 3.5 `membership_type`
Catalog of training category + package combinations.

```sql
create table membership_type (
  id                   bigint generated always as identity primary key,
  training_category_id bigint not null references training_category (id) on delete restrict,
  package              text not null,          -- '1/1','8/1','10/1','12/1','16/1','30/1'
  label                text not null,          -- display label (Serbian)
  is_time_based        boolean not null,       -- true => unlimited visits within duration
  sessions             int,                    -- session count for session-based; null for time-based
  duration_days        int not null default 30,
  active               boolean not null default true,
  created_at           timestamptz not null default now(),
  unique (training_category_id, package)
);

create index membership_type_training_category_id_idx on membership_type (training_category_id);
create index membership_type_active_idx on membership_type (active) where active;
```
- `is_time_based = true`: Open type 30/1, Cardio 30/1, Open type discount 30/1.
- `is_time_based = false` (session-based, 30-day validity): all individual/duo/guided packages, daily 1/1, Open type 8/1 & 12/1.

### 3.6 `price`
Current price per membership type (no history in v1). A type may have a standard and a discount price.

```sql
create table price (
  id                 bigint generated always as identity primary key,
  membership_type_id bigint not null references membership_type (id) on delete cascade,
  amount_rsd         int not null check (amount_rsd > 0),
  is_discount_price  boolean not null default false,  -- family/school price (Open type only)
  active             boolean not null default true,
  updated_by         uuid references staff (id),
  updated_at         timestamptz not null default now(),
  unique (membership_type_id, is_discount_price)
);

create index price_membership_type_id_idx on price (membership_type_id);
create index price_updated_by_idx          on price (updated_by);
```

### 3.7 `membership`
A member's membership period. One active/paused at a time.

```sql
create table membership (
  id                 uuid primary key default gen_random_uuid(),
  member_id          uuid not null references member (id) on delete restrict,
  membership_type_id bigint not null references membership_type (id) on delete restrict,
  start_mode         membership_start_mode not null default 'payment',
  start_date         date,              -- null until first visit when start_mode='first_visit'
  end_date           date,
  sessions_total     int,               -- null for time-based
  sessions_left      int,               -- null for time-based
  status             membership_status not null default 'aktivna',
  paused_days        int not null default 0,
  paused_at          timestamptz,       -- set while paused
  created_by         uuid references staff (id),
  created_at         timestamptz not null default now(),
  updated_by         uuid references staff (id),
  updated_at         timestamptz not null default now(),
  check (sessions_left is null or sessions_left >= 0)
);

create index membership_member_id_idx        on membership (member_id);
create index membership_membership_type_id_idx on membership (membership_type_id);
create index membership_created_by_idx        on membership (created_by);
create index membership_end_date_idx          on membership (end_date);   -- soon-to-expire queries
-- enforce a single active/paused membership per member (zakazana is excluded)
create unique index membership_one_active_uidx
  on membership (member_id)
  where status in ('aktivna', 'pauzirana');
```
- **Start from first visit**: `start_date` is set on the member's first check-in; `end_date` is computed from it. Not combined with `zakazana` (queued renewals always use `start_mode='payment'`).
- **Pause/resume**: pausing sets `status='pauzirana'` and records `paused_at`; resuming adds the elapsed paused days to `paused_days` and **extends `end_date`** by that amount. No pause limit.
- **Expiry**: `promote_memberships()` (§8.2) flips `aktivna → istekla` when `end_date < business_today()` or session-based packages have `sessions_left <= 0`. Remaining sessions may still be used after expiry via override.
- **Renewal while still active**: payment creates a new row with `status='zakazana'`; when the current membership ends, `promote_memberships()` promotes the oldest queued row to `aktivna` with fresh dates.
- **Renewal with no active membership**: payment creates `status='aktivna'` immediately (`start_mode='payment'` or `'first_visit'`).

### 3.8 `payment`
Cash payments. `member_id` is null for anonymous Fitpass.

```sql
create table payment (
  id                 uuid primary key default gen_random_uuid(),
  member_id          uuid references member (id) on delete restrict,      -- null = Fitpass
  staff_id           uuid not null references staff (id) on delete restrict,
  shift_id           uuid references shift (id) on delete set null,       -- nullable pending attribution
  membership_type_id bigint references membership_type (id) on delete restrict,
  membership_id      uuid references membership (id) on delete set null,  -- created/extended membership (for revert)
  kind               payment_kind not null default 'membership',
  amount_rsd         int not null check (amount_rsd >= 0),                 -- 0 allowed for non-group Fitpass check-in record
  is_custom_price    boolean not null default false,                      -- custom must be < standard and > 0
  custom_reason      text,                                                -- optional note
  is_fitpass         boolean not null default false,
  business_date      date not null,                                       -- Europe/Belgrade day
  paid_at            timestamptz not null default now(),
  voided             boolean not null default false,
  voided_by          uuid references staff (id),
  voided_at          timestamptz,
  void_reason        text,
  waived_at          timestamptz,                                         -- admin resolved gap without shift
  waived_by          uuid references staff (id),
  created_by         uuid references staff (id),
  created_at         timestamptz not null default now(),
  updated_by         uuid references staff (id),
  updated_at         timestamptz not null default now()
);

create index payment_member_id_idx          on payment (member_id);
create index payment_staff_id_idx            on payment (staff_id);
create index payment_membership_type_id_idx  on payment (membership_type_id);
create index payment_membership_id_idx       on payment (membership_id);
create index payment_created_by_idx          on payment (created_by);
create index payment_voided_by_idx           on payment (voided_by);
-- daily/monthly/yearly takings: scan by business_date, exclude voided
create index payment_shift_id_idx            on payment (shift_id);
create index payment_pending_attribution_idx on payment (created_at)
  where shift_id is null and waived_at is null;
```
- **Takings ("pazar")** = sum of `amount_rsd` grouped by `business_date` where `not voided` (net total).
- **`kind='membership'`** — creates or queues a `membership` row; links `membership_id` for revert on void.
- **`kind='debt_settlement'`** — one payment row **per** unsettled `reserved_session`; links via `reserved_session.settled_payment_id`.
- **`kind='fitpass_surcharge'`** — anonymous group Fitpass +300 RSD; `member_id` null, `is_fitpass=true`.
- **Void** sets `voided=true` (kept in history). `void_payment` RPC reverts: unsettles linked debts; deletes unused `membership` rows (blocks if check-ins/session_log exist).
- **Custom price** enforced in RPC: `0 < amount_rsd < offered price` when `is_custom_price=true`; offered price uses discount row when `member.discount_flag` + `otvoreni` category.
- **Supabase embeds**: `payment` has four FKs to `staff` (`staff_id`, `created_by`, `voided_by`, `updated_by`). Join the cashier as `staff!payment_staff_id_fkey`.

### 3.9 `checkin`
Daily arrivals. `member_id` null = Fitpass. Determines key occupancy.

```sql
create table checkin (
  id                  uuid primary key default gen_random_uuid(),
  member_id           uuid references member (id) on delete restrict,     -- null = Fitpass
  staff_id            uuid not null references staff (id) on delete restrict,
  shift_id            uuid references shift (id) on delete set null,
  membership_id       uuid references membership (id) on delete set null,
  key_no              int references gym_key (key_no),                    -- nullable: allowed when all keys taken
  with_trainer          boolean not null default false,
  training_category_id  bigint references training_category (id),         -- set when with_trainer
  trainer_id            uuid references staff (id),                         -- set when with_trainer
  decremented_session boolean not null default false,
  is_fitpass          boolean not null default false,
  is_group_fitpass    boolean not null default false,   -- group Fitpass (+300 RSD via payment in create_checkin)
  key_returned        boolean not null default false,                     -- "otišao" sets true
  checked_out_at      timestamptz,
  voided              boolean not null default false,   -- soft void (worker today / admin any day via void_checkin RPC)
  voided_at           timestamptz,
  voided_by           uuid references staff (id),
  waived_at           timestamptz,
  waived_by           uuid references staff (id),
  business_date       date not null,                                      -- Europe/Belgrade day
  created_at          timestamptz not null default now(),
  created_by          uuid references staff (id),
  updated_by          uuid references staff (id),
  updated_at          timestamptz not null default now(),
  check (not with_trainer or (training_category_id is not null and trainer_id is not null)),
  check (is_fitpass or member_id is not null),                            -- member required unless Fitpass
  check (not is_fitpass or key_no is not null),                            -- Fitpass requires a key
  check (not is_group_fitpass or is_fitpass)
);

create index checkin_member_id_idx    on checkin (member_id);
create index checkin_staff_id_idx      on checkin (staff_id);
create index checkin_shift_id_idx      on checkin (shift_id);
create index checkin_pending_attribution_idx on checkin (created_at)
  where shift_id is null and waived_at is null;
create index checkin_trainer_id_idx    on checkin (trainer_id);
create index checkin_membership_id_idx on checkin (membership_id);
create index checkin_key_no_idx        on checkin (key_no);
create index checkin_created_by_idx    on checkin (created_by);
create index checkin_business_date_idx on checkin (business_date);
create index checkin_voided_by_idx     on checkin (voided_by);
-- currently-out keys (occupancy) and last holder of a key
create index checkin_open_key_idx      on checkin (key_no, created_at desc) where not key_returned and not voided;
```
- **Key occupancy**: keys with an open (`not key_returned`) check-in for the current business day.
- **Shared keys**: multiple open check-ins may reference the same `key_no`; the **latest assignment** (max `created_at`) is treated as the current/last holder. **Key search** returns the last member who held the key.
- **"Otišao"** sets `key_returned=true`, `checked_out_at=now()`.
- **End of day**: keys still open at midnight are surfaced in a next-day report (they stay `key_returned=false`).
- **Duo**: two independent check-ins (no linkage). **Guided/group**: one check-in per participant; same `trainer_id`.
- **Void**: `void_checkin(uuid)` RPC (security definer) sets `voided=true`, restores decremented sessions, deletes linked `session_log` / unsettled `reserved_session`, and may revert `first_visit` membership activation. Workers: same business day only; admins: any day.
- **Create**: `create_checkin(...)` RPC atomically inserts the row, handles trainer session deduction / reserved debt, and activates `first_visit` memberships on first check-in.

### 3.10 `session_log`
History of consumed trainer sessions (dates on the card).

```sql
create table session_log (
  id            uuid primary key default gen_random_uuid(),
  member_id     uuid not null references member (id) on delete restrict,
  membership_id uuid references membership (id) on delete set null,
  checkin_id    uuid references checkin (id) on delete set null,
  trainer_id    uuid references staff (id),
  training_category_id bigint not null references training_category (id),
  session_date  date not null,
  created_at    timestamptz not null default now()
);

create index session_log_member_id_idx     on session_log (member_id);
create index session_log_membership_id_idx  on session_log (membership_id);
create index session_log_checkin_id_idx     on session_log (checkin_id);
create index session_log_trainer_id_idx     on session_log (trainer_id);
```

### 3.11 `reserved_session`
Owed (reserved) trainer sessions when the member had 0 sessions.

```sql
create table reserved_session (
  id                  uuid primary key default gen_random_uuid(),
  member_id           uuid not null references member (id) on delete restrict,
  checkin_id          uuid references checkin (id) on delete set null,
  training_category_id bigint not null references training_category (id),
  session_date        date not null,
  amount_rsd          int not null check (amount_rsd > 0),  -- daily price CAPTURED at incur time
  settled             boolean not null default false,
  settled_payment_id  uuid references payment (id) on delete set null,
  settled_at          timestamptz,
  created_by          uuid references staff (id),
  created_at          timestamptz not null default now()
);

create index reserved_session_member_id_idx   on reserved_session (member_id);
create index reserved_session_checkin_id_idx   on reserved_session (checkin_id);
create index reserved_session_payment_idx      on reserved_session (settled_payment_id);
create index reserved_session_created_by_idx   on reserved_session (created_by);
create index reserved_session_unsettled_idx    on reserved_session (member_id) where not settled;
```
- The owed amount is the **captured daily price** at the time the debt was incurred (immune to later price changes).
- The system **warns after 3** unsettled rows; archiving a member is **blocked** while unsettled rows exist.
- Settled at next payment → `settled=true`, links `settled_payment_id`.

### 3.12 `gym_key`
The 22 physical keys (seeded reference data).

```sql
create table gym_key (
  key_no int primary key check (key_no between 1 and 22),
  active boolean not null default true
);

-- seed
insert into gym_key (key_no)
select generate_series(1, 22);
```
- Current/last holder is **derived from `checkin`** (latest assignment), not stored here.

### 3.13 `login_attempt`
Rate-limiting ledger for failed logins. Written/read **only by the service-role client** (the login server action), never by the browser.

```sql
create table login_attempt (
  id            bigint generated always as identity primary key,
  attempt_key   text not null,     -- "login:<username>:<ip>"
  attempted_at  timestamptz not null default now()
);

create index login_attempt_key_at_idx on login_attempt (attempt_key, attempted_at);

-- Only the service role touches this table
revoke all on login_attempt from anon, authenticated;
grant all on login_attempt to service_role;

alter table login_attempt enable row level security;
alter table login_attempt force row level security;
```
- The login action records one row per failed attempt keyed by `username + IP`. Login is blocked when **≥ 5 failed attempts** fall within a **15-minute** window; successful login clears the rows for that key.
- RLS is `enable`d + `force`d with **no policies** by design — `anon`/`authenticated` are revoked, and `service_role` bypasses RLS. (Supabase's linter flags this as INFO `rls_enabled_no_policy`, which is expected here.)

---

## 4. Seed data

### 4.1 Training categories (seed)
| code | label | is_trainer_based | per_trainee |
|---|---|---|---|
| otvoreni | Otvoreni tip | false | false |
| kardio | Kardio | false | false |
| individualni | Individualni | true | false |
| duo | Duo | true | true |
| vodjeni | Vođeni | true | false |

### 4.2 Membership types
| category (code) | package | is_time_based | sessions | label |
|---|---|---|---|---|
| individualni | 1/1 | false | 1 | Individualni 1/1 (dnevna) |
| individualni | 8/1 | false | 8 | Individualni 8/1 |
| individualni | 10/1 | false | 10 | Individualni 10/1 |
| individualni | 12/1 | false | 12 | Individualni 12/1 |
| duo | 1/1 | false | 1 | Duo 1/1 (dnevna) |
| duo | 8/1 | false | 8 | Duo 8/1 |
| duo | 10/1 | false | 10 | Duo 10/1 |
| duo | 12/1 | false | 12 | Duo 12/1 |
| vodjeni | 1/1 | false | 1 | Vođeni 1/1 (dnevna) |
| vodjeni | 8/1 | false | 8 | Vođeni 8/1 |
| vodjeni | 10/1 | false | 10 | Vođeni 10/1 |
| vodjeni | 12/1 | false | 12 | Vođeni 12/1 |
| vodjeni | 16/1 | false | 16 | Vođeni 16/1 |
| otvoreni | 1/1 | false | 1 | Otvoreni tip 1/1 (dnevna) |
| otvoreni | 8/1 | false | 8 | Otvoreni tip 8/1 |
| otvoreni | 12/1 | false | 12 | Otvoreni tip 12/1 |
| otvoreni | 30/1 | true | null | Otvoreni tip 30/1 (mesečna) |
| kardio | 30/1 | true | null | Kardio 30/1 (mesečna) |

### 4.3 Prices (RSD)
| type / package | standard | discount (Open type only) |
|---|---|---|
| individualni 1/1 | 1,200 | — |
| individualni 8/1 | 8,800 | — |
| individualni 10/1 | 9,800 | — |
| individualni 12/1 | 11,800 | — |
| duo 1/1 | 1,000 | — |
| duo 8/1 | 6,800 | — |
| duo 10/1 | 7,800 | — |
| duo 12/1 | 8,800 | — |
| vodjeni 1/1 | 1,000 | — |
| vodjeni 8/1 | 3,600 | — |
| vodjeni 10/1 | 4,100 | — |
| vodjeni 12/1 | 4,600 | — |
| vodjeni 16/1 | 5,100 | — |
| otvoreni 1/1 | 450 | — |
| otvoreni 8/1 | 2,600 | — |
| otvoreni 12/1 | 2,800 | 2,500 |
| otvoreni 30/1 | 3,200 | 2,700 |
| kardio 30/1 | 2,600 | — |

> The **Fitpass group surcharge (+300)** is recorded directly on `payment` (`is_fitpass=true`, `kind='fitpass_surcharge'`), not as a `membership_type`.

---

## 5. Row-Level Security (implemented)

RLS is `enable`d + `force`d on every table. Helper functions are `security definer` so they can read `staff` inside policies without recursion (the `postgres` owner has `BYPASSRLS`), with a pinned `search_path`:

```sql
create or replace function current_staff()
returns staff language sql stable
  security definer set search_path = public as $$
  select * from staff where id = auth.uid();
$$;

create or replace function is_admin()
returns boolean language sql stable
  security definer set search_path = public as $$
  select exists (select 1 from staff where id = auth.uid() and role = 'admin' and active);
$$;

-- business day in Europe/Belgrade, used by the same-day write rules
create or replace function business_today()
returns date language sql stable set search_path = '' as $$
  select (now() at time zone 'Europe/Belgrade')::date;
$$;
```

Policy intent (per `PRD.md` §2):

| Table | User (front desk) | Admin |
|---|---|---|
| `member` | select/insert/update (any member, anytime) | full |
| `membership_type`, `training_category` | read | read |
| `membership_type`, `training_category`, `price` write | — | full |
| `checkin`, `payment` insert | yes | yes |
| `checkin`, `payment` update/void | **only where `business_date = today`** (Europe/Belgrade) | any day |
| `payment` monthly/yearly aggregates | **today-and-back daily only** | full |
| `shift` | no read | read |
| `staff` (accounts) | read self | full (create/disable/reset) |
| `membership_type` | read | full |
| `training_category` | read | full |

### 5.1 Implemented policies
All policies target the `authenticated` role (`anon` has no table grants):

| Table | SELECT `using` | INSERT `with check` | UPDATE `using` / `with check` | DELETE `using` |
|---|---|---|---|---|
| `staff` | `id = auth.uid() or is_admin()` | `is_admin()` | `is_admin()` / `is_admin()` | `is_admin()` |
| `shift` | `is_admin()` | `staff_id = auth.uid() or is_admin()` | `staff_id = auth.uid() or is_admin()` (both) | — |
| `member` | `true` | `created_by = auth.uid()` | `true` / `updated_by = auth.uid()` | `is_admin()` |
| `membership` | `true` | `created_by = auth.uid()` | `true` / `updated_by = auth.uid()` | `is_admin()` |
| `membership_type` | `true` | `is_admin()` | `is_admin()` / `is_admin()` | `is_admin()` |
| `training_category` | `true` | `is_admin()` | `is_admin()` / `is_admin()` | `is_admin()` |
| `price` | `true` | `is_admin()` | `is_admin()` / `is_admin()` | `is_admin()` |
| `gym_key` | `true` | `is_admin()` | `is_admin()` / `is_admin()` | `is_admin()` |
| `payment` | `true` | `staff_id = auth.uid()` | `is_admin() or business_date = business_today()` (both) | `is_admin()` |
| `checkin` | `true` | `staff_id = auth.uid()` | `is_admin() or business_date = business_today()` (both) | `is_admin()` |
| `session_log` | `true` | `true` | `is_admin()` / `is_admin()` | `is_admin()` |
| `reserved_session` | `true` | `created_by = auth.uid()` | `true` / `true` | `is_admin()` |

### 5.2 Notes
- **Actor binding (audit):** INSERT/UPDATE on operational tables enforce that the acting column equals `auth.uid()` — `created_by` (`member`, `membership`, `reserved_session`), `staff_id` (`payment`, `checkin`), `updated_by` (`member`/`membership` update). **Server actions using the `authenticated` (cookie) client MUST set these columns to the signed-in user, or the write is rejected by RLS.** Server-side code using the `service_role` key bypasses RLS.
- **Same-day rule for Users** on `payment`/`checkin` UPDATE: `business_date = business_today()` (Europe/Belgrade); Admins may edit any day.
- **Two intentional exceptions** (flagged WARN by Supabase's linter, accepted): `session_log_insert` and `reserved_session_update` use `with check (true)` because the schema has no actor column to bind to — `session_log` has no `created_by`, and a `reserved_session` is settled by whichever worker takes the next payment (not the creator). These rely on app-level checks. To close them at the DB level we would add `recorded_by` to `session_log` and `settled_by` to `reserved_session`.
- **Privileges:** `authenticated` and `service_role` are granted `select, insert, update, delete` on all tables (RLS is the real filter); `anon` is granted none. Helper functions have `execute` revoked from `anon`; trigger functions (`assign_member_no`, `handle_new_user`) additionally have it revoked from `authenticated` (triggers fire regardless of `execute` grants).
- **Auto-enable safety net:** a pre-existing project-level event trigger (`ensure_rls` → `rls_auto_enable()`) auto-enables RLS on any new `public` table; migrations additionally `force` it.

---

## 6. Notes on offline & sync (DB-side)
- UUID PKs let the client create `member`/`checkin`/`payment` rows offline with final IDs; sync is an **idempotent upsert by `id`**. Offline clients send their own **client-side UUIDv7**; the DB column default is `gen_random_uuid()` (UUIDv4) only as a server-side fallback (see §1).
- `business_date` is set at creation time (device clock, Europe/Belgrade) so offline rows land on the correct day.
- `member_no` is intentionally **nullable** and assigned server-side via `member_no_seq` so offline members never collide and numbers are never reused.
- Mostly-additive writes (new check-ins/payments) keep conflicts rare; edits use last-write-wins by `updated_at`, with same-day-only restrictions for Users enforced by RLS.

---

## 7. Index summary (hot paths)
- Member search: `member_name_idx`, `member_phone_idx`, `member_member_no_uidx`, plus trigram GIN (`member_first_name_trgm_idx`, `member_last_name_trgm_idx`) for fuzzy name search (§9).
- Dashboard (day): `checkin_business_date_idx`, `checkin_open_key_idx` (partial: open + not voided), `checkin_voided_by_idx`.
- Takings: `payment_business_date_idx` (partial, excludes voided).
- Soon-to-expire: `membership_end_date_idx`.
- One-active-membership guarantee: `membership_one_active_uidx` (partial unique).
- Unsettled debt lookups / archive block: `reserved_session_unsettled_idx`.
- Login rate limiting: `login_attempt_key_at_idx`.
- Every foreign key column is indexed (see each table).

---

## 8. Scheduled jobs (`pg_cron`)

The `pg_cron` extension is enabled (`create extension if not exists pg_cron schema cron;`). Three jobs are registered.

### 8.1 Shift auto-close safety net
`auto_close_shifts()` closes any still-open shift after the gym's **closing time + 20-minute grace**, stamping `ended_at` to the **actual closing time** (not "now") and `ended_reason = 'auto_close'`. It does **not** touch auth sessions, so a logged-in worker stays signed in.

Closing times (Europe/Belgrade):

| Day | Closing | Auto-close fires from |
|---|---|---|
| Mon–Fri | 21:00 | 21:20 |
| Saturday | 18:00 | 18:20 |
| Sunday | 16:00 | 16:20 |

```sql
create or replace function public.auto_close_shifts()
returns void language plpgsql
  security definer set search_path = public as $$
declare
  belgrade_now  timestamptz := now() at time zone 'Europe/Belgrade';
  belgrade_date date        := belgrade_now::date;
  dow           int         := extract(isodow from belgrade_now); -- 1=Mon..7=Sun
  close_time    time;
  close_instant timestamptz;
begin
  if    dow between 1 and 5 then close_time := '21:00';
  elsif dow = 6            then close_time := '18:00';
  else                          close_time := '16:00';
  end if;

  close_instant := (belgrade_date + close_time) at time zone 'Europe/Belgrade';
  if now() < close_instant + interval '20 minutes' then
    return;  -- grace period not elapsed
  end if;

  update public.shift
     set ended_at = greatest(close_instant, started_at),
         ended_reason = 'auto_close'
   where ended_at is null;
end $$;

revoke execute on function public.auto_close_shifts() from public, anon, authenticated;
grant  execute on function public.auto_close_shifts() to service_role;

-- Runs every 10 min, 14:00–20:00 UTC (covers all three Belgrade triggers across CET/CEST);
-- the function gates internally on local time, so frequent runs are safe.
select cron.schedule('auto-close-shifts', '*/10 14-20 * * *',
  $$ select public.auto_close_shifts(); $$);
```
- **DST-proof:** the schedule window is in UTC but the closing logic is computed in `Europe/Belgrade` inside the function, so it stays correct across CET/CEST.
- `EXECUTE` is revoked from `public`/`anon`/`authenticated` so the `SECURITY DEFINER` function is not a public RPC endpoint.

### 8.2 Membership expiry & queued renewal promotion
Migration `20260617100200_payment_pgcron`. `promote_memberships()` runs daily at **01:05 UTC** (`cron.schedule('promote-memberships', '5 1 * * *', …)`); gates on `business_today()`.

1. **Expire** — `update membership set status='istekla'` where `status='aktivna'` and (`end_date < business_today()` OR session-based with `sessions_left <= 0`). Skips `pauzirana`.
2. **Promote** — for members with no `aktivna`/`pauzirana` row, promote the **oldest** `zakazana` (`distinct on (member_id) … order by created_at asc`) to `aktivna` with `start_date = business_today()` and `end_date = start + duration_days - 1`.

`EXECUTE` granted to `service_role` only (same pattern as `auto_close_shifts`).

### 8.3 Login attempt cleanup
Migration `20260617100600_login_attempt_cleanup`. `cleanup_login_attempts()` deletes rows older than **15 minutes** (matching the rate-limit sliding window). Scheduled every **15 minutes** via `cron.schedule('cleanup-login-attempts', '*/15 * * * *', …)`. `EXECUTE` granted to `service_role` only.

---

## 9. Member search (`pg_trgm`)

The Members page and dashboard check-in search use fuzzy search over **name / surname / member number** (phone is displayed but not searchable). Migrations: `20260614150000_member_search`, `20260614151000_harden_member_search`, `20260614152000_member_search_drop_phone`, `20260615200000_member_search_no_phone`, `20260615210000_search_members_single_overload`.

- Enables `pg_trgm` (in the `extensions` schema) and adds trigram GIN indexes on `member.first_name`, `member.last_name` (used by `ILIKE`/`similarity`).
- `search_members(q text, include_archived boolean, lim int, off int)` (`security invoker`, `search_path = public, extensions`) returns paginated member rows enriched with the single active/paused membership summary (`status`, `label`, `end_date`, `sessions_left`, `is_time_based`) plus a `total_count` for pagination.
  - Empty `q` → browse all active (or all when `include_archived`) ordered by `lower(last_name), lower(first_name)`.
  - Non-empty `q` → name match via `ILIKE` + `similarity` ordering; digit-normalized prefix match on `member_no`. **Phone is not searchable.**
- `EXECUTE` granted to `authenticated`, revoked from `anon`/`public`.

---

## 10. Dashboard RPC functions

Migration `20260615140000_dashboard_support`. All three are **`security definer`** with `set search_path = public`; `EXECUTE` granted to `authenticated` only.

### 10.1 `capture_daily_price(p_training_category_id bigint) → int`
Returns the standard (non-discount) daily price for a training category: the active `price.amount_rsd` of the **`sessions = 1`** package for that category. Used when creating a **reserved (owed) session** at check-in with 0 sessions left.

### 10.2 `create_checkin(...) → uuid`
Atomically inserts a `checkin` row and applies side effects:

| Parameter | Notes |
|---|---|
| `p_member_id` | Required unless Fitpass |
| `p_key_no` | Optional for members (all keys taken); **required for Fitpass** |
| `p_with_trainer` | When true, requires `p_training_category_id` + `p_trainer_id` (trainer-based category) |
| `p_is_fitpass` / `p_is_group_fitpass` | Anonymous Fitpass; group flag inserts immediate `payment` `kind='fitpass_surcharge'` (+300 RSD) |
| `p_business_date` | Defaults to `business_today()` |

**Side effects** (when applicable):
- Trainer session + sessions left > 0 → decrement `membership.sessions_left`, insert `session_log`, set `decremented_session = true`.
- Trainer session + 0 sessions → insert `reserved_session` with `amount_rsd = capture_daily_price(...)`.
- `start_mode = 'first_visit'` + first check-in → set `start_date` / `end_date` on membership.
- Group Fitpass (`p_is_fitpass and p_is_group_fitpass`) → insert `payment` (+300 RSD, `member_id` null).
- Validates: active member, valid key, active trainer, category is trainer-based.

### 10.3 `void_checkin(p_checkin_id uuid) → void`
Soft-voids a check-in (`voided = true`, audit columns). **Workers**: same business day only; **admins**: any day (via `is_admin()`).

**Reverts**:
- Restores +1 session if `decremented_session`.
- Deletes linked `session_log` and unsettled `reserved_session`.
- May clear `first_visit` activation if this was the member's only non-voided check-in.

Voided rows are excluded from day lists and from `checkin_open_key_idx` (key occupancy).

---

## 11. Payment RPC functions

Migrations `20260617100100_payment_rpcs`, `20260617100400_fix_payment_rpcs_reserved_session_columns`. All are **`security definer`** with `set search_path = public`; `EXECUTE` granted to `authenticated` only (except `promote_memberships`, §8.2).

### 11.1 `offered_membership_price(p_membership_type_id, p_member_id) → int`
Returns the price to charge for a membership type: standard active `price` row, or the discount row when `member.discount_flag` and the type's category code is `otvoreni`.

### 11.2 `record_payment(...) → uuid`
Atomically records cash payment(s). Returns the primary payment id (membership payment, or first debt-settlement id when debt-only).

| Parameter | Notes |
|---|---|
| `p_member_id` | Required |
| `p_membership_type_id` | Null = skip membership (debt-only allowed) |
| `p_amount_rsd` / `p_is_custom_price` / `p_custom_reason` | Membership amount; custom must be `0 < amount < offered` |
| `p_start_mode` | `'payment'` or `'first_visit'` when no active membership; ignored for `zakazana` |
| `p_settle_reserved_ids` | UUID[] of unsettled `reserved_session` rows to settle (one `debt_settlement` payment each) |
| `p_checkin_id` | Optional logical link (does not mutate check-in) |
| `p_business_date` | Defaults to `business_today()` |

**Side effects**:
- Membership payment + no active/paused membership → insert `membership` `status='aktivna'`.
- Membership payment + active/paused exists → insert `membership` `status='zakazana'`, `start_mode='payment'`.
- Each settled debt → insert `payment` `kind='debt_settlement'`, mark `reserved_session.settled=true`.

### 11.3 `void_payment(p_payment_id, p_reason) → void`
Soft-voids a payment. **Workers**: same business day only; **admins**: any day. Reason required.

**Reverts**:
- `debt_settlement` → unsettle linked `reserved_session`.
- `membership` with unused linked membership → `delete from membership` (raises if check-ins or `session_log` exist).

---

## 12. Shift RPC functions

Migration `20260617100700_shift_attribution` (replaces `20260617100500` handover-on-login model). `EXECUTE` granted to **`authenticated`** only.

Counter-device binding (`gym_counter` cookie) is enforced in the app layer (`lib/shifts/actions.ts`), not inside these RPCs.

### 12.1 `open_or_resume_shift() → text`
**SECURITY INVOKER.** Returns `'opened' | 'resumed' | 'foreign_shift_open'`.

| State | Action |
|---|---|
| No open shift | INSERT; return `'opened'` |
| Same worker open | return `'resumed'` (no-op) |
| Different worker open | return `'foreign_shift_open'` (no close — fail-open) |
| Concurrent INSERT (`unique_violation` on `shift_one_open_uidx`) | Re-SELECT open shift; return `'resumed'` or `'foreign_shift_open'` |

### 12.2 `handover_shift() → void`
**SECURITY DEFINER.** Atomically: `SELECT … FOR UPDATE` on open shift → close other worker (`ended_reason = 'switch'`) → INSERT new shift for `auth.uid()`. Same worker already open → no-op.

### 12.3 `end_shift() → void`
**SECURITY INVOKER.** Closes authenticated worker's open shift (`ended_reason = 'logout'`). Does **not** sign out of Supabase Auth.

### 12.4 Shift attribution on writes
`create_checkin` and `record_payment` set `shift_id` from `SELECT id FROM shift WHERE ended_at IS NULL AND staff_id = auth.uid()` (nullable if none). Pending rows: `shift_id IS NULL AND waived_at IS NULL`. Admin reconcile sets `shift_id` or `waived_at`/`waived_by`.

**Indexes:** `shift_one_open_uidx` (max one open shift globally); `checkin_pending_attribution_idx` / `payment_pending_attribution_idx` on `(created_at) WHERE shift_id IS NULL AND waived_at IS NULL`.

**Launch cutoff:** env `SHIFT_ATTRIBUTION_LAUNCH_AT` (default `2026-06-17T10:07:00+00`) — badge excludes historical NULL rows.
