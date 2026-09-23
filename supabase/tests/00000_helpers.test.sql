-- Shared pgTAP helpers. Runs first (alphabetical) and COMMITS, so every later
-- test file can use the `tests` schema. Each test file wraps its own work in
-- begin … rollback, so fixtures never leak between files.

begin;

create extension if not exists pgtap with schema extensions;

create schema if not exists tests;
grant usage on schema tests to authenticated, anon;

-- Creates an auth user; the on_auth_user_created trigger provisions the staff row.
create or replace function tests.create_staff(
  p_username text,
  p_role     staff_role default 'user'
)
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_id uuid := gen_random_uuid();
begin
  insert into auth.users (id, email, aud, role, raw_user_meta_data, created_at, updated_at)
  values (
    v_id,
    p_username || '@gym.local',
    'authenticated',
    'authenticated',
    jsonb_build_object('username', p_username),
    now(),
    now()
  );
  if p_role = 'admin' then
    update public.staff set role = 'admin' where id = v_id;
  end if;
  return v_id;
end $$;

-- Act as a signed-in staff member for the rest of the transaction.
create or replace function tests.login(p_staff_id uuid)
returns void
language plpgsql
as $$
begin
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', p_staff_id, 'role', 'authenticated')::text,
    true
  );
  perform set_config('role', 'authenticated', true);
end $$;

-- Act as an anonymous (not signed-in) API caller.
create or replace function tests.login_anon()
returns void
language plpgsql
as $$
begin
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  perform set_config('role', 'anon', true);
end $$;

-- Back to the test runner's superuser role (bypasses RLS) for setup/inspection.
create or replace function tests.logout()
returns void
language plpgsql
as $$
begin
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', '', true);
end $$;

create or replace function tests.create_member(
  p_first text default 'Test',
  p_last  text default 'Član',
  p_discount boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  insert into member (first_name, last_name, phone, discount_flag)
  values (
    p_first,
    p_last,
    '06' || lpad((floor(random() * 1e8))::bigint::text, 8, '0'),
    p_discount
  )
  returning id into v_id;
  return v_id;
end $$;

-- Membership type id by category code + package ('otvoreni', '8/1').
create or replace function tests.type_id(p_category text, p_package text)
returns bigint
language sql
stable
security definer
set search_path = public
as $$
  select mt.id
  from membership_type mt
  join training_category tc on tc.id = mt.training_category_id
  where tc.code = p_category and mt.package = p_package;
$$;

create or replace function tests.category_id(p_code text)
returns bigint
language sql
stable
security definer
set search_path = public
as $$
  select id from training_category where code = p_code;
$$;

-- Inserts a membership directly (bypassing payment) with the given window.
create or replace function tests.give_membership(
  p_member_id uuid,
  p_category  text,
  p_package   text,
  p_start     date default business_today(),
  p_status    membership_status default 'aktivna',
  p_sessions_left int default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_mt membership_type%rowtype;
  v_id uuid;
begin
  select * into v_mt from membership_type where id = tests.type_id(p_category, p_package);
  insert into membership (
    member_id, membership_type_id, start_mode, start_date, end_date,
    sessions_total, sessions_left, status
  ) values (
    p_member_id, v_mt.id, 'payment', p_start, p_start + (v_mt.duration_days - 1),
    v_mt.sessions, coalesce(p_sessions_left, v_mt.sessions), p_status
  )
  returning id into v_id;
  return v_id;
end $$;

grant execute on all functions in schema tests to authenticated, anon;

select plan(1);
select has_function('tests', 'create_staff', 'pgTAP helpers are installed');
select * from finish();

commit;
