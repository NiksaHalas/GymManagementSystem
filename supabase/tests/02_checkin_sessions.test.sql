-- create_checkin / void_checkin session accounting: trainer sessions, reserved
-- debt at the captured daily price, solo Otvoreni auto-deduction, first-visit
-- activation, and the "use remaining sessions after expiry" override.

begin;
select plan(19);

create temp table ctx (k text primary key, id uuid);
insert into ctx values
  ('worker',   tests.create_staff('t_worker')),
  ('trainer',  tests.create_staff('t_trainer')),
  ('m_ind',    tests.create_member('Marko', 'Ind')),
  ('m_none',   tests.create_member('Nema', 'Paket')),
  ('m_open8',  tests.create_member('Otvoreni', 'Osam')),
  ('m_open30', tests.create_member('Otvoreni', 'Mesec')),
  ('m_zero',   tests.create_member('Nula', 'Sesija')),
  ('m_fv',     tests.create_member('Prvi', 'Dolazak')),
  ('m_exp',    tests.create_member('Istekla', 'Trener')),
  ('m_oexp',   tests.create_member('Istekla', 'Solo')),
  ('m_oexp2',  tests.create_member('Istekla', 'Bez')),
  ('m_mism',   tests.create_member('Pogresna', 'Kategorija'));
grant select, insert on ctx to authenticated;

create or replace function pg_temp.c(p_key text) returns uuid
language sql stable as $$ select id from ctx where k = p_key $$;

insert into ctx values
  ('ms_ind',   tests.give_membership(pg_temp.c('m_ind'),    'individualni', '8/1')),
  ('ms_open8', tests.give_membership(pg_temp.c('m_open8'),  'otvoreni', '8/1')),
  ('ms_o30',   tests.give_membership(pg_temp.c('m_open30'), 'otvoreni', '30/1')),
  ('ms_zero',  tests.give_membership(pg_temp.c('m_zero'),   'otvoreni', '8/1', p_sessions_left := 0)),
  ('ms_fv',    tests.give_membership(pg_temp.c('m_fv'),     'otvoreni', '30/1')),
  ('ms_exp',   tests.give_membership(pg_temp.c('m_exp'),    'individualni', '8/1',
                 business_today() - 60, 'istekla', 3)),
  ('ms_oexp',  tests.give_membership(pg_temp.c('m_oexp'),   'otvoreni', '8/1',
                 business_today() - 60, 'istekla', 2)),
  ('ms_oexp2', tests.give_membership(pg_temp.c('m_oexp2'),  'otvoreni', '8/1',
                 business_today() - 60, 'istekla', 2)),
  ('ms_mism',  tests.give_membership(pg_temp.c('m_mism'),   'individualni', '8/1'));

update membership
set start_mode = 'first_visit', start_date = null, end_date = null
where id = pg_temp.c('ms_fv');

select tests.login(pg_temp.c('worker'));

-- Trainer session on a matching trainer package -------------------------------
insert into ctx values ('ck_ind', create_checkin(
  p_member_id := pg_temp.c('m_ind'), p_key_no := 1, p_with_trainer := true,
  p_training_category_id := tests.category_id('individualni'),
  p_trainer_id := pg_temp.c('trainer')));

select is((select sessions_left from membership where id = pg_temp.c('ms_ind')), 7,
  'trainer session deducts one session from the package');
select is((select count(*)::int from session_log
           where checkin_id = pg_temp.c('ck_ind') and trainer_id = pg_temp.c('trainer')), 1,
  'trainer session is logged with the trainer');
select ok((select decremented_session from checkin where id = pg_temp.c('ck_ind')),
  'check-in is marked as having deducted a session');

select void_checkin(pg_temp.c('ck_ind'));
select is((select sessions_left from membership where id = pg_temp.c('ms_ind')), 8,
  'voiding the arrival restores the session');
select is((select count(*)::int from session_log where checkin_id = pg_temp.c('ck_ind')), 0,
  'voiding the arrival removes the session log row');

-- Sessions never transfer between categories ----------------------------------
select throws_ok(
  format(
    'select create_checkin(p_member_id := %L, p_key_no := 2, p_with_trainer := true, p_training_category_id := %s, p_trainer_id := %L)',
    pg_temp.c('m_mism'), tests.category_id('duo'), pg_temp.c('trainer')),
  'GYM02', null,
  'a Duo session cannot consume an Individualni package');

-- Trainer session without a package becomes debt at the daily price -----------
insert into ctx values ('ck_none', create_checkin(
  p_member_id := pg_temp.c('m_none'), p_key_no := 3, p_with_trainer := true,
  p_training_category_id := tests.category_id('individualni'),
  p_trainer_id := pg_temp.c('trainer')));

select is(
  (select amount_rsd from reserved_session where checkin_id = pg_temp.c('ck_none') and not settled),
  (select p.amount_rsd from price p where p.membership_type_id = tests.type_id('individualni', '1/1')
     and not p.is_discount_price),
  'trainer session without a package is reserved at the captured daily price');

-- Solo Otvoreni -----------------------------------------------------------------
select create_checkin(p_member_id := pg_temp.c('m_open8'), p_key_no := 4);
select is((select sessions_left from membership where id = pg_temp.c('ms_open8')), 7,
  'solo arrival on Otvoreni 8/1 auto-deducts a session');

insert into ctx values ('ck_o30', create_checkin(p_member_id := pg_temp.c('m_open30'), p_key_no := 5));
select ok(not (select decremented_session from checkin where id = pg_temp.c('ck_o30')),
  'solo arrival on time-based Otvoreni 30/1 deducts nothing');

insert into ctx values ('ck_zero', create_checkin(p_member_id := pg_temp.c('m_zero'), p_key_no := 6));
select ok(
  (select sessions_left = 0 and not c.decremented_session
   from membership m, checkin c
   where m.id = pg_temp.c('ms_zero') and c.id = pg_temp.c('ck_zero')),
  'a package with 0 sessions still lets the member in, without deduction');

-- First-visit activation ---------------------------------------------------------
insert into ctx values ('ck_fv', create_checkin(p_member_id := pg_temp.c('m_fv'), p_key_no := 7));
select is(
  (select array[start_date, end_date] from membership where id = pg_temp.c('ms_fv')),
  array[business_today(), business_today() + 29],
  'first visit starts a 30-day first_visit membership today');

select void_checkin(pg_temp.c('ck_fv'));
select ok(
  (select start_date is null and end_date is null from membership where id = pg_temp.c('ms_fv')),
  'voiding the only arrival reverts the first-visit activation');

-- Override: use remaining sessions after expiry ---------------------------------
insert into ctx values ('ck_exp', create_checkin(
  p_member_id := pg_temp.c('m_exp'), p_key_no := 8, p_with_trainer := true,
  p_training_category_id := tests.category_id('individualni'),
  p_trainer_id := pg_temp.c('trainer'), p_allow_expired_override := true));

select is((select sessions_left from membership where id = pg_temp.c('ms_exp')), 2,
  'trainer override burns a remaining session of the expired package');
select is((select count(*)::int from session_log where checkin_id = pg_temp.c('ck_exp')), 1,
  'trainer override is logged as a session');
select is((select count(*)::int from reserved_session where checkin_id = pg_temp.c('ck_exp')), 0,
  'trainer override does not also create debt');

select void_checkin(pg_temp.c('ck_exp'));
select is(
  (select array[sessions_left::text, status::text] from membership where id = pg_temp.c('ms_exp')),
  array['3', 'istekla'],
  'voiding an override arrival restores the session and keeps the package expired');

select create_checkin(p_member_id := pg_temp.c('m_oexp'), p_key_no := 9,
  p_allow_expired_override := true);
select is((select sessions_left from membership where id = pg_temp.c('ms_oexp')), 1,
  'solo override burns a remaining Otvoreni session');
select is((select count(*)::int from session_log where member_id = pg_temp.c('m_oexp')), 0,
  'solo override does not write a trainer session log');

select create_checkin(p_member_id := pg_temp.c('m_oexp2'), p_key_no := 10,
  p_allow_expired_override := false);
select is((select sessions_left from membership where id = pg_temp.c('ms_oexp2')), 2,
  'without the override an expired package is left untouched');

select * from finish();
rollback;
