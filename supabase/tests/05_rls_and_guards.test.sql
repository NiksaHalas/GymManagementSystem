-- Authorization boundaries enforced by the database itself (RLS + triggers),
-- so they hold even if the app layer is bypassed.

begin;
select plan(14);

create temp table ctx (k text primary key, id uuid);
grant select, insert on ctx to authenticated, anon;
create or replace function pg_temp.c(p_key text) returns uuid
language sql stable as $$ select id from ctx where k = p_key $$;

insert into ctx values
  ('worker',   tests.create_staff('t_worker')),
  ('worker2',  tests.create_staff('t_worker2')),
  ('admin',    tests.create_staff('t_admin', 'admin')),
  ('m',        tests.create_member('Obična', 'Članica')),
  ('m_arch',   tests.create_member('Arhivirana', 'Članica')),
  ('m_debt',   tests.create_member('Dužnik', 'Član'));

update member set archived = true, archived_at = now() where id = pg_temp.c('m_arch');

insert into ctx values ('ck_old', gen_random_uuid()), ('ck_old2', gen_random_uuid());
insert into checkin (id, member_id, staff_id, key_no, business_date)
values
  (pg_temp.c('ck_old'),  pg_temp.c('m'), pg_temp.c('worker'), 1, business_today() - 1),
  (pg_temp.c('ck_old2'), pg_temp.c('m'), pg_temp.c('worker'), 2, business_today() - 1);

insert into reserved_session (member_id, training_category_id, session_date, amount_rsd)
values (pg_temp.c('m_debt'), tests.category_id('individualni'), business_today(), 1200);

insert into shift (staff_id, started_at, ended_at, ended_reason)
values (pg_temp.c('worker'), now() - interval '2 hours', now() - interval '1 hour', 'logout');

-- Same-day rule on check-ins -------------------------------------------------------------
select tests.login(pg_temp.c('worker'));
update checkin set key_returned = true, updated_by = pg_temp.c('worker')
where id = pg_temp.c('ck_old');

select tests.login(pg_temp.c('admin'));
update checkin set key_returned = true, updated_by = pg_temp.c('admin')
where id = pg_temp.c('ck_old2');

select tests.logout();
select ok(not (select key_returned from checkin where id = pg_temp.c('ck_old')),
  'a worker cannot edit a check-in from a previous day');
select ok((select key_returned from checkin where id = pg_temp.c('ck_old2')),
  'an admin can edit a check-in from a previous day');

-- Actor binding ------------------------------------------------------------------------
select tests.login(pg_temp.c('worker'));
select throws_ok(
  format('insert into checkin (member_id, staff_id, key_no, business_date) values (%L, %L, 3, business_today())',
    pg_temp.c('m'), pg_temp.c('worker2')),
  '42501', null,
  'a worker cannot record a check-in in someone else''s name');

-- Member archive / restore guards -----------------------------------------------------
select throws_ok(
  format('update member set archived = false, updated_by = %L where id = %L',
    pg_temp.c('worker'), pg_temp.c('m_arch')),
  '42501', null,
  'only an admin can restore an archived member');

select throws_ok(
  format('update member set archived = true, archived_at = now(), updated_by = %L where id = %L',
    pg_temp.c('worker'), pg_temp.c('m_debt')),
  '23514', null,
  'a member with unsettled debt cannot be archived');

select lives_ok(
  format('update member set archived = true, archived_at = now(), updated_by = %L where id = %L',
    pg_temp.c('worker'), pg_temp.c('m')),
  'a member without debt can be archived');

select tests.login(pg_temp.c('admin'));
select lives_ok(
  format('update member set archived = false, updated_by = %L where id = %L',
    pg_temp.c('admin'), pg_temp.c('m_arch')),
  'an admin can restore an archived member');

-- Catalog and accounts are admin-only -------------------------------------------------
select tests.login(pg_temp.c('worker'));
select throws_ok(
  format('insert into price (membership_type_id, amount_rsd, is_discount_price) values (%s, 999, true)',
    tests.type_id('kardio', '30/1')),
  '42501', null,
  'a worker cannot change the price list');

update staff set role = 'admin' where id = pg_temp.c('worker');

select is((select count(*)::int from shift), 0,
  'workers cannot read shift history');

select tests.logout();
select is((select role::text from staff where id = pg_temp.c('worker')), 'user',
  'a worker cannot promote themselves to admin');

select tests.login(pg_temp.c('admin'));
select cmp_ok((select count(*)::int from shift), '>=', 1,
  'admins can read shift history');

-- Signup metadata never grants a role --------------------------------------------------
select tests.logout();
insert into auth.users (id, email, aud, role, raw_user_meta_data)
values ('00000000-0000-4000-8000-00000000abcd', 'sneaky@gym.local', 'authenticated',
        'authenticated', '{"username":"sneaky","role":"admin"}');
select is((select role::text from staff where id = '00000000-0000-4000-8000-00000000abcd'), 'user',
  'a role in client-supplied signup metadata is ignored');

-- Phone numbers are unique by digits, across formatting ---------------------------------
select throws_ok(
  format($$insert into member (first_name, last_name, phone)
           select 'Dupli', 'Telefon', regexp_replace(phone, '(\d{3})(\d+)', '\1 / \2')
           from member where id = %L$$, pg_temp.c('m')),
  '23505', null,
  'the same phone number in a different format is rejected');

-- Anonymous callers see nothing ----------------------------------------------------------
select tests.login_anon();
select throws_ok('select count(*) from member', '42501', null,
  'anon has no access to member data');

select * from finish();
rollback;
