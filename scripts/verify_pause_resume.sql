-- Verifikacija pause / resume membership (20260622120000).
-- NE commitovati u migrations/. Pokretati na lokalnoj supabase bazi:
--   docker exec -i supabase_db_<proj> psql -U postgres -v ON_ERROR_STOP=0 < scripts/verify_pause_resume.sql
-- Pretpostavlja fixtures: worker 1111…, member 3333… (vidi setup).
-- Svaki scenario štampa PASS/FAIL. ON_ERROR_STOP=0 da expected-greške ne prekinu skriptu.

\set worker '11111111-1111-1111-1111-111111111111'
\set member '33333333-3333-3333-3333-333333333333'

set request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
set role authenticated;

-- ===========================================================================
-- Scenario 1 — Pause sets status + paused_at
-- ===========================================================================
\echo '--- Scenario 1: pause ---'
do $$
declare
  v_mid uuid;
  v_row membership%rowtype;
  v_mtype bigint;
  v_offered int;
begin
  -- Ensure an active membership with start_date.
  select id into v_mid from membership
  where member_id = '33333333-3333-3333-3333-333333333333'
    and status in ('aktivna', 'pauzirana')
  order by created_at desc limit 1;

  if v_mid is null then
    select id into v_mtype from membership_type where active and duration_days > 1 limit 1;
    v_offered := offered_membership_price(v_mtype, '33333333-3333-3333-3333-333333333333');
    perform record_payment(
      p_member_id := '33333333-3333-3333-3333-333333333333',
      p_membership_type_id := v_mtype,
      p_amount_rsd := v_offered,
      p_start_mode := 'payment');
    select id into v_mid from membership
    where member_id = '33333333-3333-3333-3333-333333333333'
      and status = 'aktivna'
    order by created_at desc limit 1;
  else
    -- Resume if left paused from a prior run.
    if (select status from membership where id = v_mid) = 'pauzirana' then
      perform resume_membership(v_mid);
    end if;
  end if;

  assert v_mid is not null, 'nema membership za test';

  perform pause_membership(v_mid);

  select * into v_row from membership where id = v_mid;
  assert v_row.status = 'pauzirana', 'status nije pauzirana';
  assert v_row.paused_at is not null, 'paused_at nije setovan';

  perform resume_membership(v_mid);
  raise notice 'PASS scenario 1';
exception when others then
  raise warning 'FAIL scenario 1: %', sqlerrm;
end $$;

-- ===========================================================================
-- Scenario 2 — Same-day pause→resume = 0 days added to end_date
-- ===========================================================================
\echo '--- Scenario 2: same-day pause/resume ---'
do $$
declare
  v_mid uuid;
  v_end_before date;
  v_paused_before int;
  v_end_after date;
  v_paused_after int;
begin
  select id, end_date, paused_days into v_mid, v_end_before, v_paused_before
  from membership
  where member_id = '33333333-3333-3333-3333-333333333333'
    and status = 'aktivna'
  order by created_at desc limit 1;

  if v_mid is null then
    raise notice 'SKIP scenario 2 (no active membership)';
    return;
  end if;

  perform pause_membership(v_mid);
  perform resume_membership(v_mid);

  select end_date, paused_days into v_end_after, v_paused_after
  from membership where id = v_mid;

  assert v_end_after = v_end_before, 'end_date se promenio na same-day';
  assert v_paused_after = v_paused_before, 'paused_days se promenio na same-day';

  raise notice 'PASS scenario 2';
exception when others then
  raise warning 'FAIL scenario 2: %', sqlerrm;
end $$;

-- ===========================================================================
-- Scenario 3 — Check-in while paused: membership_id NULL, no side effects
-- ===========================================================================
\echo '--- Scenario 3: check-in while paused ---'
do $$
declare
  v_mid uuid;
  v_ck uuid;
  v_sessions_before int;
  v_sessions_after int;
  v_sl_cnt int;
  v_rs_cnt int;
  v_trainer uuid;
  v_cat bigint;
begin
  select id, sessions_left into v_mid, v_sessions_before
  from membership
  where member_id = '33333333-3333-3333-3333-333333333333'
    and status = 'aktivna'
  order by created_at desc limit 1;

  if v_mid is null then
    raise notice 'SKIP scenario 3 (no active membership)';
    return;
  end if;

  perform pause_membership(v_mid);

  select id into v_trainer from staff where active limit 1;
  select id into v_cat from training_category where active and is_trainer_based limit 1;

  v_ck := create_checkin(
    p_member_id := '33333333-3333-3333-3333-333333333333',
    p_key_no := 10,
    p_with_trainer := true,
    p_training_category_id := v_cat,
    p_trainer_id := v_trainer);

  assert (select membership_id from checkin where id = v_ck) is null, 'membership_id nije null';
  assert not (select decremented_session from checkin where id = v_ck), 'decremented_session true';

  select count(*) into v_sl_cnt from session_log where checkin_id = v_ck;
  assert v_sl_cnt = 0, 'session_log kreiran';

  select count(*) into v_rs_cnt from reserved_session where checkin_id = v_ck;
  assert v_rs_cnt = 0, 'reserved_session kreiran';

  select sessions_left into v_sessions_after from membership where id = v_mid;
  assert v_sessions_after = v_sessions_before, 'sessions_left promenjen';

  perform void_checkin(v_ck);
  perform resume_membership(v_mid);

  raise notice 'PASS scenario 3';
exception when others then
  raise warning 'FAIL scenario 3: %', sqlerrm;
end $$;

-- ===========================================================================
-- Scenario 4 — GYM03: cannot pause first-visit (unactivated) membership
-- ===========================================================================
\echo '--- Scenario 4: GYM03 first-visit guard ---'
do $$
declare
  v_mid uuid;
  v_mtype bigint;
  v_existing uuid;
  v_existing_status membership_status;
  v_err text;
  v_state text;
begin
  select id, status into v_existing, v_existing_status
  from membership
  where member_id = '33333333-3333-3333-3333-333333333333'
    and status in ('aktivna', 'pauzirana')
  order by created_at desc limit 1;

  if v_existing is not null then
    update membership set status = 'istekla' where id = v_existing;
  end if;

  select id into v_mtype from membership_type where active limit 1;

  insert into membership (
    member_id, membership_type_id, start_mode, start_date, end_date,
    sessions_total, sessions_left, status, created_by, updated_by
  ) values (
    '33333333-3333-3333-3333-333333333333', v_mtype, 'first_visit', null, null,
    8, 8, 'aktivna', '11111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111')
  returning id into v_mid;

  begin
    perform pause_membership(v_mid);
    raise exception 'pause trebalo da padne';
  exception when others then
    v_err := sqlerrm;
    get stacked diagnostics v_state = returned_sqlstate;
    assert v_state = 'GYM03', 'pogresan sqlstate: ' || v_state;
  end;

  delete from membership where id = v_mid;

  if v_existing is not null then
    update membership set status = v_existing_status where id = v_existing;
  end if;

  raise notice 'PASS scenario 4';
exception when others then
  raise warning 'FAIL scenario 4: %', sqlerrm;
end $$;

-- ===========================================================================
-- Scenario 5 — GYM04: resume on non-paused membership
-- ===========================================================================
\echo '--- Scenario 5: GYM04 resume guard ---'
do $$
declare
  v_mid uuid;
  v_err text;
  v_state text;
begin
  select id into v_mid from membership
  where member_id = '33333333-3333-3333-3333-333333333333'
    and status = 'aktivna'
  order by created_at desc limit 1;

  if v_mid is null then
    raise notice 'SKIP scenario 5 (no active membership)';
    return;
  end if;

  begin
    perform resume_membership(v_mid);
    raise exception 'resume trebalo da padne';
  exception when others then
    v_err := sqlerrm;
    get stacked diagnostics v_state = returned_sqlstate;
    assert v_state = 'GYM04', 'pogresan sqlstate: ' || v_state;
  end;

  raise notice 'PASS scenario 5';
exception when others then
  raise warning 'FAIL scenario 5: %', sqlerrm;
end $$;
