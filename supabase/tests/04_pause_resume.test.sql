-- pause_membership / resume_membership: a paused membership has no side effects
-- at check-in, and resuming extends end_date by the paused days.

begin;
select plan(8);

create temp table ctx (k text primary key, id uuid);
grant select, insert on ctx to authenticated;
create or replace function pg_temp.c(p_key text) returns uuid
language sql stable as $$ select id from ctx where k = p_key $$;

insert into ctx values
  ('worker', tests.create_staff('t_worker')),
  ('m',      tests.create_member('Pauza', 'Članica')),
  ('m_fv',   tests.create_member('Prvi', 'Dolazak'));
insert into ctx values
  ('ms',    tests.give_membership(pg_temp.c('m'), 'otvoreni', '8/1')),
  ('ms_fv', tests.give_membership(pg_temp.c('m_fv'), 'otvoreni', '30/1'));
update membership set start_mode = 'first_visit', start_date = null, end_date = null
where id = pg_temp.c('ms_fv');

select tests.login(pg_temp.c('worker'));

select pause_membership(pg_temp.c('ms'));
select ok(
  (select status = 'pauzirana' and paused_at is not null from membership where id = pg_temp.c('ms')),
  'pausing sets the status and records when');

select throws_ok(
  format('select pause_membership(%L)', pg_temp.c('ms')),
  'GYM03', 'Članarina nije aktivna.',
  'an already paused membership cannot be paused again');

select throws_ok(
  format('select pause_membership(%L)', pg_temp.c('ms_fv')),
  'GYM03', 'Članarina još nije aktivirana (prvi dolazak).',
  'a first-visit membership cannot be paused before it starts');

-- Arrival while paused: allowed, but no session deduction and no membership link.
insert into ctx values ('ck', create_checkin(p_member_id := pg_temp.c('m'), p_key_no := 1));
select ok(
  (select c.membership_id is null and not c.decremented_session and m.sessions_left = 8
   from checkin c, membership m
   where c.id = pg_temp.c('ck') and m.id = pg_temp.c('ms')),
  'arrival while paused has no side effects on the membership');

-- Simulate a 5-day pause, then resume.
select tests.logout();
update membership set paused_at = now() - interval '5 days' where id = pg_temp.c('ms');
insert into ctx values ('end_before',
  null);
create temp table before as select end_date from membership where id = pg_temp.c('ms');
select tests.login(pg_temp.c('worker'));

select resume_membership(pg_temp.c('ms'));
select is((select status::text from membership where id = pg_temp.c('ms')), 'aktivna',
  'resuming reactivates the membership');
select is((select paused_days from membership where id = pg_temp.c('ms')), 5,
  'resuming records the paused days');

select tests.logout();
select is(
  (select end_date from membership where id = pg_temp.c('ms')),
  (select end_date + 5 from before),
  'resuming extends end_date by the paused days');
select tests.login(pg_temp.c('worker'));

select throws_ok(
  format('select resume_membership(%L)', pg_temp.c('ms')),
  'GYM04', 'Članarina nije pauzirana.',
  'a membership that is not paused cannot be resumed');

select * from finish();
rollback;
