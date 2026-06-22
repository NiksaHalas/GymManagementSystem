-- Verifikacija open-visit guard GYM05 (20260622130000).
-- NE commitovati u migrations/. Pokretati na lokalnoj supabase bazi:
--   docker exec -i supabase_db_<proj> psql -U postgres -v ON_ERROR_STOP=0 < scripts/verify_open_visit_guard.sql
-- Pretpostavlja fixtures: worker 1111…, member 3333… (vidi setup).
-- Svaki scenario štampa PASS/FAIL. ON_ERROR_STOP=0 da expected-greške ne prekinu skriptu.

\set worker '11111111-1111-1111-1111-111111111111'
\set member '33333333-3333-3333-3333-333333333333'

set request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
set role authenticated;

-- ===========================================================================
-- Scenario 1 — Open visit with key → second create_checkin raises GYM05
-- ===========================================================================
\echo '--- Scenario 1: GYM05 with key ---'
do $$
declare
  v_ck1 uuid;
  v_ck2 uuid;
  v_err text;
  v_state text;
begin
  -- Cleanup any prior open visits for today.
  update checkin
  set voided = true, updated_by = '11111111-1111-1111-1111-111111111111'
  where member_id = '33333333-3333-3333-3333-333333333333'
    and business_date = business_today()
    and not voided;

  v_ck1 := create_checkin(
    p_member_id := '33333333-3333-3333-3333-333333333333',
    p_key_no := 1);

  begin
    v_ck2 := create_checkin(
      p_member_id := '33333333-3333-3333-3333-333333333333',
      p_key_no := 2);
    raise exception 'drugi check-in trebalo da padne';
  exception when others then
    v_err := sqlerrm;
    get stacked diagnostics v_state = returned_sqlstate;
    assert v_state = 'GYM05', 'pogresan sqlstate: ' || v_state;
    assert v_err like '%ključ 1%', 'poruka ne sadrži ključ: ' || v_err;
  end;

  perform void_checkin(v_ck1);
  raise notice 'PASS scenario 1';
exception when others then
  raise warning 'FAIL scenario 1: %', sqlerrm;
end $$;

-- ===========================================================================
-- Scenario 2 — After markLeft → new create_checkin passes
-- ===========================================================================
\echo '--- Scenario 2: after markLeft ---'
do $$
declare
  v_ck1 uuid;
  v_ck2 uuid;
begin
  update checkin
  set voided = true, updated_by = '11111111-1111-1111-1111-111111111111'
  where member_id = '33333333-3333-3333-3333-333333333333'
    and business_date = business_today()
    and not voided;

  v_ck1 := create_checkin(
    p_member_id := '33333333-3333-3333-3333-333333333333',
    p_key_no := 3);

  update checkin
  set key_returned = true,
      checked_out_at = now(),
      updated_by = '11111111-1111-1111-1111-111111111111'
  where id = v_ck1;

  v_ck2 := create_checkin(
    p_member_id := '33333333-3333-3333-3333-333333333333',
    p_key_no := 4);

  assert v_ck2 is not null, 'drugi check-in nije prošao posle Otišao';

  perform void_checkin(v_ck2);
  raise notice 'PASS scenario 2';
exception when others then
  raise warning 'FAIL scenario 2: %', sqlerrm;
end $$;

-- ===========================================================================
-- Scenario 3 — Open visit without key → GYM05 (message contains "bez ključa")
-- ===========================================================================
\echo '--- Scenario 3: GYM05 bez ključa ---'
do $$
declare
  v_ck1 uuid;
  v_err text;
  v_state text;
begin
  update checkin
  set voided = true, updated_by = '11111111-1111-1111-1111-111111111111'
  where member_id = '33333333-3333-3333-3333-333333333333'
    and business_date = business_today()
    and not voided;

  v_ck1 := create_checkin(
    p_member_id := '33333333-3333-3333-3333-333333333333',
    p_key_no := null);

  begin
    perform create_checkin(
      p_member_id := '33333333-3333-3333-3333-333333333333',
      p_key_no := 5);
    raise exception 'drugi check-in trebalo da padne';
  exception when others then
    v_err := sqlerrm;
    get stacked diagnostics v_state = returned_sqlstate;
    assert v_state = 'GYM05', 'pogresan sqlstate: ' || v_state;
    assert v_err like '%bez ključa%', 'poruka ne sadrži bez ključa: ' || v_err;
  end;

  perform void_checkin(v_ck1);
  raise notice 'PASS scenario 3';
exception when others then
  raise warning 'FAIL scenario 3: %', sqlerrm;
end $$;

-- ===========================================================================
-- Scenario 4 — Fitpass bypasses guard (member has open visit, Fitpass still passes)
-- ===========================================================================
\echo '--- Scenario 4: Fitpass bypass ---'
do $$
declare
  v_ck_member uuid;
  v_ck_fitpass uuid;
begin
  update checkin
  set voided = true, updated_by = '11111111-1111-1111-1111-111111111111'
  where member_id = '33333333-3333-3333-3333-333333333333'
    and business_date = business_today()
    and not voided;

  v_ck_member := create_checkin(
    p_member_id := '33333333-3333-3333-3333-333333333333',
    p_key_no := 6);

  v_ck_fitpass := create_checkin(
    p_key_no := 7,
    p_is_fitpass := true);

  assert v_ck_fitpass is not null, 'Fitpass check-in nije prošao';

  perform void_checkin(v_ck_fitpass);
  perform void_checkin(v_ck_member);
  raise notice 'PASS scenario 4';
exception when others then
  raise warning 'FAIL scenario 4: %', sqlerrm;
end $$;

-- ===========================================================================
-- Scenario 5 — Paused member + open visit → GYM05
-- ===========================================================================
\echo '--- Scenario 5: paused + GYM05 ---'
do $$
declare
  v_mid uuid;
  v_ck1 uuid;
  v_err text;
  v_state text;
begin
  update checkin
  set voided = true, updated_by = '11111111-1111-1111-1111-111111111111'
  where member_id = '33333333-3333-3333-3333-333333333333'
    and business_date = business_today()
    and not voided;

  select id into v_mid from membership
  where member_id = '33333333-3333-3333-3333-333333333333'
    and status in ('aktivna', 'pauzirana')
  order by created_at desc limit 1;

  if v_mid is null then
    raise notice 'SKIP scenario 5 (no membership)';
    return;
  end if;

  if (select status from membership where id = v_mid) = 'pauzirana' then
    perform resume_membership(v_mid);
  end if;

  perform pause_membership(v_mid);

  v_ck1 := create_checkin(
    p_member_id := '33333333-3333-3333-3333-333333333333',
    p_key_no := 8);

  begin
    perform create_checkin(
      p_member_id := '33333333-3333-3333-3333-333333333333',
      p_key_no := 9);
    raise exception 'drugi check-in trebalo da padne';
  exception when others then
    v_err := sqlerrm;
    get stacked diagnostics v_state = returned_sqlstate;
    assert v_state = 'GYM05', 'pogresan sqlstate: ' || v_state;
  end;

  perform void_checkin(v_ck1);
  perform resume_membership(v_mid);
  raise notice 'PASS scenario 5';
exception when others then
  raise warning 'FAIL scenario 5: %', sqlerrm;
end $$;

-- ===========================================================================
-- Scenario 6 — Solo open visit → trainer check-in also blocked (GYM05)
-- ===========================================================================
\echo '--- Scenario 6: solo open → trainer GYM05 ---'
do $$
declare
  v_ck1 uuid;
  v_trainer uuid;
  v_cat bigint;
  v_err text;
  v_state text;
begin
  update checkin
  set voided = true, updated_by = '11111111-1111-1111-1111-111111111111'
  where member_id = '33333333-3333-3333-3333-333333333333'
    and business_date = business_today()
    and not voided;

  v_ck1 := create_checkin(
    p_member_id := '33333333-3333-3333-3333-333333333333',
    p_key_no := 12);

  select id into v_trainer from staff where active limit 1;
  select id into v_cat from training_category where active and is_trainer_based limit 1;

  begin
    perform create_checkin(
      p_member_id := '33333333-3333-3333-3333-333333333333',
      p_key_no := 13,
      p_with_trainer := true,
      p_training_category_id := v_cat,
      p_trainer_id := v_trainer);
    raise exception 'trainer check-in trebalo da padne';
  exception when others then
    v_err := sqlerrm;
    get stacked diagnostics v_state = returned_sqlstate;
    assert v_state = 'GYM05', 'pogresan sqlstate: ' || v_state;
  end;

  perform void_checkin(v_ck1);
  raise notice 'PASS scenario 6';
exception when others then
  raise warning 'FAIL scenario 6: %', sqlerrm;
end $$;
