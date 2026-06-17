-- Fix reserved_session updates (table has no updated_by/updated_at)

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
      member_id, staff_id, membership_type_id, membership_id, kind,
      amount_rsd, is_custom_price, custom_reason, business_date, created_by, updated_by
    ) values (
      p_member_id, v_staff_id, p_membership_type_id, v_membership_id, 'membership',
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

      insert into payment (member_id, staff_id, kind, amount_rsd, business_date, created_by, updated_by)
      values (p_member_id, v_staff_id, 'debt_settlement', v_reserved.amount_rsd, v_business_date, v_staff_id, v_staff_id)
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

create or replace function void_payment(p_payment_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_staff_id uuid := auth.uid();
  v_row payment%rowtype;
  v_used boolean;
begin
  if v_staff_id is null then raise exception 'Niste prijavljeni.'; end if;
  if p_reason is null or trim(p_reason) = '' then raise exception 'Razlog storna je obavezan.'; end if;

  select * into v_row from payment where id = p_payment_id for update;
  if not found then raise exception 'Uplata nije pronađena.'; end if;
  if v_row.voided then raise exception 'Uplata je već stornirana.'; end if;
  if not is_admin() and v_row.business_date <> business_today() then
    raise exception 'Možete stornirati samo današnje uplate.';
  end if;

  if v_row.kind = 'debt_settlement' then
    update reserved_session
    set settled = false, settled_payment_id = null, settled_at = null
    where settled_payment_id = p_payment_id;
  elsif v_row.kind = 'membership' and v_row.membership_id is not null then
    select exists (
      select 1 from checkin c where c.membership_id = v_row.membership_id and not c.voided
    ) or exists (
      select 1 from session_log sl where sl.membership_id = v_row.membership_id
    ) into v_used;
    if v_used then raise exception 'Članarina je već korišćena — riješite dolaske pre storna.'; end if;
    delete from membership where id = v_row.membership_id;
  end if;

  update payment
  set voided = true, voided_by = v_staff_id, voided_at = now(),
      void_reason = trim(p_reason), updated_by = v_staff_id, updated_at = now()
  where id = p_payment_id;
end;
$$;
