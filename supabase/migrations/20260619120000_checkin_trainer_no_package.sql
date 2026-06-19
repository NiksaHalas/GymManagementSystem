-- Phase 1c Krug 1: trainer session for members without an active (trainer-based)
-- package (PRD §3.5 "or no active package"). Unifies the trainer-session model
-- by training category:
--   * active trainer-based membership of the SAME chosen category + sessions left
--     > 0 -> deduct + session_log; checkin.membership_id = that membership.
--   * active trainer-based membership of the SAME category, 0 sessions -> reserved;
--     checkin.membership_id = that membership.
--   * no active trainer-based membership of that category (no package / non-trainer
--     package, e.g. Otvoreni/Kardio) -> reserved with the chosen category;
--     checkin.membership_id = null. Sessions never spill across categories.
-- Also makes void_checkin's first_visit revert member-scoped (not bound to
-- checkin.membership_id) so a first-visit activation that happened on a reserved
-- (membership_id = null) trainer check-in is still reverted on void.
-- Custom SQLSTATE 'GYM01' = no daily price for the chosen trainer category.

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
  v_active_is_trainer  boolean := false;
  v_checkin_membership_id uuid;
begin
  if v_staff_id is null then
    raise exception 'Niste prijavljeni.';
  end if;

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
      select is_trainer_based into v_active_is_trainer
      from training_category where id = v_active_cat_id;
      v_active_is_trainer := coalesce(v_active_is_trainer, false);
    end if;
  end if;

  -- checkin.membership_id: solo -> active membership; trainer + active trainer-based
  -- membership (S1/S2) -> that membership; trainer without one (S0/S3) -> null.
  v_checkin_membership_id :=
    case
      when p_is_fitpass then null
      when not p_with_trainer then v_membership_id
      when v_has_membership and v_active_is_trainer then v_membership_id
      else null
    end;

  insert into checkin (
    member_id,
    staff_id,
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

  -- Trainer session side effects (unified by category).
  if p_with_trainer and not p_is_fitpass then
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

  -- First visit membership activation (generic active membership, independent of
  -- whether this arrival is a trainer session).
  if not p_is_fitpass
     and v_has_membership
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

  -- Group Fitpass: charge +300 RSD immediately.
  if p_is_fitpass and p_is_group_fitpass then
    insert into payment (
      member_id,
      staff_id,
      kind,
      amount_rsd,
      is_fitpass,
      business_date,
      created_by,
      updated_by
    ) values (
      null,
      v_staff_id,
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

-- ---------------------------------------------------------------------------
-- void_checkin: first_visit revert is now member-scoped (not bound to
-- checkin.membership_id) so S0/S3 reserved trainer check-ins that triggered a
-- first-visit activation are reverted correctly.
-- ---------------------------------------------------------------------------
create or replace function void_checkin(p_checkin_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_staff_id    uuid := auth.uid();
  v_row         checkin%rowtype;
  v_membership  membership%rowtype;
  v_later_count int;
begin
  if v_staff_id is null then
    raise exception 'Niste prijavljeni.';
  end if;

  select * into v_row from checkin where id = p_checkin_id for update;
  if not found then
    raise exception 'Dolazak nije pronađen.';
  end if;
  if v_row.voided then
    raise exception 'Dolazak je već poništen.';
  end if;

  if not is_admin() and v_row.business_date <> business_today() then
    raise exception 'Možete poništiti samo današnje dolaske.';
  end if;

  if v_row.decremented_session and v_row.membership_id is not null then
    update membership
    set sessions_left = coalesce(sessions_left, 0) + 1,
        updated_by = v_staff_id,
        updated_at = now()
    where id = v_row.membership_id;
  end if;

  delete from session_log where checkin_id = p_checkin_id;
  delete from reserved_session where checkin_id = p_checkin_id and not settled;

  -- Revert a first_visit activation that landed on this check-in's business date,
  -- if this was the member's only non-voided check-in. Scoped by member (not by
  -- checkin.membership_id) so reserved trainer check-ins (membership_id null) count.
  if not v_row.is_fitpass and v_row.member_id is not null then
    select * into v_membership
    from membership
    where member_id = v_row.member_id
      and start_mode = 'first_visit'
      and start_date = v_row.business_date
    order by created_at desc
    limit 1;

    if found then
      select count(*) into v_later_count
      from checkin c
      where c.member_id = v_row.member_id
        and c.id <> p_checkin_id
        and not c.voided
        and not c.is_fitpass;

      if v_later_count = 0 then
        update membership
        set start_date = null,
            end_date = null,
            updated_by = v_staff_id,
            updated_at = now()
        where id = v_membership.id;
      end if;
    end if;
  end if;

  update checkin
  set voided = true,
      voided_at = now(),
      voided_by = v_staff_id,
      updated_by = v_staff_id,
      updated_at = now()
  where id = p_checkin_id;
end;
$$;

revoke execute on function void_checkin(uuid) from public, anon;
grant  execute on function void_checkin(uuid) to authenticated;
