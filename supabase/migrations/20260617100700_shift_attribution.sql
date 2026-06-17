-- Shift attribution: shift_id + waive columns, unique open shift, new RPC model.
-- Launch cutoff for pending badge: 2026-06-17T10:07:00+00 (mirrored in lib/shifts/config.ts).

-- ---------------------------------------------------------------------------
-- 1. Schema: shift_id + waive on checkin and payment
-- ---------------------------------------------------------------------------
alter table checkin
  add column if not exists shift_id uuid references shift (id) on delete set null,
  add column if not exists waived_at timestamptz,
  add column if not exists waived_by uuid references staff (id);

alter table payment
  add column if not exists shift_id uuid references shift (id) on delete set null,
  add column if not exists waived_at timestamptz,
  add column if not exists waived_by uuid references staff (id);

create index if not exists checkin_shift_id_idx on checkin (shift_id);
create index if not exists payment_shift_id_idx on payment (shift_id);

create index if not exists checkin_pending_attribution_idx
  on checkin (created_at)
  where shift_id is null and waived_at is null;

create index if not exists payment_pending_attribution_idx
  on payment (created_at)
  where shift_id is null and waived_at is null;

create unique index if not exists shift_one_open_uidx
  on shift ((true))
  where ended_at is null;

-- ---------------------------------------------------------------------------
-- 2. RLS: active staff may SELECT the open shift (for INVOKER open_or_resume_shift)
-- ---------------------------------------------------------------------------
create policy shift_select_open on shift
  for select to authenticated
  using (
    ended_at is null
    and exists (
      select 1 from staff s
      where s.id = auth.uid() and s.active
    )
  );

-- ---------------------------------------------------------------------------
-- 3. open_or_resume_shift (INVOKER) — no auto-handover
-- ---------------------------------------------------------------------------
create or replace function public.open_or_resume_shift()
returns text
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_staff_id   uuid := auth.uid();
  v_is_active  boolean;
  v_open       shift%rowtype;
begin
  if v_staff_id is null then
    raise exception 'Niste prijavljeni.';
  end if;

  select active into v_is_active from staff where id = v_staff_id;
  if not found or not v_is_active then
    raise exception 'Nalog je deaktiviran.';
  end if;

  select * into v_open
  from shift
  where ended_at is null
  limit 1;

  if found then
    if v_open.staff_id = v_staff_id then
      return 'resumed';
    else
      return 'foreign_shift_open';
    end if;
  end if;

  begin
    insert into shift (staff_id, started_at)
    values (v_staff_id, now());
    return 'opened';
  exception
    when unique_violation then
      select * into v_open
      from shift
      where ended_at is null
      limit 1;
      if v_open.staff_id = v_staff_id then
        return 'resumed';
      else
        return 'foreign_shift_open';
      end if;
  end;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. handover_shift (DEFINER) — atomic close + open
-- ---------------------------------------------------------------------------
create or replace function public.handover_shift()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_staff_id   uuid := auth.uid();
  v_is_active  boolean;
  v_open       shift%rowtype;
begin
  if v_staff_id is null then
    raise exception 'Niste prijavljeni.';
  end if;

  select active into v_is_active from staff where id = v_staff_id;
  if not found or not v_is_active then
    raise exception 'Nalog je deaktiviran.';
  end if;

  select * into v_open
  from shift
  where ended_at is null
  limit 1
  for update;

  if found then
    if v_open.staff_id = v_staff_id then
      return;
    end if;

    update shift
    set ended_at = now(),
        ended_reason = 'switch'
    where id = v_open.id;
  end if;

  begin
    insert into shift (staff_id, started_at)
    values (v_staff_id, now());
  exception
    when unique_violation then
      select * into v_open
      from shift
      where ended_at is null and staff_id = v_staff_id
      limit 1;
      if not found then
        raise;
      end if;
  end;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. end_shift (INVOKER) — close own shift only
-- ---------------------------------------------------------------------------
create or replace function public.end_shift()
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_staff_id  uuid := auth.uid();
  v_is_active boolean;
begin
  if v_staff_id is null then
    raise exception 'Niste prijavljeni.';
  end if;

  select active into v_is_active from staff where id = v_staff_id;
  if not found or not v_is_active then
    raise exception 'Nalog je deaktiviran.';
  end if;

  update shift
  set ended_at = now(),
      ended_reason = 'logout'
  where staff_id = v_staff_id
    and ended_at is null;
end;
$$;

revoke execute on function public.ensure_open_shift() from authenticated;
drop function if exists public.ensure_open_shift();

revoke execute on function public.open_or_resume_shift() from public, anon;
revoke execute on function public.handover_shift() from public, anon;
revoke execute on function public.end_shift() from public, anon;
grant execute on function public.open_or_resume_shift() to authenticated;
grant execute on function public.handover_shift() to authenticated;
grant execute on function public.end_shift() to authenticated;

-- ---------------------------------------------------------------------------
-- 6. create_checkin — set shift_id from caller's open shift (nullable if none)
-- ---------------------------------------------------------------------------
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
  v_shift_id       uuid;
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
      shift_id,
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

-- ---------------------------------------------------------------------------
-- 7. record_payment — set shift_id on all payment inserts
-- ---------------------------------------------------------------------------
create or replace function record_payment(
  p_member_id             uuid,
  p_membership_type_id    bigint    default null,
  p_amount_rsd            int       default 0,
  p_is_custom_price       boolean   default false,
  p_custom_reason         text      default null,
  p_start_mode            membership_start_mode default 'payment',
  p_settle_reserved_ids   uuid[]    default '{}',
  p_checkin_id            uuid      default null,
  p_business_date         date      default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_staff_id          uuid := auth.uid();
  v_shift_id          uuid;
  v_business_date     date := coalesce(p_business_date, business_today());
  v_member            member%rowtype;
  v_mt                membership_type%rowtype;
  v_offered           int;
  v_has_active        boolean := false;
  v_membership_id     uuid;
  v_payment_id        uuid;
  v_reserved          reserved_session%rowtype;
  v_debt_payment_id   uuid;
  v_first_debt_id     uuid;
  v_rid               uuid;
begin
  if v_staff_id is null then
    raise exception 'Niste prijavljeni.';
  end if;

  select id into v_shift_id
  from shift
  where ended_at is null and staff_id = v_staff_id
  limit 1;

  if p_member_id is null then
    raise exception 'Član je obavezan.';
  end if;

  select * into v_member from member where id = p_member_id;
  if not found or v_member.archived then
    raise exception 'Član nije pronađen ili je arhiviran.';
  end if;

  if p_membership_type_id is null and coalesce(array_length(p_settle_reserved_ids, 1), 0) = 0 then
    raise exception 'Izaberite članarinu ili dug za izmirenje.';
  end if;

  if p_membership_type_id is not null then
    select * into v_mt from membership_type where id = p_membership_type_id;
    if not found or not v_mt.active then
      raise exception 'Tip članarine nije pronađen.';
    end if;

    v_offered := offered_membership_price(p_membership_type_id, p_member_id);

    if p_is_custom_price then
      if p_amount_rsd <= 0 or p_amount_rsd >= v_offered then
        raise exception 'Prilagođena cena mora biti između 0 i ponuđene cene (%).', v_offered;
      end if;
    else
      if p_amount_rsd <> v_offered then
        raise exception 'Iznos mora biti % RSD.', v_offered;
      end if;
    end if;

    select exists (
      select 1 from membership m
      where m.member_id = p_member_id
        and m.status in ('aktivna', 'pauzirana')
    ) into v_has_active;

    if not v_has_active then
      insert into membership (
        member_id, membership_type_id, start_mode, start_date, end_date,
        sessions_total, sessions_left, status, created_by, updated_by
      ) values (
        p_member_id, p_membership_type_id, p_start_mode,
        case when p_start_mode = 'payment' then v_business_date else null end,
        case when p_start_mode = 'payment' then v_business_date + (v_mt.duration_days - 1) else null end,
        v_mt.sessions, v_mt.sessions, 'aktivna', v_staff_id, v_staff_id
      )
      returning id into v_membership_id;
    else
      if p_start_mode = 'first_visit' then
        raise exception 'Zakazana članarina ne podržava prvi dolazak — koristite plaćanje.';
      end if;

      insert into membership (
        member_id, membership_type_id, start_mode, start_date, end_date,
        sessions_total, sessions_left, status, created_by, updated_by
      ) values (
        p_member_id, p_membership_type_id, 'payment', null, null,
        v_mt.sessions, v_mt.sessions, 'zakazana', v_staff_id, v_staff_id
      )
      returning id into v_membership_id;
    end if;

    insert into payment (
      member_id, staff_id, shift_id, membership_type_id, membership_id, kind,
      amount_rsd, is_custom_price, custom_reason, business_date, created_by, updated_by
    ) values (
      p_member_id, v_staff_id, v_shift_id, p_membership_type_id, v_membership_id, 'membership',
      p_amount_rsd, p_is_custom_price, p_custom_reason, v_business_date, v_staff_id, v_staff_id
    )
    returning id into v_payment_id;
  end if;

  if p_settle_reserved_ids is not null then
    foreach v_rid in array p_settle_reserved_ids loop
      select * into v_reserved from reserved_session rs where rs.id = v_rid for update;
      if not found then raise exception 'Rezervisani termin nije pronađen.'; end if;
      if v_reserved.member_id <> p_member_id then raise exception 'Rezervisani termin ne pripada ovom članu.'; end if;
      if v_reserved.settled then raise exception 'Rezervisani termin je već izmiren.'; end if;

      insert into payment (member_id, staff_id, shift_id, kind, amount_rsd, business_date, created_by, updated_by)
      values (p_member_id, v_staff_id, v_shift_id, 'debt_settlement', v_reserved.amount_rsd, v_business_date, v_staff_id, v_staff_id)
      returning id into v_debt_payment_id;

      if v_first_debt_id is null then v_first_debt_id := v_debt_payment_id; end if;

      update reserved_session
      set settled = true, settled_payment_id = v_debt_payment_id, settled_at = now()
      where id = v_rid;
    end loop;
  end if;

  return coalesce(v_payment_id, v_first_debt_id);
end;
$$;
