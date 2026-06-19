-- Verifikacija Etape 1 — Payment ↔ Check-in veza (20260619140000).
-- NE commitovati u migrations/. Pokretati na lokalnoj supabase bazi:
--   docker exec -i supabase_db_<proj> psql -U postgres -v ON_ERROR_STOP=0 < scripts/verify_payment_checkin_link.sql
-- Pretpostavlja fixtures: worker 1111…, admin 2222…, member 3333… (vidi setup).
-- Svaki scenario štampa PASS/FAIL. ON_ERROR_STOP=0 da expected-greške ne prekinu skriptu.

\set worker '11111111-1111-1111-1111-111111111111'
\set member '33333333-3333-3333-3333-333333333333'

-- Glumi prijavljenog radnika za sve RPC pozive.
set request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
set role authenticated;

-- ===========================================================================
-- Scenario 1 — Osnovni (M1 simptom): grupni Fitpass + void vraća +300 iz prometa
-- ===========================================================================
\echo '--- Scenario 1: osnovni grupni Fitpass void ---'
do $$
declare
  v_ck uuid;
  v_pay payment%rowtype;
  v_takings_before int;
  v_takings_after int;
begin
  v_ck := create_checkin(p_key_no := 5, p_is_fitpass := true, p_is_group_fitpass := true);

  select * into v_pay from payment where checkin_id = v_ck and kind = 'fitpass_surcharge';
  assert v_pay.amount_rsd = 300, 'surcharge nije 300';
  assert v_pay.checkin_id = v_ck, 'checkin_id nije postavljen';
  assert not v_pay.voided, 'surcharge ne sme biti voided pre void-a';

  select coalesce(sum(amount_rsd),0) into v_takings_before
  from payment where business_date = business_today() and not voided;
  assert v_takings_before >= 300, 'promet ne sadrzi +300';

  perform void_checkin(v_ck);

  select * into v_pay from payment where checkin_id = v_ck and kind = 'fitpass_surcharge';
  assert v_pay.voided, 'surcharge nije voided posle void_checkin';
  assert v_pay.void_reason = 'Poništen dolazak', 'void_reason pogresan';
  assert v_pay.voided_by = '11111111-1111-1111-1111-111111111111', 'voided_by pogresan';

  select coalesce(sum(amount_rsd),0) into v_takings_after
  from payment where business_date = business_today() and not voided;
  assert v_takings_after = v_takings_before - 300, 'promet nije smanjen za 300';

  raise notice 'PASS scenario 1';
exception when others then
  raise warning 'FAIL scenario 1: %', sqlerrm;
end $$;

-- ===========================================================================
-- Scenario 2 — Legacy fallback: surcharge bez checkin_id se i dalje ponisti
-- ===========================================================================
\echo '--- Scenario 2: legacy fallback (checkin_id = null) ---'
do $$
declare
  v_ck uuid;
  v_pay payment%rowtype;
begin
  v_ck := create_checkin(p_key_no := 6, p_is_fitpass := true, p_is_group_fitpass := true);
  -- Simuliraj legacy red: skini FK vezu.
  update payment set checkin_id = null where checkin_id = v_ck and kind = 'fitpass_surcharge';

  perform void_checkin(v_ck);

  -- Fallback gadja po business_date + staff_id + created_at.
  select * into v_pay from payment p
  where p.kind = 'fitpass_surcharge'
    and p.business_date = business_today()
    and p.staff_id = '11111111-1111-1111-1111-111111111111'
    and p.created_at = (select created_at from checkin where id = v_ck);
  assert v_pay.voided, 'legacy surcharge nije voided kroz fallback';
  raise notice 'PASS scenario 2';
exception when others then
  raise warning 'FAIL scenario 2: %', sqlerrm;
end $$;

-- ===========================================================================
-- Scenario 3 — Re-void idempotencija: drugi void_checkin ne rusi zbog surcharge-a
-- ===========================================================================
\echo '--- Scenario 3: re-void idempotencija ---'
do $$
declare
  v_ck uuid;
  v_err text;
begin
  v_ck := create_checkin(p_key_no := 7, p_is_fitpass := true, p_is_group_fitpass := true);
  perform void_checkin(v_ck);
  begin
    perform void_checkin(v_ck);
    raise exception 'drugi void je trebalo da padne na checkin guard-u';
  exception when others then
    v_err := sqlerrm;
  end;
  -- Greska mora biti checkin-level (vec ponisten), NE surcharge-level.
  assert v_err = 'Dolazak je već poništen.', 'pogresna greska: ' || v_err;
  -- Surcharge ostaje voided tacno jednom (and not voided ga ne dira ponovo).
  assert (select voided from payment where checkin_id = v_ck and kind='fitpass_surcharge'), 'surcharge nije voided';
  raise notice 'PASS scenario 3';
exception when others then
  raise warning 'FAIL scenario 3: %', sqlerrm;
end $$;

-- ===========================================================================
-- Scenario 4 — Ne-grupni no-op: obican clanski check-in, void ne dira payment
-- ===========================================================================
\echo '--- Scenario 4: ne-grupni no-op ---'
do $$
declare
  v_ck uuid;
  v_cnt int;
begin
  v_ck := create_checkin(p_member_id := '33333333-3333-3333-3333-333333333333', p_key_no := 8);
  perform void_checkin(v_ck);
  select count(*) into v_cnt from payment where checkin_id = v_ck and voided;
  assert v_cnt = 0, 'void je dirao payment za ne-grupni checkin';
  raise notice 'PASS scenario 4';
exception when others then
  raise warning 'FAIL scenario 4: %', sqlerrm;
end $$;

-- ===========================================================================
-- Scenario 5 (16.1) — Linchpin: prava clanarina vezana za dolazak NIJE voided
-- ===========================================================================
\echo '--- Scenario 5: linchpin (membership payment ostaje) ---'
do $$
declare
  v_ck uuid;
  v_mtype bigint;
  v_offered int;
  v_pay_id uuid;
  v_voided boolean;
begin
  v_ck := create_checkin(p_member_id := '33333333-3333-3333-3333-333333333333', p_key_no := 9);
  select id into v_mtype from membership_type where active and sessions = 1 limit 1;
  v_offered := offered_membership_price(v_mtype, '33333333-3333-3333-3333-333333333333');

  v_pay_id := record_payment(
    p_member_id := '33333333-3333-3333-3333-333333333333',
    p_membership_type_id := v_mtype,
    p_amount_rsd := v_offered,
    p_checkin_id := v_ck);

  -- Forward plumbing: membership payment nosi checkin_id.
  assert (select checkin_id from payment where id = v_pay_id) = v_ck, 'membership payment nema checkin_id';

  perform void_checkin(v_ck);

  select voided into v_voided from payment where id = v_pay_id;
  assert not v_voided, 'KRITICNO: clanarina je poništena void_checkin-om!';
  raise notice 'PASS scenario 5 (linchpin)';
exception when others then
  raise warning 'FAIL scenario 5: %', sqlerrm;
end $$;

-- ===========================================================================
-- Scenario 6 — Dup-guard: drugi ne-voided surcharge sa istim checkin_id -> 23505
-- ===========================================================================
\echo '--- Scenario 6: partial unique dup-guard ---'
do $$
declare
  v_ck uuid;
  v_state text;
begin
  v_ck := create_checkin(p_key_no := 10, p_is_fitpass := true, p_is_group_fitpass := true);
  begin
    insert into payment (member_id, staff_id, checkin_id, kind, amount_rsd, is_fitpass, business_date, created_by, updated_by)
    values (null, '11111111-1111-1111-1111-111111111111', v_ck, 'fitpass_surcharge', 300, true, business_today(),
            '11111111-1111-1111-1111-111111111111','11111111-1111-1111-1111-111111111111');
    raise exception 'duplikat je trebalo da padne';
  exception when unique_violation then
    v_state := 'OK';
  end;
  assert v_state = 'OK', 'partial unique nije odbio duplikat';
  raise notice 'PASS scenario 6';
exception when others then
  raise warning 'FAIL scenario 6: %', sqlerrm;
end $$;

-- ===========================================================================
-- Scenario 7 — Retroaktivni ledger (Korak F SQL): voided dolazak -> surcharge voided
-- ===========================================================================
\echo '--- Scenario 7: retroaktivni ledger (Korak F) ---'
do $$
declare
  v_ck uuid;
  v_pay payment%rowtype;
  v_when timestamptz := now() - interval '1 day';
begin
  v_ck := create_checkin(p_key_no := 11, p_is_fitpass := true, p_is_group_fitpass := true);
  -- Simuliraj stari put: dolazak ponisten direktno (surcharge ostaje ziv).
  update checkin set voided = true, voided_at = v_when, voided_by = '22222222-2222-2222-2222-222222222222'
  where id = v_ck;

  -- Pokreni Korak F logiku.
  update payment p
  set voided = true, voided_by = c.voided_by, voided_at = c.voided_at,
      void_reason = 'Retroaktivna ispravka — ponisten dolazak', updated_at = now()
  from checkin c
  where p.checkin_id = c.id and p.kind = 'fitpass_surcharge' and not p.voided and c.voided;

  select * into v_pay from payment where checkin_id = v_ck and kind = 'fitpass_surcharge';
  assert v_pay.voided, 'retroaktivni surcharge nije voided';
  assert v_pay.voided_at = v_when, 'voided_at nije jednak checkin.voided_at';
  assert v_pay.voided_by = '22222222-2222-2222-2222-222222222222', 'voided_by nije checkin.voided_by';
  raise notice 'PASS scenario 7';
exception when others then
  raise warning 'FAIL scenario 7: %', sqlerrm;
end $$;

-- ===========================================================================
-- Scenario 8 — Backfill residual count (informativno)
-- ===========================================================================
\echo '--- Scenario 8: backfill residual ---'
select 'surcharge_bez_checkin_id=' || count(*) as residual
from payment where kind = 'fitpass_surcharge' and checkin_id is null and not voided;

reset role;
