-- staff: worker/admin profile, 1:1 with auth.users
create table staff (
  id             uuid primary key references auth.users (id) on delete restrict,
  username       text not null unique,
  role           staff_role not null default 'user',
  recovery_email text,
  active         boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index staff_role_idx   on staff (role);
create index staff_active_idx on staff (active) where active;

-- shift: one row per worked shift
create table shift (
  id           uuid primary key default gen_random_uuid(),
  staff_id     uuid not null references staff (id) on delete restrict,
  started_at   timestamptz not null default now(),
  ended_at     timestamptz,
  ended_reason shift_end_reason,
  created_at   timestamptz not null default now()
);
create index shift_staff_id_idx   on shift (staff_id);
create index shift_started_at_idx on shift (started_at);
create index shift_open_idx       on shift (staff_id) where ended_at is null;

-- member: the virtual card
create table member (
  id            uuid primary key default gen_random_uuid(),
  member_no     bigint,
  first_name    text not null,
  last_name     text not null,
  phone         text not null,
  discount_flag boolean not null default false,
  comment       text,
  archived      boolean not null default false,
  archived_at   timestamptz,
  created_by    uuid references staff (id),
  created_at    timestamptz not null default now(),
  updated_by    uuid references staff (id),
  updated_at    timestamptz not null default now()
);
create unique index member_member_no_uidx on member (member_no) where member_no is not null;
create index member_created_by_idx on member (created_by);
create index member_updated_by_idx on member (updated_by);
create index member_active_idx     on member (archived) where not archived;
create index member_phone_idx      on member (phone);
create index member_name_idx       on member (lower(last_name), lower(first_name));

-- membership_type: catalog of training type + package
create table membership_type (
  id            bigint generated always as identity primary key,
  training_type training_type not null,
  package       text not null,
  label         text not null,
  is_time_based boolean not null,
  sessions      int,
  duration_days int not null default 30,
  active        boolean not null default true,
  created_at    timestamptz not null default now(),
  unique (training_type, package)
);
create index membership_type_active_idx on membership_type (active) where active;

-- price: current price per membership type
create table price (
  id                 bigint generated always as identity primary key,
  membership_type_id bigint not null references membership_type (id) on delete cascade,
  amount_rsd         int not null check (amount_rsd > 0),
  is_discount_price  boolean not null default false,
  active             boolean not null default true,
  updated_by         uuid references staff (id),
  updated_at         timestamptz not null default now(),
  unique (membership_type_id, is_discount_price)
);
create index price_membership_type_id_idx on price (membership_type_id);
create index price_updated_by_idx          on price (updated_by);

-- membership: a member's membership period
create table membership (
  id                 uuid primary key default gen_random_uuid(),
  member_id          uuid not null references member (id) on delete restrict,
  membership_type_id bigint not null references membership_type (id) on delete restrict,
  start_mode         membership_start_mode not null default 'payment',
  start_date         date,
  end_date           date,
  sessions_total     int,
  sessions_left      int,
  status             membership_status not null default 'aktivna',
  paused_days        int not null default 0,
  paused_at          timestamptz,
  created_by         uuid references staff (id),
  created_at         timestamptz not null default now(),
  updated_by         uuid references staff (id),
  updated_at         timestamptz not null default now(),
  check (sessions_left is null or sessions_left >= 0)
);
create index membership_member_id_idx          on membership (member_id);
create index membership_membership_type_id_idx on membership (membership_type_id);
create index membership_created_by_idx         on membership (created_by);
create index membership_end_date_idx           on membership (end_date);
create unique index membership_one_active_uidx on membership (member_id) where status in ('aktivna', 'pauzirana');

-- gym_key: the 22 physical keys
create table gym_key (
  key_no int primary key check (key_no between 1 and 22),
  active boolean not null default true
);

-- payment: cash payments
create table payment (
  id                 uuid primary key default gen_random_uuid(),
  member_id          uuid references member (id) on delete restrict,
  staff_id           uuid not null references staff (id) on delete restrict,
  membership_type_id bigint references membership_type (id) on delete restrict,
  membership_id      uuid references membership (id) on delete set null,
  kind               payment_kind not null default 'membership',
  amount_rsd         int not null check (amount_rsd >= 0),
  is_custom_price    boolean not null default false,
  custom_reason      text,
  is_fitpass         boolean not null default false,
  business_date      date not null,
  paid_at            timestamptz not null default now(),
  voided             boolean not null default false,
  voided_by          uuid references staff (id),
  voided_at          timestamptz,
  void_reason        text,
  created_by         uuid references staff (id),
  created_at         timestamptz not null default now(),
  updated_by         uuid references staff (id),
  updated_at         timestamptz not null default now()
);
create index payment_member_id_idx         on payment (member_id);
create index payment_staff_id_idx           on payment (staff_id);
create index payment_membership_type_id_idx on payment (membership_type_id);
create index payment_membership_id_idx      on payment (membership_id);
create index payment_created_by_idx         on payment (created_by);
create index payment_voided_by_idx          on payment (voided_by);
create index payment_business_date_idx      on payment (business_date) where not voided;

-- checkin: daily arrivals
create table checkin (
  id                  uuid primary key default gen_random_uuid(),
  member_id           uuid references member (id) on delete restrict,
  staff_id            uuid not null references staff (id) on delete restrict,
  membership_id       uuid references membership (id) on delete set null,
  key_no              int references gym_key (key_no),
  with_trainer        boolean not null default false,
  training_type       training_type,
  trainer_id          uuid references staff (id),
  decremented_session boolean not null default false,
  is_fitpass          boolean not null default false,
  key_returned        boolean not null default false,
  checked_out_at      timestamptz,
  business_date       date not null,
  created_at          timestamptz not null default now(),
  created_by          uuid references staff (id),
  updated_by          uuid references staff (id),
  updated_at          timestamptz not null default now(),
  check (not with_trainer or (training_type is not null and trainer_id is not null)),
  check (is_fitpass or member_id is not null),
  check (not is_fitpass or key_no is not null)
);
create index checkin_member_id_idx    on checkin (member_id);
create index checkin_staff_id_idx      on checkin (staff_id);
create index checkin_trainer_id_idx    on checkin (trainer_id);
create index checkin_membership_id_idx on checkin (membership_id);
create index checkin_key_no_idx        on checkin (key_no);
create index checkin_created_by_idx    on checkin (created_by);
create index checkin_business_date_idx on checkin (business_date);
create index checkin_open_key_idx      on checkin (key_no, created_at desc) where not key_returned;

-- session_log: history of consumed trainer sessions
create table session_log (
  id            uuid primary key default gen_random_uuid(),
  member_id     uuid not null references member (id) on delete restrict,
  membership_id uuid references membership (id) on delete set null,
  checkin_id    uuid references checkin (id) on delete set null,
  trainer_id    uuid references staff (id),
  training_type training_type not null,
  session_date  date not null,
  created_at    timestamptz not null default now()
);
create index session_log_member_id_idx     on session_log (member_id);
create index session_log_membership_id_idx  on session_log (membership_id);
create index session_log_checkin_id_idx     on session_log (checkin_id);
create index session_log_trainer_id_idx     on session_log (trainer_id);

-- reserved_session: owed (reserved) trainer sessions
create table reserved_session (
  id                 uuid primary key default gen_random_uuid(),
  member_id          uuid not null references member (id) on delete restrict,
  checkin_id         uuid references checkin (id) on delete set null,
  training_type      training_type not null,
  session_date       date not null,
  amount_rsd         int not null check (amount_rsd > 0),
  settled            boolean not null default false,
  settled_payment_id uuid references payment (id) on delete set null,
  settled_at         timestamptz,
  created_by         uuid references staff (id),
  created_at         timestamptz not null default now()
);
create index reserved_session_member_id_idx  on reserved_session (member_id);
create index reserved_session_checkin_id_idx  on reserved_session (checkin_id);
create index reserved_session_payment_idx     on reserved_session (settled_payment_id);
create index reserved_session_created_by_idx  on reserved_session (created_by);
create index reserved_session_unsettled_idx   on reserved_session (member_id) where not settled;
