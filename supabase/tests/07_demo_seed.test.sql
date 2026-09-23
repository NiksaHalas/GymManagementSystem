-- Invariants of the demo data generator (supabase/demo/demo_generator.sql).
-- supabase/seed.sql already ran demo.reset(); this file regenerates for the same
-- "today" (inside the transaction, rolled back) and checks the result obeys the
-- same rules as data written through the app.

begin;
select plan(15);

select has_function('demo', 'reset', array['date'], 'demo.reset(date) exists');
select ok(
  not has_function_privilege('authenticated', 'demo.reset(date)', 'execute')
  and not has_function_privilege('anon', 'demo.reset(date)', 'execute'),
  'API roles cannot run the generator');

create temp table seeded as select v from demo.meta where k = 'last_reset';
create temp table regenerated as select demo.reset((select (v ->> 'today')::date from seeded)) as v;

select is((select v from regenerated), (select v from seeded),
  'the generator is deterministic for a given day');

create temp table today as select (v ->> 'today')::date as d from regenerated;

-- Scale and shape ---------------------------------------------------------------------
select ok((select count(*) between 320 and 420 from member), 'about 350–400 members');

create temp table per_day as
select business_date, count(*) as n
from checkin
where not voided and business_date < (select d from today)
group by 1;

select ok((select avg(n) between 50 and 110 from per_day), 'on average 50–110 arrivals a day');
select ok(
  (select avg(n) filter (where extract(isodow from business_date) = 1)
        > avg(n) filter (where extract(isodow from business_date) = 7) * 1.5
   from per_day),
  'Mondays are much busier than Sundays');
select ok(
  (select avg(n) filter (where extract(month from business_date) = 1)
        > avg(n) filter (where extract(month from business_date) = 8)
   from per_day),
  'January is busier than August');

-- Consistency with the RPC rules ---------------------------------------------------------
select is(
  (select count(*)::int
   from membership m join membership_type t on t.id = m.membership_type_id
   where not t.is_time_based
     and m.sessions_left <> m.sessions_total - (
       select count(*) from checkin c
       where c.membership_id = m.id and c.decremented_session and not c.voided)),
  0,
  'sessions_left always equals sessions_total minus deducted arrivals');

select is(
  (select count(*)::int from checkin c
   where not c.voided
     and ((c.created_at at time zone 'Europe/Belgrade')::time < '09:00'
          or (c.created_at at time zone 'Europe/Belgrade')::time >
             (case extract(isodow from c.business_date)
                when 6 then '18:00' when 7 then '16:00' else '21:00' end)::time)),
  0,
  'no arrival outside opening hours');

select is(
  (select count(*)::int from checkin c left join shift s on s.id = c.shift_id
   where not c.voided
     and (s.id is null or c.created_at < s.started_at
          or (s.ended_at is not null and c.created_at > s.ended_at))),
  0,
  'every arrival is attributed to the shift that covers it');

select is(
  (select count(*)::int from payment p left join shift s on s.id = p.shift_id
   where s.id is null or p.created_at < s.started_at
         or (s.ended_at is not null and p.created_at > s.ended_at)),
  0,
  'every payment is attributed to the shift that covers it');

-- (No open shift at all on a closed day, e.g. New Year's Day.)
select ok(
  coalesce((select array_agg(st.username) = array['jelena']
            from shift s join staff st on st.id = s.staff_id
            where s.ended_at is null), extract(month from (select d from today)) = 1
                                       and extract(day from (select d from today)) = 1),
  'the only open shift is today''s morning shift');

select is(
  (select count(*)::int from member m
   where archived and exists (select 1 from reserved_session r
                              where r.member_id = m.id and not r.settled)),
  0,
  'no archived member has unsettled debt');

select is(
  (select count(*)::int from checkin
   where created_at > ((select d from today) + time '11:00') at time zone 'Europe/Belgrade'),
  0,
  'today''s data stops at 11:00');

select ok(
  (select count(*) > 0 from membership where status = 'pauzirana')
  and (select count(*) > 0 from membership where status = 'zakazana')
  and (select count(*) > 0 from reserved_session where not settled)
  and (select count(*) > 0 from payment where kind = 'fitpass_surcharge')
  and (select count(*) > 0 from payment where voided)
  and (select count(*) > 0 from checkin where voided),
  'paused, queued, debt, Fitpass surcharge and voids are all represented');

select * from finish();
rollback;
