-- Solo dolazak: auto-skidanje sesija za session-based Otvoreni pakete (PRD §3.4).
-- Bazirano na 20260622130000; potpis create_checkin nepromenjen.

create or replace function create_checkin(
  p_member_id             uuid    default null,
  p_key_no                int     default null,
  p_with_trainer          boolean default false,
  p_training_category_id  bigint  default null,
  p_trainer_id            uuid    default null,
  p_is_fitpass            boolean default false,
  p_is_group_fitpass      boolean default false,
  p_business_date         date    default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_staff_id           uuid := auth.uid();
  v_shift_id           uuid;
  v_business_date      date := coalesce(p_business_date, business_today());
  v_checkin_id         uuid;
  v_membership         membership%rowtype;
  v_membership_id      uuid;
  v_mt                 membership_type%rowtype;
  v_tc                 training_category%rowtype;
  v_daily_price        int;
  v_sessions_left      int;
  v_has_membership     boolean := false;
  v_active_cat_id      bigint;
  v_active_cat_code    text := null;
  v_active_is_trainer  boolean := false;
  v_is_paused          boolean := false;
  v_checkin_membership_id uuid;
  v_open_key_no        int;
begin
  if v_staff_id is null then
    raise exception 'Niste prijavljeni.';
  end if;

  -- Shift attribution: caller's open shift (nullable if none).
  select id into v_shift_id
  from shift
  where ended_at is null and staff_id = v_staff_id
  limit 1;

  if p_is_fitpass then
    if p_member_id is not null then
      raise exception 'Fitpass ne sme imati člana.';
    end if;
    if p_key_no is null then
      raise exception 'Fitpass zahteva broj ključa.';
    end if;
    if p_with_trainer then
      raise exception 'Fitpass ne podržava trener sesiju.';
    end if;
  else
    if p_member_id is null then
      raise exception 'Član je obavezan.';
    end if;
    if not exists (select 1 from member where id = p_member_id and not archived) then
      raise exception 'Član nije pronađen.';
    end if;
  end if;

  if p_key_no is not null and not exists (select 1 from gym_key where key_no = p_key_no) then
    raise exception 'Neispravan broj ključa.';
  end if;

  if p_with_trainer then
    if p_training_category_id is null or p_trainer_id is null then
      raise exception 'Trener sesija zahteva kategoriju i trenera.';
    end if;
    select * into v_tc from training_category where id = p_training_category_id;
    if not found or not v_tc.is_trainer_based then
      raise exception 'Kategorija nije trener-based.';
    end if;
    if not exists (select 1 from staff where id = p_trainer_id and active) then
      raise exception 'Trener nije pronađen.';
    end if;
  end if;

  -- Single active/paused membership for member check-ins (one-active guarantee).
  if not p_is_fitpass then
    select m.* into v_membership
    from membership m
    where m.member_id = p_member_id
      and m.status in ('aktivna', 'pauzirana')
    order by m.created_at desc
    limit 1;

    if found then
      v_has_membership := true;
      v_membership_id := v_membership.id;
      select * into v_mt from membership_type where id = v_membership.membership_type_id;
      v_active_cat_id := v_mt.training_category_id;
      select code, is_trainer_based
        into v_active_cat_code, v_active_is_trainer
      from training_category where id = v_active_cat_id;
      v_active_is_trainer := coalesce(v_active_is_trainer, false);
      v_is_paused := (v_membership.status = 'pauzirana');
    end if;
  end if;

  -- GYM05: blokiraj nov check-in dok član ima otvoren dolazak danas (PRD §9.2).
  -- "Otvoren" = ne-voidovan, isti business_date, key_returned=false (uključuje key_no IS NULL).
  -- Posle "Otišao" (key_returned=true) nov dolazak je dozvoljen.
  if not p_is_fitpass and exists (
    select 1 from checkin
    where member_id = p_member_id
      and business_date = v_business_date
      and not voided
      and not key_returned
  ) then
    select c.key_no into v_open_key_no
    from checkin c
    where c.member_id = p_member_id
      and c.business_date = v_business_date
      and not c.voided
      and not c.key_returned
    order by c.created_at desc
    limit 1;

    raise exception
      'Član je već prijavljen i još nije otišao (%). Prvo evidentirajte „Otišao".',
      case when v_open_key_no is not null then 'ključ ' || v_open_key_no else 'bez ključa' end
      using errcode = 'GYM05';
  end if;

  -- checkin.membership_id: paused → null; solo → active membership; trainer +
  -- active trainer-based membership (S1/S2) → that membership; trainer without
  -- one (S0/S3) → null.
  v_checkin_membership_id :=
    case
      when v_is_paused then null
      when p_is_fitpass then null
      when not p_with_trainer then v_membership_id
      when v_has_membership and v_active_is_trainer then v_membership_id
      else null
    end;

  insert into checkin (
    member_id,
    staff_id,
    shift_id,
    membership_id,
    key_no,
    with_trainer,
    training_category_id,
    trainer_id,
    decremented_session,
    is_fitpass,
    is_group_fitpass,
    business_date,
    created_by,
    updated_by
  ) values (
    p_member_id,
    v_staff_id,
    v_shift_id,
    v_checkin_membership_id,
    p_key_no,
    p_with_trainer,
    case when p_with_trainer then p_training_category_id else null end,
    case when p_with_trainer then p_trainer_id else null end,
    false,
    p_is_fitpass,
    p_is_group_fitpass,
    v_business_date,
    v_staff_id,
    v_staff_id
  )
  returning id into v_checkin_id;

  -- Trainer session side effects (unified by category). Skipped while paused.
  if p_with_trainer and not p_is_fitpass and not v_is_paused then
    if v_has_membership and v_active_is_trainer then
      -- Active trainer-based membership: category is fixed to it (UI enforces;
      -- this raise is a defense-in-depth backstop).
      if p_training_category_id <> v_active_cat_id then
        raise exception 'Kategorija treninga ne odgovara aktivnoj članarini.'
          using errcode = 'GYM02';
      end if;
      v_sessions_left := coalesce(v_membership.sessions_left, 0);
    else
      -- No active trainer-based membership of this category (S0/S3): always reserved.
      v_sessions_left := 0;
    end if;

    if v_sessions_left > 0 then
      update membership
      set sessions_left = sessions_left - 1,
          updated_by = v_staff_id,
          updated_at = now()
      where id = v_membership_id;

      insert into session_log (
        member_id,
        membership_id,
        checkin_id,
        trainer_id,
        training_category_id,
        session_date
      ) values (
        p_member_id,
        v_membership_id,
        v_checkin_id,
        p_trainer_id,
        p_training_category_id,
        v_business_date
      );

      update checkin
      set decremented_session = true,
          updated_by = v_staff_id,
          updated_at = now()
      where id = v_checkin_id;
    else
      v_daily_price := capture_daily_price(p_training_category_id);
      if v_daily_price is null then
        raise exception 'Nije pronađena dnevna cena za izabranu kategoriju treninga.'
          using errcode = 'GYM01';
      end if;

      insert into reserved_session (
        member_id,
        checkin_id,
        training_category_id,
        session_date,
        amount_rsd,
        created_by
      ) values (
        p_member_id,
        v_checkin_id,
        p_training_category_id,
        v_business_date,
        v_daily_price,
        v_staff_id
      );
    end if;
  end if;

  -- Solo dolazak: auto-skidanje za session-based Otvoreni pakete (PRD §3.4).
  -- Ne-trener, ne-fitpass, ne-pauziran, aktivna Otvoreni session članarina,
  -- sessions_left > 0. 0 sesija → dozvoli bez skidanja (UI hint). Istekla-ali-aktivna
  -- i dalje skida (status-based, kao trener grana). session_log se NE upisuje.
  if not p_with_trainer
     and not p_is_fitpass
     and not v_is_paused
     and v_has_membership
     and v_active_cat_code = 'otvoreni'
     and not coalesce(v_mt.is_time_based, true)
     and coalesce(v_membership.sessions_left, 0) > 0
  then
    update membership
    set sessions_left = sessions_left - 1,
        updated_by = v_staff_id,
        updated_at = now()
    where id = v_membership_id;

    update checkin
    set decremented_session = true,
        updated_by = v_staff_id,
        updated_at = now()
    where id = v_checkin_id;
  end if;

  -- First visit membership activation (generic active membership, independent of
  -- whether this arrival is a trainer session). Skipped while paused.
  if not p_is_fitpass
     and v_has_membership
     and not v_is_paused
     and v_membership.start_mode = 'first_visit'
     and v_membership.start_date is null
  then
    update membership
    set start_date = v_business_date,
        end_date = v_business_date + (v_mt.duration_days - 1),
        updated_by = v_staff_id,
        updated_at = now()
    where id = v_membership_id;
  end if;

  -- Group Fitpass: charge +300 RSD immediately (attributed to the open shift AND
  -- linked to this check-in so void_checkin can reverse it).
  if p_is_fitpass and p_is_group_fitpass then
    insert into payment (
      member_id,
      staff_id,
      shift_id,
      checkin_id,
      kind,
      amount_rsd,
      is_fitpass,
      business_date,
      created_by,
      updated_by
    ) values (
      null,
      v_staff_id,
      v_shift_id,
      v_checkin_id,
      'fitpass_surcharge',
      300,
      true,
      v_business_date,
      v_staff_id,
      v_staff_id
    );
  end if;

  return v_checkin_id;
end;
$$;

revoke execute on function create_checkin(uuid, int, boolean, bigint, uuid, boolean, boolean, date) from public, anon;
grant  execute on function create_checkin(uuid, int, boolean, bigint, uuid, boolean, boolean, date) to authenticated;
