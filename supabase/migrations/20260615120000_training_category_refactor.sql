-- training_category: runtime-manageable lookup replacing training_type enum
create table training_category (
  id               bigint generated always as identity primary key,
  code             text not null unique,
  label            text not null,
  is_trainer_based boolean not null default false,
  per_trainee      boolean not null default false,
  active           boolean not null default true,
  sort_order       int not null default 0,
  updated_by       uuid references staff (id),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

insert into training_category (code, label, is_trainer_based, per_trainee, sort_order) values
  ('otvoreni', 'Otvoreni tip', false, false, 1),
  ('kardio', 'Kardio', false, false, 2),
  ('individualni', 'Individualni', true, false, 3),
  ('duo', 'Duo', true, true, 4),
  ('vodjeni', 'Vođeni', true, false, 5);

grant select, insert, update, delete on training_category to authenticated, service_role;

alter table training_category enable row level security;
alter table training_category force row level security;

create policy training_category_select on training_category for select to authenticated using (true);
create policy training_category_insert on training_category for insert to authenticated with check (is_admin());
create policy training_category_update on training_category for update to authenticated using (is_admin()) with check (is_admin());
create policy training_category_delete on training_category for delete to authenticated using (is_admin());

-- membership_type: swap training_type enum for training_category_id
alter table membership_type add column training_category_id bigint references training_category (id) on delete restrict;

update membership_type mt
set training_category_id = tc.id
from training_category tc
where tc.code = mt.training_type::text;

alter table membership_type alter column training_category_id set not null;
alter table membership_type drop constraint membership_type_training_type_package_key;
alter table membership_type drop column training_type;
alter table membership_type add unique (training_category_id, package);
create index membership_type_training_category_id_idx on membership_type (training_category_id);

-- checkin: nullable training_category_id (only set when with_trainer)
alter table checkin add column training_category_id bigint references training_category (id) on delete restrict;
alter table checkin drop constraint checkin_check;
alter table checkin drop column training_type;
alter table checkin add check (not with_trainer or (training_category_id is not null and trainer_id is not null));
create index checkin_training_category_id_idx on checkin (training_category_id);

-- session_log
alter table session_log add column training_category_id bigint references training_category (id) on delete restrict;

update session_log sl
set training_category_id = tc.id
from training_category tc
where tc.code = sl.training_type::text;

alter table session_log alter column training_category_id set not null;
alter table session_log drop column training_type;
create index session_log_training_category_id_idx on session_log (training_category_id);

-- reserved_session
alter table reserved_session add column training_category_id bigint references training_category (id) on delete restrict;

update reserved_session rs
set training_category_id = tc.id
from training_category tc
where tc.code = rs.training_type::text;

alter table reserved_session alter column training_category_id set not null;
alter table reserved_session drop column training_type;
create index reserved_session_training_category_id_idx on reserved_session (training_category_id);

drop type training_type;
