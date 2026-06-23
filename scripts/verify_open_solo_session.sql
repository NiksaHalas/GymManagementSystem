-- Verifikacija solo auto-skidanje sesija za Otvoreni tip (20260622140000).
-- NE commitovati u migrations/. Pokretati na lokalnoj supabase bazi:
--   docker exec -i supabase_db_<proj> psql -U postgres -v ON_ERROR_STOP=0 < scripts/verify_open_solo_session.sql
-- Pretpostavlja fixtures: worker 1111…, member 3333… (vidi setup).
-- Svaki scenario štampa PASS/FAIL. ON_ERROR_STOP=0 da expected-greške ne prekinu skriptu.

\set worker '11111111-1111-1111-1111-111111111111'
\set member '33333333-3333-3333-3333-333333333333'

set request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
set role authenticated;

-- ===========================================================================
-- Scenario 1 — Solo Otvoreni 8/1 (sessions_left>0) → −1, decremented_session, no session_log/reserved
-- ===========================================================================
\echo '--- Scenario 1: solo Otvoreni 8/1 ---'
do $$
declare
  v_mid uuid;
  v_mtype bigint;
  v_ck uuid;
  v_before int;
  v_after int;
  v_sl_cnt int;
  v_rs_cnt int;
begin
  update checkin
  set voided = true, updated_by = '11111111-1111-1111-1111-111111111111'
  where member_id = '33333333-3333-3333-3333-333333333333'
    and business_date = business_today()
    and not voided;

  update membership
  set status = 'istekla'
  where member_id = '33333333-3333-3333-3333-333333333333'
    and status in ('aktivna', 'pauzirana');

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
  from membership
  where member_id = '33333333-3333-3333-3333-333333333333'
    and status = 'aktivna'
  order by created_at desc limit 1;

  assert v_before > 0, 'sessions_left mora biti > 0';

  v_ck := create_checkin(
    p_member_id := '33333333-3333-3333-3333-333333333333',
    p_key_no := 11);

  select sessions_left into v_after from membership where id = v_mid;
  assert v_after = v_before - 1, 'sessions_left nije umanjen';
  assert (select decremented_session from checkin where id = v_ck), 'decremented_session false';
  assert (select membership_id from checkin where id = v_ck) = v_mid, 'membership_id pogresan';

  select count(*) into v_sl_cnt from session_log where checkin_id = v_ck;
  assert v_sl_cnt = 0, 'session_log kreiran';

  select count(*) into v_rs_cnt from reserved_session where checkin_id = v_ck;
  assert v_rs_cnt = 0, 'reserved_session kreiran';

  perform void_checkin(v_ck);
  raise notice 'PASS scenario 1';
exception when others then
  raise warning 'FAIL scenario 1: %', sqlerrm;
end $$;

-- ===========================================================================
-- Scenario 2 — Solo Otvoreni 12/1 → −1
-- ===========================================================================
\echo '--- Scenario 2: solo Otvoreni 12/1 ---'
do $$
declare
  v_mid uuid;
  v_mtype bigint;
  v_ck uuid;
  v_before int;
  v_after int;
begin
  update checkin
  set voided = true, updated_by = '11111111-1111-1111-1111-111111111111'
  where member_id = '33333333-3333-3333-3333-333333333333'
    and business_date = business_today()
    and not voided;

  update membership
  set status = 'istekla'
  where member_id = '33333333-3333-3333-3333-333333333333'
    and status in ('aktivna', 'pauzirana');

  select mt.id into v_mtype
  from membership_type mt
  join training_category tc on tc.id = mt.training_category_id
  where tc.code = 'otvoreni' and mt.package = '12/1' and mt.active;

  perform record_payment(
    p_member_id := '33333333-3333-3333-3333-333333333333',
    p_membership_type_id := v_mtype,
    p_amount_rsd := offered_membership_price(v_mtype, '33333333-3333-3333-3333-333333333333'),
    p_start_mode := 'payment');

  select id, sessions_left into v_mid, v_before
  from membership
  where member_id = '33333333-3333-3333-3333-333333333333'
    and status = 'aktivna'
  order by created_at desc limit 1;

  v_ck := create_checkin(
    p_member_id := '33333333-3333-3333-3333-333333333333',
    p_key_no := 12);

  select sessions_left into v_after from membership where id = v_mid;
  assert v_after = v_before - 1, 'sessions_left nije umanjen';

  perform void_checkin(v_ck);
  raise notice 'PASS scenario 2';
exception when others then
  raise warning 'FAIL scenario 2: %', sqlerrm;
end $$;

-- ===========================================================================
-- Scenario 3 — Solo Otvoreni 1/1 (1→0) → −1, sessions_left=0
-- ===========================================================================
\echo '--- Scenario 3: solo Otvoreni 1/1 ---'
do $$
declare
  v_mid uuid;
  v_mtype bigint;
  v_ck uuid;
  v_after int;
begin
  update checkin
  set voided = true, updated_by = '11111111-1111-1111-1111-111111111111'
  where member_id = '33333333-3333-3333-3333-333333333333'
    and business_date = business_today()
    and not voided;

  update membership
  set status = 'istekla'
  where member_id = '33333333-3333-3333-3333-333333333333'
    and status in ('aktivna', 'pauzirana');

  select mt.id into v_mtype
  from membership_type mt
  join training_category tc on tc.id = mt.training_category_id
  where tc.code = 'otvoreni' and mt.package = '1/1' and mt.active;

  perform record_payment(
    p_member_id := '33333333-3333-3333-3333-333333333333',
    p_membership_type_id := v_mtype,
    p_amount_rsd := offered_membership_price(v_mtype, '33333333-3333-3333-3333-333333333333'),
    p_start_mode := 'payment');

  select id into v_mid
  from membership
  where member_id = '33333333-3333-3333-3333-333333333333'
    and status = 'aktivna'
  order by created_at desc limit 1;

  assert (select sessions_left from membership where id = v_mid) = 1, 'start mora biti 1 sesija';

  v_ck := create_checkin(
    p_member_id := '33333333-3333-3333-3333-333333333333',
    p_key_no := 13);

  select sessions_left into v_after from membership where id = v_mid;
  assert v_after = 0, 'sessions_left nije 0';
  assert (select decremented_session from checkin where id = v_ck), 'decremented_session false';

  perform void_checkin(v_ck);
  raise notice 'PASS scenario 3';
exception when others then
  raise warning 'FAIL scenario 3: %', sqlerrm;
end $$;

-- ===========================================================================
-- Scenario 4 — Solo Otvoreni 30/1 (time-based) → bez skidanja
-- ===========================================================================
\echo '--- Scenario 4: solo Otvoreni 30/1 time-based ---'
do $$
declare
  v_mid uuid;
  v_mtype bigint;
  v_ck uuid;
  v_before int;
  v_after int;
begin
  update checkin
  set voided = true, updated_by = '11111111-1111-1111-1111-111111111111'
  where member_id = '33333333-3333-3333-3333-333333333333'
    and business_date = business_today()
    and not voided;

  update membership
  set status = 'istekla'
  where member_id = '33333333-3333-3333-3333-333333333333'
    and status in ('aktivna', 'pauzirana');

  select mt.id into v_mtype
  from membership_type mt
  join training_category tc on tc.id = mt.training_category_id
  where tc.code = 'otvoreni' and mt.package = '30/1' and mt.active;

  perform record_payment(
    p_member_id := '33333333-3333-3333-3333-333333333333',
    p_membership_type_id := v_mtype,
    p_amount_rsd := offered_membership_price(v_mtype, '33333333-3333-3333-3333-333333333333'),
    p_start_mode := 'payment');

  select id, sessions_left into v_mid, v_before
  from membership
  where member_id = '33333333-3333-3333-3333-333333333333'
    and status = 'aktivna'
  order by created_at desc limit 1;

  v_ck := create_checkin(
    p_member_id := '33333333-3333-3333-3333-333333333333',
    p_key_no := 14);

  select sessions_left into v_after from membership where id = v_mid;
  assert v_after is not distinct from v_before, 'sessions_left promenjen na time-based';
  assert not (select decremented_session from checkin where id = v_ck), 'decremented_session true';

  perform void_checkin(v_ck);
  raise notice 'PASS scenario 4';
exception when others then
  raise warning 'FAIL scenario 4: %', sqlerrm;
end $$;

-- ===========================================================================
-- Scenario 5 — Solo Kardio 30/1 → bez skidanja
-- ===========================================================================
\echo '--- Scenario 5: solo Kardio 30/1 ---'
do $$
declare
  v_mid uuid;
  v_mtype bigint;
  v_ck uuid;
  v_before int;
  v_after int;
begin
  update checkin
  set voided = true, updated_by = '11111111-1111-1111-1111-111111111111'
  where member_id = '33333333-3333-3333-3333-333333333333'
    and business_date = business_today()
    and not voided;

  update membership
  set status = 'istekla'
  where member_id = '33333333-3333-3333-3333-333333333333'
    and status in ('aktivna', 'pauzirana');

  select mt.id into v_mtype
  from membership_type mt
  join training_category tc on tc.id = mt.training_category_id
  where tc.code = 'kardio' and mt.package = '30/1' and mt.active;

  perform record_payment(
    p_member_id := '33333333-3333-3333-3333-333333333333',
    p_membership_type_id := v_mtype,
    p_amount_rsd := offered_membership_price(v_mtype, '33333333-3333-3333-3333-333333333333'),
    p_start_mode := 'payment');

  select id, sessions_left into v_mid, v_before
  from membership
  where member_id = '33333333-3333-3333-3333-333333333333'
    and status = 'aktivna'
  order by created_at desc limit 1;

  v_ck := create_checkin(
    p_member_id := '33333333-3333-3333-3333-333333333333',
    p_key_no := 15);

  select sessions_left into v_after from membership where id = v_mid;
  assert v_after is not distinct from v_before, 'sessions_left promenjen na kardio';
  assert not (select decremented_session from checkin where id = v_ck), 'decremented_session true';

  perform void_checkin(v_ck);
  raise notice 'PASS scenario 5';
exception when others then
  raise warning 'FAIL scenario 5: %', sqlerrm;
end $$;

-- ===========================================================================
-- Scenario 6 — Solo Otvoreni sa sessions_left=0 → dolazak bez skidanja
-- ===========================================================================
\echo '--- Scenario 6: solo Otvoreni 0 sesija ---'
do $$
declare
  v_mid uuid;
  v_mtype bigint;
  v_ck uuid;
  v_rs_cnt int;
begin
  update checkin
  set voided = true, updated_by = '11111111-1111-1111-1111-111111111111'
  where member_id = '33333333-3333-3333-3333-333333333333'
    and business_date = business_today()
    and not voided;

  update membership
  set status = 'istekla'
  where member_id = '33333333-3333-3333-3333-333333333333'
    and status in ('aktivna', 'pauzirana');

  select mt.id into v_mtype
  from membership_type mt
  join training_category tc on tc.id = mt.training_category_id
  where tc.code = 'otvoreni' and mt.package = '8/1' and mt.active;

  perform record_payment(
    p_member_id := '33333333-3333-3333-3333-333333333333',
    p_membership_type_id := v_mtype,
    p_amount_rsd := offered_membership_price(v_mtype, '33333333-3333-3333-3333-333333333333'),
    p_start_mode := 'payment');

  select id into v_mid
  from membership
  where member_id = '33333333-3333-3333-3333-333333333333'
    and status = 'aktivna'
  order by created_at desc limit 1;

  update membership set sessions_left = 0 where id = v_mid;

  v_ck := create_checkin(
    p_member_id := '33333333-3333-3333-3333-333333333333',
    p_key_no := 16);

  assert (select sessions_left from membership where id = v_mid) = 0, 'sessions_left promenjen';
  assert not (select decremented_session from checkin where id = v_ck), 'decremented_session true';

  select count(*) into v_rs_cnt from reserved_session where checkin_id = v_ck;
  assert v_rs_cnt = 0, 'reserved_session kreiran';

  perform void_checkin(v_ck);
  raise notice 'PASS scenario 6';
exception when others then
  raise warning 'FAIL scenario 6: %', sqlerrm;
end $$;

-- ===========================================================================
-- Scenario 7 — First-visit Otvoreni 8/1 → start/end set I sessions_left −1
-- ===========================================================================
\echo '--- Scenario 7: first-visit solo Otvoreni 8/1 ---'
do $$
declare
  v_mid uuid;
  v_mtype bigint;
  v_ck uuid;
  v_mt membership_type%rowtype;
  v_m membership%rowtype;
begin
  update checkin
  set voided = true, updated_by = '11111111-1111-1111-1111-111111111111'
  where member_id = '33333333-3333-3333-3333-333333333333'
    and business_date = business_today()
    and not voided;

  update membership
  set status = 'istekla'
  where member_id = '33333333-3333-3333-3333-333333333333'
    and status in ('aktivna', 'pauzirana');

  select mt.id into v_mtype
  from membership_type mt
  join training_category tc on tc.id = mt.training_category_id
  where tc.code = 'otvoreni' and mt.package = '8/1' and mt.active;

  select * into v_mt from membership_type where id = v_mtype;

  insert into membership (
    member_id, membership_type_id, start_mode, start_date, end_date,
    sessions_total, sessions_left, status, created_by, updated_by
  ) values (
    '33333333-3333-3333-3333-333333333333', v_mtype, 'first_visit', null, null,
    v_mt.sessions, v_mt.sessions, 'aktivna',
    '11111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111')
  returning id into v_mid;

  v_ck := create_checkin(
    p_member_id := '33333333-3333-3333-3333-333333333333',
    p_key_no := 17);

  select * into v_m from membership where id = v_mid;
  assert v_m.start_date = business_today(), 'start_date nije setovan';
  assert v_m.end_date = business_today() + (v_mt.duration_days - 1), 'end_date pogresan';
  assert v_m.sessions_left = coalesce(v_mt.sessions, 0) - 1, 'sessions_left nije umanjen';

  perform void_checkin(v_ck);
  raise notice 'PASS scenario 7';
exception when others then
  raise warning 'FAIL scenario 7: %', sqlerrm;
end $$;

-- ===========================================================================
-- Scenario 8 — void_checkin na solo-skinuti dolazak → sessions_left +1
-- ===========================================================================
\echo '--- Scenario 8: void restores solo session ---'
do $$
declare
  v_mid uuid;
  v_mtype bigint;
  v_ck uuid;
  v_before int;
  v_after int;
begin
  update checkin
  set voided = true, updated_by = '11111111-1111-1111-1111-111111111111'
  where member_id = '33333333-3333-3333-3333-333333333333'
    and business_date = business_today()
    and not voided;

  update membership
  set status = 'istekla'
  where member_id = '33333333-3333-3333-3333-333333333333'
    and status in ('aktivna', 'pauzirana');

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
  from membership
  where member_id = '33333333-3333-3333-3333-333333333333'
    and status = 'aktivna'
  order by created_at desc limit 1;

  v_ck := create_checkin(
    p_member_id := '33333333-3333-3333-3333-333333333333',
    p_key_no := 18);

  assert (select sessions_left from membership where id = v_mid) = v_before - 1, 'nije skinuto';

  perform void_checkin(v_ck);

  select sessions_left into v_after from membership where id = v_mid;
  assert v_after = v_before, 'void nije vratio sesiju';

  raise notice 'PASS scenario 8';
exception when others then
  raise warning 'FAIL scenario 8: %', sqlerrm;
end $$;

-- ===========================================================================
-- Scenario 9 — Pauzirana Otvoreni session → solo bez efekata
-- ===========================================================================
\echo '--- Scenario 9: paused Otvoreni solo ---'
do $$
declare
  v_mid uuid;
  v_mtype bigint;
  v_ck uuid;
  v_before int;
  v_after int;
begin
  update checkin
  set voided = true, updated_by = '11111111-1111-1111-1111-111111111111'
  where member_id = '33333333-3333-3333-3333-333333333333'
    and business_date = business_today()
    and not voided;

  update membership
  set status = 'istekla'
  where member_id = '33333333-3333-3333-3333-333333333333'
    and status in ('aktivna', 'pauzirana');

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
  from membership
  where member_id = '33333333-3333-3333-3333-333333333333'
    and status = 'aktivna'
  order by created_at desc limit 1;

  perform pause_membership(v_mid);

  v_ck := create_checkin(
    p_member_id := '33333333-3333-3333-3333-333333333333',
    p_key_no := 19);

  assert (select membership_id from checkin where id = v_ck) is null, 'membership_id nije null';
  assert not (select decremented_session from checkin where id = v_ck), 'decremented_session true';

  select sessions_left into v_after from membership where id = v_mid;
  assert v_after = v_before, 'sessions_left promenjen dok pauzirano';

  perform void_checkin(v_ck);
  perform resume_membership(v_mid);
  raise notice 'PASS scenario 9';
exception when others then
  raise warning 'FAIL scenario 9: %', sqlerrm;
end $$;

-- ===========================================================================
-- Scenario 10 — Dva solo dolaska istog dana → −2 (Otišao između)
-- ===========================================================================
\echo '--- Scenario 10: dva solo dolaska ---'
do $$
declare
  v_mid uuid;
  v_mtype bigint;
  v_ck1 uuid;
  v_ck2 uuid;
  v_before int;
  v_after int;
begin
  update checkin
  set voided = true, updated_by = '11111111-1111-1111-1111-111111111111'
  where member_id = '33333333-3333-3333-3333-333333333333'
    and business_date = business_today()
    and not voided;

  update membership
  set status = 'istekla'
  where member_id = '33333333-3333-3333-3333-333333333333'
    and status in ('aktivna', 'pauzirana');

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
  from membership
  where member_id = '33333333-3333-3333-3333-333333333333'
    and status = 'aktivna'
  order by created_at desc limit 1;

  v_ck1 := create_checkin(
    p_member_id := '33333333-3333-3333-3333-333333333333',
    p_key_no := 20);

  update checkin
  set key_returned = true,
      checked_out_at = now(),
      updated_by = '11111111-1111-1111-1111-111111111111'
  where id = v_ck1;

  v_ck2 := create_checkin(
    p_member_id := '33333333-3333-3333-3333-333333333333',
    p_key_no := 21);

  select sessions_left into v_after from membership where id = v_mid;
  assert v_after = v_before - 2, 'ukupno nije −2 sesije';

  perform void_checkin(v_ck2);
  perform void_checkin(v_ck1);
  raise notice 'PASS scenario 10';
exception when others then
  raise warning 'FAIL scenario 10: %', sqlerrm;
end $$;

-- ===========================================================================
-- Scenario 11 — Trener-tick na Otvoreni session → reserved_session, bez Open deduct
-- ===========================================================================
\echo '--- Scenario 11: trainer tick on Otvoreni ---'
do $$
declare
  v_mid uuid;
  v_mtype bigint;
  v_ck uuid;
  v_before int;
  v_after int;
  v_trainer uuid;
  v_cat bigint;
  v_rs_cnt int;
begin
  update checkin
  set voided = true, updated_by = '11111111-1111-1111-1111-111111111111'
  where member_id = '33333333-3333-3333-3333-333333333333'
    and business_date = business_today()
    and not voided;

  update membership
  set status = 'istekla'
  where member_id = '33333333-3333-3333-3333-333333333333'
    and status in ('aktivna', 'pauzirana');

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
  from membership
  where member_id = '33333333-3333-3333-3333-333333333333'
    and status = 'aktivna'
  order by created_at desc limit 1;

  select id into v_trainer from staff where active limit 1;
  select id into v_cat from training_category where active and is_trainer_based limit 1;

  v_ck := create_checkin(
    p_member_id := '33333333-3333-3333-3333-333333333333',
    p_key_no := 22,
    p_with_trainer := true,
    p_training_category_id := v_cat,
    p_trainer_id := v_trainer);

  select sessions_left into v_after from membership where id = v_mid;
  assert v_after = v_before, 'Open sessions_left promenjen na trener dolasku';
  assert (select membership_id from checkin where id = v_ck) is null, 'membership_id nije null';
  assert not (select decremented_session from checkin where id = v_ck), 'decremented_session true';

  select count(*) into v_rs_cnt from reserved_session where checkin_id = v_ck;
  assert v_rs_cnt = 1, 'reserved_session nije kreiran';

  perform void_checkin(v_ck);
  raise notice 'PASS scenario 11';
exception when others then
  raise warning 'FAIL scenario 11: %', sqlerrm;
end $$;
