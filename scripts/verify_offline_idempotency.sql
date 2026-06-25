-- Verifikacija offline idempotency (20260625120000).
-- Pokretati na lokalnoj supabase bazi:
--   docker exec -i supabase_db_GymManagementSystem psql -U postgres -v ON_ERROR_STOP=0 < scripts/verify_offline_idempotency.sql

\set worker '11111111-1111-1111-1111-111111111111'
\set member '33333333-3333-3333-3333-333333333333'
\set ck_id  'aaaaaaaa-aaaa-7aaa-aaaa-aaaaaaaaaaaa'
\set pay_id 'bbbbbbbb-bbbb-7bbb-bbbb-bbbbbbbbbbbb'

set request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
set role authenticated;

-- ===========================================================================
-- Scenario 1 — create_checkin with explicit p_id inserts once
-- ===========================================================================
\echo '--- Scenario 1: create_checkin p_id idempotent ---'
do $$
declare
  v_mid uuid;
  v_mtype bigint;
  v_before int;
  v_after int;
  v_ck uuid;
  v_ck2 uuid;
begin
  update checkin set voided = true, updated_by = '11111111-1111-1111-1111-111111111111'
  where member_id = '33333333-3333-3333-3333-333333333333' and business_date = business_today() and not voided;

  select mt.id into v_mtype
  from membership_type mt
  join training_category tc on tc.id = mt.training_category_id
  where tc.code = 'otvoreni' and mt.package = '8/1' and mt.active;

  perform record_payment(
    p_member_id := '33333333-3333-3333-3333-333333333333',
    p_membership_type_id := v_mtype,
    p_amount_rsd := offered_membership_price(v_mtype, '33333333-3333-3333-3333-333333333333'),
    p_start_mode := 'payment');

  select id, sessions_left into v_mid, v_before
  from membership where member_id = '33333333-3333-3333-3333-333333333333' and status = 'aktivna'
  order by created_at desc limit 1;

  v_ck := create_checkin(
    p_member_id := '33333333-3333-3333-3333-333333333333',
    p_key_no := 2,
    p_id := 'aaaaaaaa-aaaa-7aaa-aaaa-aaaaaaaaaaaa'::uuid);

  assert v_ck = 'aaaaaaaa-aaaa-7aaa-aaaa-aaaaaaaaaaaa'::uuid, 'first call id mismatch';

  v_ck2 := create_checkin(
    p_member_id := '33333333-3333-3333-3333-333333333333',
    p_key_no := 3,
    p_id := 'aaaaaaaa-aaaa-7aaa-aaaa-aaaaaaaaaaaa'::uuid);

  assert v_ck2 = v_ck, 'second call id mismatch';

  select sessions_left into v_after from membership where id = v_mid;
  assert v_after = v_before - 1, 'sessions deducted twice';

  assert (select count(*) from checkin where id = 'aaaaaaaa-aaaa-7aaa-aaaa-aaaaaaaaaaaa'::uuid) = 1,
    'duplicate checkin row';

  perform void_checkin(v_ck);
  raise notice 'PASS scenario 1';
exception when others then
  raise warning 'FAIL scenario 1: %', sqlerrm;
end $$;

-- ===========================================================================
-- Scenario 2 — record_payment with explicit p_id is idempotent
-- ===========================================================================
\echo '--- Scenario 2: record_payment p_id idempotent ---'
do $$
declare
  v_mtype bigint;
  v_pay uuid;
  v_pay2 uuid;
  v_cnt int;
begin
  select mt.id into v_mtype
  from membership_type mt
  join training_category tc on tc.id = mt.training_category_id
  where tc.code = 'otvoreni' and mt.package = '30/1' and mt.active;

  v_pay := record_payment(
    p_member_id := '33333333-3333-3333-3333-333333333333',
    p_membership_type_id := v_mtype,
    p_amount_rsd := offered_membership_price(v_mtype, '33333333-3333-3333-3333-333333333333'),
    p_start_mode := 'payment',
    p_id := 'bbbbbbbb-bbbb-7bbb-bbbb-bbbbbbbbbbbb'::uuid);

  assert v_pay = 'bbbbbbbb-bbbb-7bbb-bbbb-bbbbbbbbbbbb'::uuid, 'first payment id';

  v_pay2 := record_payment(
    p_member_id := '33333333-3333-3333-3333-333333333333',
    p_membership_type_id := v_mtype,
    p_amount_rsd := offered_membership_price(v_mtype, '33333333-3333-3333-3333-333333333333'),
    p_start_mode := 'payment',
    p_id := 'bbbbbbbb-bbbb-7bbb-bbbb-bbbbbbbbbbbb'::uuid);

  assert v_pay2 = v_pay, 'second payment id';

  select count(*) into v_cnt from payment where id = 'bbbbbbbb-bbbb-7bbb-bbbb-bbbbbbbbbbbb'::uuid;
  assert v_cnt = 1, 'duplicate payment row';

  select count(*) into v_cnt from membership
  where member_id = '33333333-3333-3333-3333-333333333333'
    and membership_type_id = v_mtype
    and status = 'zakazana'
    and created_at >= now() - interval '1 minute';
  assert v_cnt = 1, 'duplicate zakazana membership';

  raise notice 'PASS scenario 2';
exception when others then
  raise warning 'FAIL scenario 2: %', sqlerrm;
end $$;

\echo 'Done.'
