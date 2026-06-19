-- Etapa 1 — Payment ↔ Check-in veza (M1 + m2).
--
-- M1 (Major): grupni Fitpass check-in kreira payment kind='fitpass_surcharge'
-- (+300 RSD) bez veze ka dolasku; void_checkin ne dira tu naplatu, pa poništen
-- grupni Fitpass dolazak ostavlja +300 u dnevnom prometu. Bug od 20260617100300.
--
-- Cilj: deterministička veza payment.checkin_id; void_checkin poništava SAMO
-- auto-generisanu naplatu dolaska (kind='fitpass_surcharge', nikad članarinu);
-- retroaktivna ispravka istorijske štete; surcharge badge po dolasku (m2).
--
-- record_payment.p_checkin_id forward plumbing se aktivira sada (no-op dok
-- PaymentDialog ne počne da ga šalje — Etapa 2).
--
-- Redosled koraka (A→G) je obavezan: svaki zavisi od prethodnog.

-- ---------------------------------------------------------------------------
-- Korak A — Šema: kolona + plain indeks
-- on delete set null kao reserved_session.checkin_id: finansijski zapis se ne
-- briše kada dolazak ode.
-- ---------------------------------------------------------------------------
alter table payment
  add column if not exists checkin_id uuid references checkin (id) on delete set null;
create index if not exists payment_checkin_id_idx on payment (checkin_id);

-- ---------------------------------------------------------------------------
-- Korak B — create_checkin: dodati checkin_id u surcharge INSERT
-- Bazirano na 20260619130000 (Krug-1 kategorija logika + v_shift_id assignment),
-- netaknuto; jedina izmena je checkin_id u group-Fitpass payment INSERT.
-- Surcharge i checkin u istoj transakciji → payment.created_at === checkin.created_at.
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
  v_active_is_trainer  boolean := false;
  v_checkin_membership_id uuid;
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

-- ---------------------------------------------------------------------------
-- Korak C — record_payment: forward plumbing (p_checkin_id -> membership payment)
-- Bazirano na 20260617100700 (shift_attribution), netaknuto; jedina izmena je
-- checkin_id u membership payment INSERT. debt_settlement INSERT se NE dira —
-- reserved_session već nosi originalni checkin_id; tekući p_checkin_id bi
-- zamutio semantiku. No-op u praksi dok PaymentDialog ne počne da šalje
-- checkin_id (Etapa 2); zatvara dosad mrtvi parametar bezbedno.
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
      member_id, staff_id, shift_id, checkin_id, membership_type_id, membership_id, kind,
      amount_rsd, is_custom_price, custom_reason, business_date, created_by, updated_by
    ) values (
      p_member_id, v_staff_id, v_shift_id, p_checkin_id, p_membership_type_id, v_membership_id, 'membership',
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

revoke execute on function record_payment(uuid, bigint, int, boolean, text, membership_start_mode, uuid[], uuid, date) from public, anon;
grant  execute on function record_payment(uuid, bigint, int, boolean, text, membership_start_mode, uuid[], uuid, date) to authenticated;

-- ---------------------------------------------------------------------------
-- Korak D — void_checkin: poništi vezanu fitpass_surcharge naplatu (linchpin)
-- Bazirano na 20260619120000, netaknuto (member-scoped first_visit revert ostaje);
-- dodat surcharge-void blok pre finalnog update checkin set voided=true.
-- Dvostepeno matchovanje: FK (checkin_id) prvo; egzaktan fallback (legacy redovi
-- bez checkin_id) samo ako FK ne nađe ništa. Inline UPDATE (ne void_payment RPC):
-- (1) void_payment RAISE EXCEPTION na već-voided red rolbekovao bi ceo void;
-- inline `and not voided` tiho no-op-uje. (2) set-semantika prirodno barata 0/1/N.
-- Nema AFTER UPDATE trigera na payment → inline bezbedan.
-- ---------------------------------------------------------------------------
create or replace function void_checkin(p_checkin_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_staff_id        uuid := auth.uid();
  v_row             checkin%rowtype;
  v_membership      membership%rowtype;
  v_later_count     int;
  v_surcharge_count int;
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

  -- Poništi auto-generisanu naplatu dolaska (samo fitpass_surcharge — NIKAD
  -- članarinu). Dvostepeno: FK prvo; egzaktan fallback samo ako FK ne nađe ništa.
  update payment
  set voided = true, voided_at = now(), voided_by = v_staff_id,
      void_reason = 'Poništen dolazak',
      updated_by = v_staff_id, updated_at = now()
  where checkin_id = p_checkin_id
    and kind = 'fitpass_surcharge'
    and not voided;
  get diagnostics v_surcharge_count = row_count;

  if v_surcharge_count = 0 then
    -- Legacy fallback: egzaktan ključ (created_at je transakciono jednak
    -- checkin.created_at jer su surcharge i checkin upisani u istoj transakciji).
    select count(*) into v_surcharge_count
    from payment
    where checkin_id is null
      and kind = 'fitpass_surcharge'
      and not voided
      and business_date = v_row.business_date
      and staff_id = v_row.staff_id
      and created_at = v_row.created_at;

    if v_surcharge_count = 1 then
      update payment
      set voided = true, voided_at = now(), voided_by = v_staff_id,
          void_reason = 'Poništen dolazak',
          updated_by = v_staff_id, updated_at = now()
      where checkin_id is null and kind = 'fitpass_surcharge' and not voided
        and business_date = v_row.business_date
        and staff_id = v_row.staff_id
        and created_at = v_row.created_at;
    elsif v_surcharge_count > 1 then
      raise warning 'void_checkin: viseznacan fallback za surcharge, checkin_id=%, preskocen auto-void (% kandidata)',
        p_checkin_id, v_surcharge_count;
      -- Dolazak se i dalje ponistava; uplata ostaje za rucni pregled.
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

-- ---------------------------------------------------------------------------
-- Korak E — Backfill: poveži postojeće surcharge uplate sa dolascima
-- Pun egzaktan join; uključuje i voided check-in-e (link je činjenica nezavisna
-- od void-statusa — uslov da Korak F radi).
-- ---------------------------------------------------------------------------
update payment p
set checkin_id = c.id
from checkin c
where p.checkin_id is null
  and p.kind = 'fitpass_surcharge'
  and c.is_group_fitpass
  and p.business_date = c.business_date
  and p.staff_id = c.staff_id
  and p.created_at = c.created_at;

-- ---------------------------------------------------------------------------
-- Korak F — Retroaktivni ledger: poništi žive surcharge uplate čiji je vezani
-- dolazak već poništen (istorijska M1 šteta). Posle backfill-a (treba popunjen
-- checkin_id), pre partial unique indeksa (retroaktivni void izbacuje redove iz
-- `where not voided` predikata → nema sudara). voided_by/voided_at = vlasnik i
-- vreme storna dolaska (audit vernost).
-- ---------------------------------------------------------------------------
update payment p
set voided = true,
    voided_by = c.voided_by,
    voided_at = c.voided_at,
    void_reason = 'Retroaktivna ispravka — ponisten dolazak',
    updated_at = now()
from checkin c
where p.checkin_id = c.id
  and p.kind = 'fitpass_surcharge'
  and not p.voided
  and c.voided;

-- ---------------------------------------------------------------------------
-- Korak G — Pre-flight dup check + partial unique indeks
-- Detektuj postojeće duple ne-voided surcharge uplate po dolasku (stari
-- double-click u prod-u). Default: halt — ručno razrešiti pre indeksa.
-- NULL-ovi su distinct u Postgres-u → legacy redovi bez checkin_id se ne sudaraju.
-- `not voided` u predikatu dozvoljava re-naplatu posle void-a.
-- ---------------------------------------------------------------------------
do $$
declare v_dups int;
begin
  select count(*) into v_dups from (
    select checkin_id from payment
    where kind = 'fitpass_surcharge' and not voided and checkin_id is not null
    group by checkin_id having count(*) > 1
  ) d;
  if v_dups > 0 then
    raise exception 'Pre-flight: % checkin(a) ima >1 ne-voided surcharge — rucno razresiti pre indeksa.', v_dups;
  end if;
end $$;

create unique index if not exists payment_fitpass_surcharge_checkin_uidx
  on payment (checkin_id)
  where kind = 'fitpass_surcharge' and not voided;
