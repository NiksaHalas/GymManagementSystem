-- Group Fitpass: charge +300 RSD immediately on check-in

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
  v_staff_id       uuid := auth.uid();
  v_business_date  date := coalesce(p_business_date, business_today());
  v_checkin_id     uuid;
  v_membership     membership%rowtype;
  v_membership_id  uuid;
  v_mt             membership_type%rowtype;
  v_tc             training_category%rowtype;
  v_daily_price    int;
  v_sessions_left  int;
  v_has_membership boolean := false;
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
    end if;
  end if;

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
    case when p_is_fitpass then null else v_membership_id end,
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

  if p_with_trainer and not p_is_fitpass and v_has_membership then
    v_sessions_left := coalesce(v_membership.sessions_left, 0);

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
        raise exception 'Nije pronađena dnevna cena za kategoriju.';
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
