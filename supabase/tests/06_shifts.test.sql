-- Shift lifecycle RPCs: one open shift at a time, handover between workers,
-- manual end, and attribution of check-ins to the open shift.

begin;
select plan(9);

create temp table ctx (k text primary key, id uuid);
grant select, insert on ctx to authenticated;
create or replace function pg_temp.c(p_key text) returns uuid
language sql stable as $$ select id from ctx where k = p_key $$;

insert into ctx values
  ('a', tests.create_staff('t_jelena')),
  ('b', tests.create_staff('t_marko')),
  ('m', tests.create_member('Smena', 'Član'));

select tests.login(pg_temp.c('a'));
select is(open_or_resume_shift(), 'opened', 'the first worker on the counter opens a shift');
select is(open_or_resume_shift(), 'resumed', 'the same worker resumes their open shift');

select tests.login(pg_temp.c('b'));
select is(open_or_resume_shift(), 'foreign_shift_open',
  'a second worker sees that someone else''s shift is open');

select handover_shift();

select tests.logout();
select is(
  (select ended_reason::text from shift where staff_id = pg_temp.c('a')),
  'switch',
  'handover closes the previous worker''s shift as a switch');
select is(
  (select count(*)::int from shift where staff_id = pg_temp.c('b') and ended_at is null),
  1,
  'handover opens a shift for the new worker');
select is((select count(*)::int from shift where ended_at is null), 1,
  'there is never more than one open shift');

select tests.login(pg_temp.c('b'));
insert into ctx values ('ck', create_checkin(p_member_id := pg_temp.c('m'), p_key_no := 1));

select tests.logout();
select is(
  (select c.shift_id from checkin c where c.id = pg_temp.c('ck')),
  (select s.id from shift s where s.staff_id = pg_temp.c('b') and s.ended_at is null),
  'a check-in is attributed to the recording worker''s open shift');

select tests.login(pg_temp.c('b'));
select end_shift();

select tests.logout();
select is(
  (select ended_reason::text from shift where staff_id = pg_temp.c('b')),
  'logout',
  'a worker can end their own shift manually');
select is((select count(*)::int from shift where ended_at is null), 0,
  'after ending the shift no shift is open');

select * from finish();
rollback;
