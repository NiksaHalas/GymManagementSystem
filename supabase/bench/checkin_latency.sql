-- Measures create_checkin() execution time inside Postgres on the seeded demo
-- dataset (local only; not part of CI). Network and app time are NOT included.
--
--   docker exec -i supabase_db_GymManagementSystem psql -U postgres < supabase/bench/checkin_latency.sql
--
-- Runs 200 check-ins as the counter worker for 200 different members, then rolls back.

begin;

create temp table bench (ms numeric);
grant insert on bench to authenticated;

create temp table candidates as
select m.id
from member m
where not m.archived
  and not exists (
    select 1 from checkin c
    where c.member_id = m.id and c.business_date = business_today()
      and not c.voided and not c.key_returned)
order by m.member_no
limit 200;
grant select on candidates to authenticated;

select set_config('request.jwt.claims',
  json_build_object('sub', (select id from staff where username = 'jelena'),
                    'role', 'authenticated')::text, true);
set local role authenticated;

do $$
declare
  v_id    uuid;
  v_i     int := 0;
  v_start timestamptz;
begin
  for v_id in select id from candidates loop
    v_i := v_i + 1;
    v_start := clock_timestamp();
    perform create_checkin(p_member_id := v_id, p_key_no := 1 + (v_i % 22));
    insert into bench values (extract(epoch from clock_timestamp() - v_start) * 1000);
  end loop;
end $$;

reset role;

select count(*)                                                        as runs,
       round(percentile_cont(0.50) within group (order by ms)::numeric, 2) as p50_ms,
       round(percentile_cont(0.95) within group (order by ms)::numeric, 2) as p95_ms,
       round(max(ms), 2)                                                as max_ms,
       (select count(*) from checkin)                                   as checkins_in_table
from bench;

rollback;
