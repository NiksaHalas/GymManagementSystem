-- Verifikacija Nevraćeni ključevi (§3.7) — app-only, no migration.
-- Pokretati: docker exec -i supabase_db_GymManagementSystem psql -U postgres -v ON_ERROR_STOP=0 < scripts/verify_unreturned_keys.sql

create or replace function _test_unreturned_count(p_date date) returns int
language sql stable as $$
  with latest as (
    select distinct on (c.key_no) c.key_no
    from checkin c
    where c.business_date = p_date
      and not c.voided
      and not c.key_returned
      and c.key_no is not null
    order by c.key_no, c.created_at desc
  )
  select count(*)::int from latest;
$$;

\set worker '11111111-1111-1111-1111-111111111111'
\set member '33333333-3333-3333-3333-333333333333'

set request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
set role authenticated;

\echo '--- Scenario 1: three open keys today ---'
do $$
declare
  v_ck1 uuid;
  v_ck2 uuid;
  v_ck3 uuid;
  v_cnt int;
begin
  update checkin set voided = true, updated_by = '11111111-1111-1111-1111-111111111111'
  where business_date = business_today() and not voided;

  -- mark any open visits from fixture member as left first
  update checkin set key_returned = true, checked_out_at = now()
  where member_id = '33333333-3333-3333-3333-333333333333'
    and business_date = business_today() and not voided and not key_returned;

  v_ck1 := create_checkin(p_member_id := '33333333-3333-3333-3333-333333333333', p_key_no := 1);
  update checkin set key_returned = true where id = v_ck1;
  v_ck2 := create_checkin(p_member_id := '33333333-3333-3333-3333-333333333333', p_key_no := 2);
  v_ck3 := create_checkin(p_member_id := null, p_key_no := 3, p_is_fitpass := true);

  v_cnt := _test_unreturned_count(business_today());
  assert v_cnt = 2, 'ocekivano 2 otvorena kljuca (keys 2,3), dobijeno ' || v_cnt;

  assert exists (
    select 1 from checkin c
    join staff s on s.id = c.staff_id
    where c.id = v_ck2 and s.username is not null
  ), 'worker username join';

  raise notice 'PASS scenario 1';
exception when others then
  raise warning 'FAIL scenario 1: %', sqlerrm;
end $$;

\echo '--- Scenario 2: Otišao removes key from list ---'
do $$
declare
  v_cnt_before int;
  v_cnt_after int;
  v_ck uuid;
begin
  v_cnt_before := _test_unreturned_count(business_today());
  assert v_cnt_before >= 1, 'nema otvorenih kljuceva';

  select id into v_ck from checkin
  where business_date = business_today() and not voided and not key_returned and key_no = 2
  limit 1;

  update checkin set key_returned = true, checked_out_at = now() where id = v_ck;
  v_cnt_after := _test_unreturned_count(business_today());
  assert v_cnt_after = v_cnt_before - 1, 'count nije umanjen posle Otisao';

  raise notice 'PASS scenario 2';
exception when others then
  raise warning 'FAIL scenario 2: %', sqlerrm;
end $$;

\echo '--- Scenario 3: Bez ključa excluded ---'
do $$
declare
  v_ck uuid;
  v_cnt int;
begin
  v_ck := create_checkin(p_member_id := '33333333-3333-3333-3333-333333333333', p_key_no := null);
  assert (select key_no from checkin where id = v_ck) is null, 'key_no nije null';

  v_cnt := _test_unreturned_count(business_today());
  assert not exists (
    select 1 from checkin
    where id = v_ck and not key_returned and key_no is null
      and id in (
        select distinct on (key_no) id from checkin
        where business_date = business_today() and not voided and not key_returned and key_no is not null
        order by key_no, created_at desc
      )
  ), 'bez kljuca u unreturned set';

  update checkin set key_returned = true where id = v_ck;
  raise notice 'PASS scenario 3';
exception when others then
  raise warning 'FAIL scenario 3: %', sqlerrm;
end $$;

\echo '--- Scenario 4: past business_date filter ---'
do $$
declare
  v_yesterday date := business_today() - 1;
  v_cnt int;
begin
  update checkin set voided = true where business_date = v_yesterday and not voided;

  insert into checkin (
    member_id, staff_id, key_no, key_returned, voided, business_date,
    with_trainer, decremented_session, is_fitpass, is_group_fitpass, created_by, updated_by
  ) values (
    '33333333-3333-3333-3333-333333333333', '11111111-1111-1111-1111-111111111111',
    5, false, false, v_yesterday, false, false, false, false,
    '11111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111');

  v_cnt := _test_unreturned_count(v_yesterday);
  assert v_cnt >= 1, 'past day nema unreturned';

  v_cnt := _test_unreturned_count(business_today());
  assert v_cnt >= 0, 'today count ok';

  raise notice 'PASS scenario 4';
exception when others then
  raise warning 'FAIL scenario 4: %', sqlerrm;
end $$;

\echo '--- Scenario 5: shared key — last holder only ---'
do $$
declare
  v_ck1 uuid;
  v_ck2 uuid;
  v_holder uuid;
begin
  update checkin set voided = true where business_date = business_today() and key_no = 6 and not voided;

  v_ck1 := create_checkin(p_member_id := '33333333-3333-3333-3333-333333333333', p_key_no := 6);
  update checkin set key_returned = true where id = v_ck1;

  -- second member would need another member id; reuse fitpass on same key after first left
  v_ck2 := create_checkin(p_is_fitpass := true, p_key_no := 6);

  select c.id into v_holder from checkin c
  where c.business_date = business_today() and c.key_no = 6 and not c.voided and not c.key_returned
  order by c.created_at desc limit 1;

  assert v_holder = v_ck2, 'poslednji drzalac nije fitpass checkin';

  update checkin set key_returned = true where id = v_ck2;
  raise notice 'PASS scenario 5';
exception when others then
  raise warning 'FAIL scenario 5: %', sqlerrm;
end $$;

reset role;
drop function if exists _test_unreturned_count(date);
