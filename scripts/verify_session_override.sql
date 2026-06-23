-- Verifikacija session override posle isteka (20260623140000).
-- Pokretati na lokalnoj supabase bazi:
--   docker exec -i supabase_db_GymManagementSystem psql -U postgres -v ON_ERROR_STOP=0 < scripts/verify_session_override.sql
-- Fixtures: worker 1111…, member 3333…

\set worker '11111111-1111-1111-1111-111111111111'
\set member '33333333-3333-3333-3333-333333333333'

set request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
set role authenticated;

-- ===========================================================================
-- Scenario 1 — Solo Otvoreni istekla, override=true → deduct, no session_log
-- ===========================================================================
\echo '--- Scenario 1: solo Otvoreni istekla override=true ---'
do $$
declare
  v_mid uuid;
  v_mtype bigint;
  v_ck uuid;
  v_before int;
  v_after int;
  v_sl_cnt int;
begin
  update checkin set voided = true, updated_by = '11111111-1111-1111-1111-111111111111'
  where member_id = '33333333-3333-3333-3333-333333333333' and business_date = business_today() and not voided;

  update membership set status = 'istekla'
  where member_id = '33333333-3333-3333-3333-333333333333' and status in ('aktivna', 'pauzirana');

  update membership set sessions_left = 0
  where member_id = '33333333-3333-3333-3333-333333333333' and status = 'istekla';

  select mt.id into v_mtype
  from membership_type mt
  join training_category tc on tc.id = mt.training_category_id
  where tc.code = 'otvoreni' and mt.package = '8/1' and mt.active;

  perform record_payment(
    p_member_id := '33333333-3333-3333-3333-333333333333',
    p_membership_type_id := v_mtype,
    p_amount_rsd := offered_membership_price(v_mtype, '33333333-3333-3333-3333-333333333333'),
    p_start_mode := 'payment');

  update membership set status = 'istekla', end_date = business_today() - 1
  where member_id = '33333333-3333-3333-3333-333333333333' and status = 'aktivna';

  select id, sessions_left into v_mid, v_before
  from membership where member_id = '33333333-3333-3333-3333-333333333333' and status = 'istekla'
  order by created_at desc limit 1;

  v_ck := create_checkin(
    p_member_id := '33333333-3333-3333-3333-333333333333',
    p_key_no := 1,
    p_allow_expired_override := true);

  select sessions_left into v_after from membership where id = v_mid;
  assert v_after = v_before - 1, 'sessions_left nije umanjen';
  assert (select decremented_session from checkin where id = v_ck), 'decremented_session false';
  assert (select membership_id from checkin where id = v_ck) = v_mid, 'membership_id pogresan';
  assert (select status from membership where id = v_mid) = 'istekla', 'status promenjen';

  select count(*) into v_sl_cnt from session_log where checkin_id = v_ck;
  assert v_sl_cnt = 0, 'session_log kreiran';

  perform void_checkin(v_ck);
  raise notice 'PASS scenario 1';
exception when others then
  raise warning 'FAIL scenario 1: %', sqlerrm;
end $$;

-- ===========================================================================
-- Scenario 2 — Solo Otvoreni aktivna+past, override=true → deduct + flip istekla
-- ===========================================================================
\echo '--- Scenario 2: solo aktivna+past override=true ---'
do $$
declare
  v_mid uuid;
  v_mtype bigint;
  v_ck uuid;
  v_before int;
begin
  update checkin set voided = true, updated_by = '11111111-1111-1111-1111-111111111111'
  where member_id = '33333333-3333-3333-3333-333333333333' and business_date = business_today() and not voided;

  update membership set status = 'istekla'
  where member_id = '33333333-3333-3333-3333-333333333333' and status in ('aktivna', 'pauzirana');

  update membership set sessions_left = 0
  where member_id = '33333333-3333-3333-3333-333333333333' and status = 'istekla';

  select mt.id into v_mtype
  from membership_type mt
  join training_category tc on tc.id = mt.training_category_id
  where tc.code = 'otvoreni' and mt.package = '8/1' and mt.active;

  perform record_payment(
    p_member_id := '33333333-3333-3333-3333-333333333333',
    p_membership_type_id := v_mtype,
    p_amount_rsd := offered_membership_price(v_mtype, '33333333-3333-3333-3333-333333333333'),
    p_start_mode := 'payment');

  update membership set end_date = business_today() - 1
  where member_id = '33333333-3333-3333-3333-333333333333' and status = 'aktivna';

  select id, sessions_left into v_mid, v_before
  from membership where member_id = '33333333-3333-3333-3333-333333333333' and status = 'aktivna'
  order by created_at desc limit 1;

  v_ck := create_checkin(
    p_member_id := '33333333-3333-3333-3333-333333333333',
    p_key_no := 2,
    p_allow_expired_override := true);

  assert (select sessions_left from membership where id = v_mid) = v_before - 1, 'nije umanjen';
  assert (select status from membership where id = v_mid) = 'istekla', 'nije flip u istekla';

  perform void_checkin(v_ck);
  raise notice 'PASS scenario 2';
exception when others then
  raise warning 'FAIL scenario 2: %', sqlerrm;
end $$;

-- ===========================================================================
-- Scenario 3 — Solo Otvoreni override=false → no deduction
-- ===========================================================================
\echo '--- Scenario 3: solo override=false ---'
do $$
declare
  v_mid uuid;
  v_mtype bigint;
  v_ck uuid;
  v_before int;
begin
  update checkin set voided = true, updated_by = '11111111-1111-1111-1111-111111111111'
  where member_id = '33333333-3333-3333-3333-333333333333' and business_date = business_today() and not voided;

  update membership set status = 'istekla'
  where member_id = '33333333-3333-3333-3333-333333333333' and status in ('aktivna', 'pauzirana');

  update membership set sessions_left = 0
  where member_id = '33333333-3333-3333-3333-333333333333' and status = 'istekla';

  select mt.id into v_mtype
  from membership_type mt
  join training_category tc on tc.id = mt.training_category_id
  where tc.code = 'otvoreni' and mt.package = '8/1' and mt.active;

  perform record_payment(
    p_member_id := '33333333-3333-3333-3333-333333333333',
    p_membership_type_id := v_mtype,
    p_amount_rsd := offered_membership_price(v_mtype, '33333333-3333-3333-3333-333333333333'),
    p_start_mode := 'payment');

  update membership set status = 'istekla', end_date = business_today() - 1
  where member_id = '33333333-3333-3333-3333-333333333333' and status = 'aktivna';

  select id, sessions_left into v_mid, v_before
  from membership where member_id = '33333333-3333-3333-3333-333333333333' and status = 'istekla'
  order by created_at desc limit 1;

  v_ck := create_checkin(
    p_member_id := '33333333-3333-3333-3333-333333333333',
    p_key_no := 3,
    p_allow_expired_override := false);

  assert (select sessions_left from membership where id = v_mid) = v_before, 'sessions_left promenjen';
  assert not (select decremented_session from checkin where id = v_ck), 'decremented_session true';

  perform void_checkin(v_ck);
  raise notice 'PASS scenario 3';
exception when others then
  raise warning 'FAIL scenario 3: %', sqlerrm;
end $$;

-- ===========================================================================
-- Scenario 4 — Trainer same category istekla, override=true → deduct + session_log
-- ===========================================================================
\echo '--- Scenario 4: trainer override=true ---'
do $$
declare
  v_mid uuid;
  v_mtype bigint;
  v_ck uuid;
  v_before int;
  v_trainer uuid;
  v_cat bigint;
  v_sl_cnt int;
begin
  update checkin set voided = true, updated_by = '11111111-1111-1111-1111-111111111111'
  where member_id = '33333333-3333-3333-3333-333333333333' and business_date = business_today() and not voided;

  update membership set status = 'istekla'
  where member_id = '33333333-3333-3333-3333-333333333333' and status in ('aktivna', 'pauzirana');

  update membership set sessions_left = 0
  where member_id = '33333333-3333-3333-3333-333333333333' and status = 'istekla';

  select mt.id into v_mtype
  from membership_type mt
  join training_category tc on tc.id = mt.training_category_id
  where tc.code = 'individualni' and mt.package = '8/1' and mt.active;

  perform record_payment(
    p_member_id := '33333333-3333-3333-3333-333333333333',
    p_membership_type_id := v_mtype,
    p_amount_rsd := offered_membership_price(v_mtype, '33333333-3333-3333-3333-333333333333'),
    p_start_mode := 'payment');

  update membership set status = 'istekla', end_date = business_today() - 1
  where member_id = '33333333-3333-3333-3333-333333333333' and status = 'aktivna';

  select id, sessions_left into v_mid, v_before
  from membership where member_id = '33333333-3333-3333-3333-333333333333' and status = 'istekla'
  order by created_at desc limit 1;

  select id into v_trainer from staff where active limit 1;
  select id into v_cat from training_category where code = 'individualni' and active;

  v_ck := create_checkin(
    p_member_id := '33333333-3333-3333-3333-333333333333',
    p_key_no := 4,
    p_with_trainer := true,
    p_training_category_id := v_cat,
    p_trainer_id := v_trainer,
    p_allow_expired_override := true);

  assert (select sessions_left from membership where id = v_mid) = v_before - 1, 'nije umanjen';
  assert (select decremented_session from checkin where id = v_ck), 'decremented_session false';
  assert (select membership_id from checkin where id = v_ck) = v_mid, 'membership_id pogresan';

  select count(*) into v_sl_cnt from session_log where checkin_id = v_ck;
  assert v_sl_cnt = 1, 'session_log nije kreiran';

  perform void_checkin(v_ck);
  raise notice 'PASS scenario 4';
exception when others then
  raise warning 'FAIL scenario 4: %', sqlerrm;
end $$;

-- ===========================================================================
-- Scenario 5 — Trainer override=false → reserved_session
-- ===========================================================================
\echo '--- Scenario 5: trainer override=false ---'
do $$
declare
  v_mid uuid;
  v_mtype bigint;
  v_ck uuid;
  v_trainer uuid;
  v_cat bigint;
  v_rs_cnt int;
begin
  update checkin set voided = true, updated_by = '11111111-1111-1111-1111-111111111111'
  where member_id = '33333333-3333-3333-3333-333333333333' and business_date = business_today() and not voided;

  update membership set status = 'istekla'
  where member_id = '33333333-3333-3333-3333-333333333333' and status in ('aktivna', 'pauzirana');

  update membership set sessions_left = 0
  where member_id = '33333333-3333-3333-3333-333333333333' and status = 'istekla';

  select mt.id into v_mtype
  from membership_type mt
  join training_category tc on tc.id = mt.training_category_id
  where tc.code = 'individualni' and mt.package = '8/1' and mt.active;

  perform record_payment(
    p_member_id := '33333333-3333-3333-3333-333333333333',
    p_membership_type_id := v_mtype,
    p_amount_rsd := offered_membership_price(v_mtype, '33333333-3333-3333-3333-333333333333'),
    p_start_mode := 'payment');

  update membership set status = 'istekla', end_date = business_today() - 1
  where member_id = '33333333-3333-3333-3333-333333333333' and status = 'aktivna';

  select id into v_mid from membership where member_id = '33333333-3333-3333-3333-333333333333' and status = 'istekla'
  order by created_at desc limit 1;

  select id into v_trainer from staff where active limit 1;
  select id into v_cat from training_category where code = 'individualni' and active;

  v_ck := create_checkin(
    p_member_id := '33333333-3333-3333-3333-333333333333',
    p_key_no := 5,
    p_with_trainer := true,
    p_training_category_id := v_cat,
    p_trainer_id := v_trainer,
    p_allow_expired_override := false);

  assert not (select decremented_session from checkin where id = v_ck), 'decremented_session true';
  select count(*) into v_rs_cnt from reserved_session where checkin_id = v_ck;
  assert v_rs_cnt = 1, 'reserved_session nije kreiran';

  perform void_checkin(v_ck);
  raise notice 'PASS scenario 5';
exception when others then
  raise warning 'FAIL scenario 5: %', sqlerrm;
end $$;

-- ===========================================================================
-- Scenario 6 — Trainer different category → reserved_session (no override consumption)
-- ===========================================================================
\echo '--- Scenario 6: trainer different category ---'
do $$
declare
  v_mid uuid;
  v_mtype bigint;
  v_ck uuid;
  v_before int;
  v_trainer uuid;
  v_cat_duo bigint;
  v_rs_cnt int;
begin
  update checkin set voided = true, updated_by = '11111111-1111-1111-1111-111111111111'
  where member_id = '33333333-3333-3333-3333-333333333333' and business_date = business_today() and not voided;

  update membership set status = 'istekla'
  where member_id = '33333333-3333-3333-3333-333333333333' and status in ('aktivna', 'pauzirana');

  update membership set sessions_left = 0
  where member_id = '33333333-3333-3333-3333-333333333333' and status = 'istekla';

  select mt.id into v_mtype
  from membership_type mt
  join training_category tc on tc.id = mt.training_category_id
  where tc.code = 'individualni' and mt.package = '8/1' and mt.active;

  perform record_payment(
    p_member_id := '33333333-3333-3333-3333-333333333333',
    p_membership_type_id := v_mtype,
    p_amount_rsd := offered_membership_price(v_mtype, '33333333-3333-3333-3333-333333333333'),
    p_start_mode := 'payment');

  update membership set status = 'istekla', end_date = business_today() - 1
  where member_id = '33333333-3333-3333-3333-333333333333' and status = 'aktivna';

  select id, sessions_left into v_mid, v_before
  from membership where member_id = '33333333-3333-3333-3333-333333333333' and status = 'istekla'
  order by created_at desc limit 1;

  select id into v_trainer from staff where active limit 1;
  select id into v_cat_duo from training_category where code = 'duo' and active;

  v_ck := create_checkin(
    p_member_id := '33333333-3333-3333-3333-333333333333',
    p_key_no := 6,
    p_with_trainer := true,
    p_training_category_id := v_cat_duo,
    p_trainer_id := v_trainer,
    p_allow_expired_override := true);

  assert (select sessions_left from membership where id = v_mid) = v_before, 'expired pkg consumed';
  select count(*) into v_rs_cnt from reserved_session where checkin_id = v_ck;
  assert v_rs_cnt = 1, 'reserved_session nije kreiran';

  perform void_checkin(v_ck);
  raise notice 'PASS scenario 6';
exception when others then
  raise warning 'FAIL scenario 6: %', sqlerrm;
end $$;

-- ===========================================================================
-- Scenario 7 — sessions_left=0 expired → no override
-- ===========================================================================
\echo '--- Scenario 7: sessions_left=0 ---'
do $$
declare
  v_mid uuid;
  v_mtype bigint;
  v_ck uuid;
  v_trainer uuid;
  v_cat bigint;
begin
  update checkin set voided = true, updated_by = '11111111-1111-1111-1111-111111111111'
  where member_id = '33333333-3333-3333-3333-333333333333' and business_date = business_today() and not voided;

  update membership set status = 'istekla'
  where member_id = '33333333-3333-3333-3333-333333333333' and status in ('aktivna', 'pauzirana');

  update membership set sessions_left = 0
  where member_id = '33333333-3333-3333-3333-333333333333' and status = 'istekla';

  select mt.id into v_mtype
  from membership_type mt
  join training_category tc on tc.id = mt.training_category_id
  where tc.code = 'individualni' and mt.package = '1/1' and mt.active;

  perform record_payment(
    p_member_id := '33333333-3333-3333-3333-333333333333',
    p_membership_type_id := v_mtype,
    p_amount_rsd := offered_membership_price(v_mtype, '33333333-3333-3333-3333-333333333333'),
    p_start_mode := 'payment');

  update membership set status = 'istekla', end_date = business_today() - 1, sessions_left = 0
  where member_id = '33333333-3333-3333-3333-333333333333' and status = 'aktivna';

  select id into v_mid from membership where member_id = '33333333-3333-3333-3333-333333333333' and status = 'istekla'
  order by created_at desc limit 1;

  select id into v_trainer from staff where active limit 1;
  select id into v_cat from training_category where code = 'individualni' and active;

  v_ck := create_checkin(
    p_member_id := '33333333-3333-3333-3333-333333333333',
    p_key_no := 7,
    p_with_trainer := true,
    p_training_category_id := v_cat,
    p_trainer_id := v_trainer,
    p_allow_expired_override := true);

  assert (select sessions_left from membership where id = v_mid) = 0, 'sessions_left promenjen';
  assert not (select decremented_session from checkin where id = v_ck), 'decremented_session true';

  perform void_checkin(v_ck);
  raise notice 'PASS scenario 7';
exception when others then
  raise warning 'FAIL scenario 7: %', sqlerrm;
end $$;

-- ===========================================================================
-- Scenario 8 — Time-based expired (30/1) → no override, arrival only
-- ===========================================================================
\echo '--- Scenario 8: time-based expired ---'
do $$
declare
  v_mid uuid;
  v_mtype bigint;
  v_ck uuid;
  v_before int;
begin
  update checkin set voided = true, updated_by = '11111111-1111-1111-1111-111111111111'
  where member_id = '33333333-3333-3333-3333-333333333333' and business_date = business_today() and not voided;

  update membership set status = 'istekla'
  where member_id = '33333333-3333-3333-3333-333333333333' and status in ('aktivna', 'pauzirana');

  update membership set sessions_left = 0
  where member_id = '33333333-3333-3333-3333-333333333333' and status = 'istekla';

  select mt.id into v_mtype
  from membership_type mt
  join training_category tc on tc.id = mt.training_category_id
  where tc.code = 'otvoreni' and mt.package = '30/1' and mt.active;

  perform record_payment(
    p_member_id := '33333333-3333-3333-3333-333333333333',
    p_membership_type_id := v_mtype,
    p_amount_rsd := offered_membership_price(v_mtype, '33333333-3333-3333-3333-333333333333'),
    p_start_mode := 'payment');

  update membership set status = 'istekla', end_date = business_today() - 1
  where member_id = '33333333-3333-3333-3333-333333333333' and status = 'aktivna';

  select id, sessions_left into v_mid, v_before
  from membership where member_id = '33333333-3333-3333-3333-333333333333' and status = 'istekla'
  order by created_at desc limit 1;

  v_ck := create_checkin(
    p_member_id := '33333333-3333-3333-3333-333333333333',
    p_key_no := 8,
    p_allow_expired_override := true);

  assert (select sessions_left from membership where id = v_mid) is not distinct from v_before, 'time-based sessions changed';
  assert not (select decremented_session from checkin where id = v_ck), 'decremented_session true';

  perform void_checkin(v_ck);
  raise notice 'PASS scenario 8';
exception when others then
  raise warning 'FAIL scenario 8: %', sqlerrm;
end $$;

-- ===========================================================================
-- Scenario 9 — void_checkin after override → sessions_left +1, status istekla
-- ===========================================================================
\echo '--- Scenario 9: void after override ---'
do $$
declare
  v_mid uuid;
  v_mtype bigint;
  v_ck uuid;
  v_before int;
  v_after_void int;
begin
  update checkin set voided = true, updated_by = '11111111-1111-1111-1111-111111111111'
  where member_id = '33333333-3333-3333-3333-333333333333' and business_date = business_today() and not voided;

  update membership set status = 'istekla'
  where member_id = '33333333-3333-3333-3333-333333333333' and status in ('aktivna', 'pauzirana');

  update membership set sessions_left = 0
  where member_id = '33333333-3333-3333-3333-333333333333' and status = 'istekla';

  select mt.id into v_mtype
  from membership_type mt
  join training_category tc on tc.id = mt.training_category_id
  where tc.code = 'otvoreni' and mt.package = '8/1' and mt.active;

  perform record_payment(
    p_member_id := '33333333-3333-3333-3333-333333333333',
    p_membership_type_id := v_mtype,
    p_amount_rsd := offered_membership_price(v_mtype, '33333333-3333-3333-3333-333333333333'),
    p_start_mode := 'payment');

  update membership set status = 'istekla', end_date = business_today() - 1
  where member_id = '33333333-3333-3333-3333-333333333333' and status = 'aktivna';

  select id, sessions_left into v_mid, v_before
  from membership where member_id = '33333333-3333-3333-3333-333333333333' and status = 'istekla'
  order by created_at desc limit 1;

  v_ck := create_checkin(
    p_member_id := '33333333-3333-3333-3333-333333333333',
    p_key_no := 9,
    p_allow_expired_override := true);

  perform void_checkin(v_ck);

  select sessions_left into v_after_void from membership where id = v_mid;
  assert v_after_void = v_before, 'sessions_left nije vracen';
  assert (select status from membership where id = v_mid) = 'istekla', 'status promenjen posle void';

  raise notice 'PASS scenario 9';
exception when others then
  raise warning 'FAIL scenario 9: %', sqlerrm;
end $$;

-- ===========================================================================
-- Scenario 10 — Paused membership → override never applies
-- ===========================================================================
\echo '--- Scenario 10: paused ---'
do $$
declare
  v_mid uuid;
  v_mtype bigint;
  v_ck uuid;
  v_before int;
begin
  update checkin set voided = true, updated_by = '11111111-1111-1111-1111-111111111111'
  where member_id = '33333333-3333-3333-3333-333333333333' and business_date = business_today() and not voided;

  update membership set status = 'istekla'
  where member_id = '33333333-3333-3333-3333-333333333333' and status in ('aktivna', 'pauzirana');

  update membership set sessions_left = 0
  where member_id = '33333333-3333-3333-3333-333333333333' and status = 'istekla';

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

  perform pause_membership(v_mid);

  v_ck := create_checkin(
    p_member_id := '33333333-3333-3333-3333-333333333333',
    p_key_no := 10,
    p_allow_expired_override := true);

  assert (select sessions_left from membership where id = v_mid) = v_before, 'sessions_left promenjen';
  assert not (select decremented_session from checkin where id = v_ck), 'decremented_session true';
  assert (select membership_id from checkin where id = v_ck) is null, 'membership_id nije null';

  perform void_checkin(v_ck);
  perform resume_membership(v_mid);
  raise notice 'PASS scenario 10';
exception when others then
  raise warning 'FAIL scenario 10: %', sqlerrm;
end $$;
