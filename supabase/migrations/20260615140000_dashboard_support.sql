-- Dashboard v1: checkin extensions, phone search, create_checkin + void_checkin RPCs

-- ---------------------------------------------------------------------------
-- 1. checkin columns
-- ---------------------------------------------------------------------------
alter table checkin
  add column is_group_fitpass boolean not null default false,
  add column voided           boolean not null default false,
  add column voided_at        timestamptz,
  add column voided_by        uuid references staff (id);

alter table checkin drop constraint if exists checkin_check;
alter table checkin add check (not is_group_fitpass or is_fitpass);
alter table checkin add check (not with_trainer or (training_category_id is not null and trainer_id is not null));
alter table checkin add check (is_fitpass or member_id is not null);
alter table checkin add check (not is_fitpass or key_no is not null);

create index checkin_voided_by_idx on checkin (voided_by);

drop index if exists checkin_open_key_idx;
create index checkin_open_key_idx
  on checkin (key_no, created_at desc)
  where not key_returned and not voided;

-- ---------------------------------------------------------------------------
-- 2. search_members — restore phone digit matching (PRD §3.2)
-- ---------------------------------------------------------------------------
create or replace function search_members(
  q                text    default '',
  include_archived boolean default false,
  lim              int     default 50,
  off              int     default 0
)
returns table (
  id                       uuid,
  member_no                bigint,
  first_name               text,
  last_name                text,
  phone                    text,
  discount_flag            boolean,
  comment                  text,
  archived                 boolean,
  created_at               timestamptz,
  membership_status        membership_status,
  membership_label         text,
  membership_end_date      date,
  membership_sessions_left int,
  membership_is_time_based boolean,
  total_count              bigint
)
language sql
stable
security invoker
set search_path = public, extensions
as $$
  with q_norm as (
    select
      coalesce(q, '') as raw,
      nullif(regexp_replace(coalesce(q, ''), '\D', '', 'g'), '') as digits
  ),
  active_m as (
    select distinct on (m.member_id)
      m.member_id,
      m.status,
      m.end_date,
      m.sessions_left,
      mt.label,
      mt.is_time_based
    from membership m
    join membership_type mt on mt.id = m.membership_type_id
    where m.status in ('aktivna', 'pauzirana')
    order by m.member_id, m.created_at desc
  ),
  base as (
    select me.*
    from member me, q_norm
    where (include_archived or not me.archived)
      and (
        q_norm.raw = ''
        or me.first_name ilike '%' || q_norm.raw || '%'
        or me.last_name  ilike '%' || q_norm.raw || '%'
        or (me.first_name || ' ' || me.last_name) ilike '%' || q_norm.raw || '%'
        or (q_norm.digits is not null and me.member_no::text like q_norm.digits || '%')
        or (
          q_norm.digits is not null
          and length(q_norm.digits) >= 3
          and regexp_replace(me.phone, '\D', '', 'g') like '%' || q_norm.digits || '%'
        )
      )
  ),
  counted as (select count(*)::bigint as total from base)
  select
    b.id,
    b.member_no,
    b.first_name,
    b.last_name,
    b.phone,
    b.discount_flag,
    b.comment,
    b.archived,
    b.created_at,
    am.status,
    am.label,
    am.end_date,
    am.sessions_left,
    am.is_time_based,
    (select total from counted)
  from base b
  left join active_m am on am.member_id = b.id, q_norm
  order by
    case
      when q_norm.raw = '' then 0
      else greatest(
        similarity(b.first_name, q_norm.raw),
        similarity(b.last_name, q_norm.raw),
        similarity(b.first_name || ' ' || b.last_name, q_norm.raw)
      )
    end desc,
    lower(b.last_name),
    lower(b.first_name)
  limit lim offset off;
$$;

revoke execute on function search_members(text, boolean, int, int) from public, anon;
grant  execute on function search_members(text, boolean, int, int) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Helper: daily price for a training category (1/1 package)
-- ---------------------------------------------------------------------------
create or replace function capture_daily_price(p_training_category_id bigint)
returns int
language sql
stable
security definer
set search_path = public
as $$
  select p.amount_rsd
  from membership_type mt
  join price p
    on p.membership_type_id = mt.id
   and p.is_discount_price = false
   and p.active = true
  where mt.training_category_id = p_training_category_id
    and mt.sessions = 1
    and mt.active = true
  order by mt.id
  limit 1;
$$;

revoke execute on function capture_daily_price(bigint) from public, anon;
grant  execute on function capture_daily_price(bigint) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. create_checkin RPC
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

  -- Active membership for member check-ins
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

  -- Trainer session side effects
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

  -- First visit membership activation
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

  return v_checkin_id;
end;
$$;

revoke execute on function create_checkin(uuid, int, boolean, bigint, uuid, boolean, boolean, date) from public, anon;
grant  execute on function create_checkin(uuid, int, boolean, bigint, uuid, boolean, boolean, date) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. void_checkin RPC
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

  -- Revert first_visit activation if this was the only non-voided check-in
  if v_row.membership_id is not null and not v_row.is_fitpass then
    select * into v_membership from membership where id = v_row.membership_id;
    if v_membership.start_mode = 'first_visit'
       and v_membership.start_date = v_row.business_date
    then
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
