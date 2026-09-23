-- =============================================================================
-- Demo data generator (demo environment + local dev + CI only).
--
-- NOT a migration: it lives outside supabase/migrations so a real gym project
-- never gets it. Loaded by `supabase db reset` locally/CI (config.toml
-- [db.seed]) and applied by hand to the hosted demo project (docs/demo.md).
--
--   select demo.reset();            -- wipe operational data, regenerate up to today
--   select demo.reset('2026-09-23'); -- regenerate for a given "today"
--
-- The generator is a deterministic (setseed) day-by-day simulation of a family
-- gym: members with personas (loyal, occasional, trainer clients, drop-outs,
-- day-pass), seasonal / weekday / hourly arrival patterns, memberships bought
-- at the counter, sessions, debt, pauses, queued renewals, Fitpass, voids,
-- worker shifts with handover, and physical keys. Every row obeys the same
-- rules the RPCs enforce (see docs/DB.md), so the app behaves normally on it.
-- =============================================================================

create schema if not exists demo;
revoke all on schema demo from public, anon, authenticated;

create table if not exists demo.meta (
  k text primary key,
  v jsonb not null
);
revoke all on demo.meta from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- Small helpers
-- -----------------------------------------------------------------------------

-- Random integer in [lo, hi].
create or replace function demo.rint(lo int, hi int)
returns int language sql volatile as $$
  select lo + floor(random() * (hi - lo + 1))::int;
$$;

-- Random element of an array.
create or replace function demo.pick(arr text[])
returns text language sql volatile as $$
  select arr[1 + floor(random() * array_length(arr, 1))::int];
$$;

-- Belgrade local date + minutes after midnight → timestamptz.
create or replace function demo.at(p_day date, p_minutes int)
returns timestamptz language sql immutable as $$
  select (p_day + make_interval(mins => p_minutes)) at time zone 'Europe/Belgrade';
$$;

-- Closing time in minutes after midnight (Mon–Fri 21:00, Sat 18:00, Sun 16:00).
create or replace function demo.close_min(p_day date)
returns int language sql immutable as $$
  select case extract(isodow from p_day)::int
           when 6 then 18 * 60
           when 7 then 16 * 60
           else 21 * 60
         end;
$$;

-- Arrival minute (after midnight) drawn from the hourly profile of the weekday.
create or replace function demo.arrival_minute(p_day date)
returns int language plpgsql volatile as $$
declare
  v_dow int := extract(isodow from p_day)::int;
  -- weights per hour slot starting at 09:00
  v_w int[] := case v_dow
                 when 6 then array[8, 12, 12, 10, 7, 5, 5, 4, 2]        -- Sat 09–17
                 when 7 then array[6, 10, 10, 8, 5, 3, 1]              -- Sun 09–15
                 else        array[6, 6, 5, 4, 3, 4, 5, 8, 12, 13, 11, 4] -- Mon–Fri 09–20
               end;
  v_total int := 0;
  v_r int;
  i int;
begin
  foreach i in array v_w loop v_total := v_total + i; end loop;
  v_r := floor(random() * v_total)::int;
  for i in 1 .. array_length(v_w, 1) loop
    v_r := v_r - v_w[i];
    if v_r < 0 then
      -- last slot of the day: only the first half hour, so nobody arrives at closing
      if i = array_length(v_w, 1) then
        return (8 + i) * 60 + demo.rint(0, 29);
      end if;
      return (8 + i) * 60 + demo.rint(0, 59);
    end if;
  end loop;
  return 9 * 60;
end $$;

-- Seasonal factor by month (January resolutions, summer dip, September return).
create or replace function demo.season(p_day date)
returns numeric language sql immutable as $$
  select (array[1.25, 1.15, 1.10, 1.05, 1.00, 0.85, 0.70, 0.65, 1.15, 1.10, 1.05, 0.85])
         [extract(month from p_day)::int];
$$;

-- Weekday factor, normalised to a mean of 1 (Mon strongest, Sun weakest).
create or replace function demo.weekday(p_day date)
returns numeric language sql immutable as $$
  select (array[1.20, 1.15, 1.05, 1.10, 0.90, 0.70, 0.45])[extract(isodow from p_day)::int] / 0.9357;
$$;

-- New-member weight by month.
create or replace function demo.join_weight(p_day date)
returns numeric language sql immutable as $$
  select (array[1.6, 1.2, 1.2, 1.0, 1.0, 0.6, 0.6, 0.6, 1.4, 1.1, 1.0, 0.7])
         [extract(month from p_day)::int];
$$;

create or replace function demo.first_names_f() returns text[] language sql immutable as $$
  select array['Jelena','Milica','Ana','Marija','Jovana','Ivana','Tijana','Katarina','Sanja',
               'Dragana','Nevena','Teodora','Sara','Anđela','Kristina','Jasmina','Gordana',
               'Maja','Aleksandra','Nataša','Snežana','Mina','Dunja','Tamara','Vesna',
               'Ljiljana','Isidora','Milena','Biljana','Danijela'];
$$;

create or replace function demo.first_names_m() returns text[] language sql immutable as $$
  select array['Marko','Nikola','Stefan','Lazar','Luka','Milan','Nemanja','Aleksandar',
               'Dušan','Filip','Uroš','Vuk','Đorđe','Miloš','Jovan','Petar','Bojan','Dragan',
               'Vladimir','Ivan','Nenad','Zoran','Srđan','Dejan','Goran','Mihajlo','Ognjen',
               'Andrija','Vukašin','Relja'];
$$;

create or replace function demo.last_names() returns text[] language sql immutable as $$
  select array['Jovanović','Petrović','Nikolić','Marković','Đorđević','Stojanović','Ilić',
               'Stanković','Pavlović','Milošević','Todorović','Popović','Kostić','Ristić',
               'Živković','Lukić','Savić','Mitrović','Obradović','Stefanović','Janković',
               'Tomić','Simić','Radovanović','Kovačević','Lazić','Filipović','Vasić',
               'Milenković','Petković','Ćirić','Babić','Vuković','Nešić','Zdravković',
               'Gajić','Marinković','Stojković','Bogdanović','Radosavljević'];
$$;

-- -----------------------------------------------------------------------------
-- demo.generate(p_from, p_to): simulate every day in [p_from, p_to].
-- p_to is "today": its data stops at 11:00 with the morning shift still open.
-- Assumes the operational tables are empty (demo.reset does that).
-- -----------------------------------------------------------------------------
create or replace function demo.generate(p_from date, p_to date)
returns jsonb
language plpgsql
security definer
set search_path = public, demo
as $$
declare
  -- staff
  v_workers   uuid[];
  v_trainers  uuid[];
  v_admin     uuid;

  -- day loop
  d           date;
  v_dow       int;
  v_close     int;
  v_horizon   timestamptz;
  v_is_today  boolean;
  v_day_idx   int := 0;
  v_s1        uuid;
  v_s1_staff  uuid;
  v_s1_start  timestamptz;
  v_s2        uuid;
  v_s2_staff  uuid;
  v_handover  timestamptz;
  v_keys      timestamptz[];
  v_free      int[];
  v_join_total numeric;
  v_joins     int;
  v_fit       int;

  -- per arrival
  a           record;
  s           record;
  mt          record;
  v_t         timestamptz;
  v_pt        timestamptz;           -- payment time (a minute after the arrival)
  v_out       timestamptz;
  v_staff     uuid;
  v_shift     uuid;
  v_key       int;
  v_ck        uuid;
  v_ms        uuid;
  v_pay       uuid;
  v_valid     boolean;
  v_type      bigint;
  v_amount    int;
  v_custom    boolean;
  v_reason    text;
  v_trainer   boolean;
  v_cat       bigint;
  v_dec       boolean;
  v_price     int;
  v_pause_pct int;
  v_rs        record;
  v_mid       uuid;
  i           int;
begin
  perform setseed(0.4242);

  -- Staff roster (created by supabase/seed.sql locally, scripts/demo-staff.mjs on the demo).
  select array_agg(id order by array_position(array['jelena','marko','ana'], username))
    into v_workers from staff where username in ('jelena', 'marko', 'ana');
  select array_agg(id order by username) into v_trainers
    from staff where username in ('nikola', 'milica');
  select id into v_admin from staff where username = 'dragan';
  if coalesce(array_length(v_workers, 1), 0) <> 3
     or coalesce(array_length(v_trainers, 1), 0) <> 2
     or v_admin is null then
    raise exception 'demo.generate: demo staff missing (dragan, jelena, marko, ana, nikola, milica)';
  end if;

  -- Catalog snapshot ----------------------------------------------------------
  drop table if exists pg_temp.dm_type;
  create temp table dm_type as
  select typ.id, cat.code as cat, cat.id as cat_id, typ.package, typ.is_time_based,
         typ.sessions, typ.duration_days,
         (select p.amount_rsd from price p where p.membership_type_id = typ.id
            and not p.is_discount_price and p.active) as std,
         (select p.amount_rsd from price p where p.membership_type_id = typ.id
            and p.is_discount_price and p.active) as disc
  from membership_type typ
  join training_category cat on cat.id = typ.training_category_id
  where typ.active;

  -- Member state --------------------------------------------------------------
  drop table if exists pg_temp.dm_st;
  create temp table dm_st (
    member_id    uuid primary key,
    persona      text not null,
    rate         numeric not null,       -- visits per week
    pref_type    bigint not null,        -- preferred membership type
    discount     boolean not null,
    trainer_id   uuid,
    alive_from   date not null,          -- first day they may show up
    alive_until  date not null,          -- after this they stop coming (churn)
    renew_p      numeric not null,       -- probability of paying again
    ms_id        uuid,                   -- current membership
    ms_type      bigint,
    ms_start     date,
    ms_end       date,
    ms_left      int,
    ms_time      boolean,
    exp_id       uuid,                   -- last expired session package with sessions left
    exp_left     int,
    q_id         uuid,                   -- queued (zakazana) renewal
    q_type       bigint,
    pause_from   date,
    pause_to     date
  );

  -- Pre-existing members (joined before the simulated window) ------------------
  for i in 1 .. 150 loop
    perform demo._new_member(
      p_from - demo.rint(40, 700),
      p_from + demo.rint(0, 29),
      v_workers, v_trainers, p_to, true);
  end loop;

  -- Join weights over the window, for spreading ~230 new members.
  select sum(demo.join_weight(g::date)) into v_join_total
  from generate_series(p_from, p_to, interval '1 day') g;

  -- Day loop ------------------------------------------------------------------
  d := p_from;
  while d <= p_to loop
    v_dow := extract(isodow from d)::int;
    v_close := demo.close_min(d);
    v_is_today := (d = p_to);
    v_horizon := case when v_is_today then demo.at(d, 11 * 60) else demo.at(d, v_close + 60) end;
    v_day_idx := v_day_idx + 1;

    -- Closed on New Year's Day.
    if extract(month from d) = 1 and extract(day from d) = 1 then
      d := d + 1;
      continue;
    end if;

    -- Shifts --------------------------------------------------------------------
    v_s1_staff := case when v_is_today then v_workers[1] else v_workers[1 + (v_day_idx % 3)] end;
    v_s1_start := demo.at(d, 9 * 60 + case when random() < 0.03 then demo.rint(10, 20) else 0 end);
    v_s2 := null;
    v_handover := null;

    if v_dow <= 5 then
      v_handover := demo.at(d, 15 * 60 + demo.rint(-10, 10));
      v_s2_staff := v_workers[1 + ((v_day_idx + 1) % 3)];
    end if;

    insert into shift (staff_id, started_at, ended_at, ended_reason, created_at)
    values (
      v_s1_staff, v_s1_start,
      case when v_is_today then null
           when v_handover is not null then v_handover
           else demo.at(d, v_close + demo.rint(2, 15)) end,
      case when v_is_today then null
           when v_handover is not null then 'switch'::shift_end_reason
           else 'logout'::shift_end_reason end,
      v_s1_start)
    returning id into v_s1;

    if v_handover is not null and not v_is_today then
      insert into shift (staff_id, started_at, ended_at, ended_reason, created_at)
      values (v_s2_staff, v_handover,
              case when random() < 0.05 then demo.at(d, v_close)
                   else demo.at(d, v_close + demo.rint(2, 15)) end,
              case when random() < 0.05 then 'auto_close'::shift_end_reason
                   else 'logout'::shift_end_reason end,
              v_handover)
      returning id into v_s2;
    else
      v_handover := null;
    end if;

    -- Queued renewals start when the current membership ends (as promote_memberships() does).
    for s in select * from dm_st
             where q_id is not null
               and (ms_id is null or ms_end < d or (not ms_time and ms_left <= 0)) loop
      if s.ms_id is not null then
        update membership set status = 'istekla', updated_at = demo.at(d, 60)
        where id = s.ms_id;
      end if;
      select * into mt from dm_type where id = s.q_type;
      update membership
      set status = 'aktivna', start_date = d, end_date = d + (mt.duration_days - 1),
          updated_at = demo.at(d, 60)
      where id = s.q_id;
      update dm_st
      set ms_id = s.q_id, ms_type = s.q_type, ms_start = d, ms_end = d + (mt.duration_days - 1),
          ms_left = mt.sessions, ms_time = mt.is_time_based, q_id = null, q_type = null
      where member_id = s.member_id;
    end loop;

    -- Nightly expiry of finished memberships.
    for s in select * from dm_st
             where ms_id is not null and ms_start is not null
               and (ms_end < d or (not ms_time and ms_left <= 0)) loop
      update membership set status = 'istekla', updated_at = demo.at(d, 60) where id = s.ms_id;
      update dm_st
      set exp_id   = case when not s.ms_time and s.ms_left > 0 then s.ms_id end,
          exp_left = case when not s.ms_time and s.ms_left > 0 then s.ms_left end,
          ms_id = null, ms_type = null, ms_start = null, ms_end = null, ms_left = null, ms_time = null
      where member_id = s.member_id;
    end loop;

    -- New members today (~230 over the window, weighted by month).
    v_joins := floor(230 * demo.join_weight(d) / v_join_total + random())::int;
    for i in 1 .. v_joins loop
      if random() < 0.15 then
        -- Signs up and prepays today; the membership starts on the first visit (1–4 days later).
        v_mid := demo._new_member(d, d + demo.rint(1, 4), v_workers, v_trainers, p_to);
        v_t := demo.at(d, demo.arrival_minute(d));
        v_staff := case when v_handover is not null and v_t >= v_handover then v_s2_staff else v_s1_staff end;
        v_shift := case when v_handover is not null and v_t >= v_handover then v_s2 else v_s1 end;
        if v_t < v_s1_start then v_t := v_s1_start + interval '3 min'; end if;
        if v_t <= v_horizon then
          select * into s from dm_st where member_id = v_mid;
          select * into mt from dm_type where id = s.pref_type;
          if mt.is_time_based then
            v_amount := case when s.discount and mt.disc is not null then mt.disc else mt.std end;
            insert into membership (member_id, membership_type_id, start_mode, sessions_total,
                                    sessions_left, status, created_by, created_at, updated_by, updated_at)
            values (v_mid, mt.id, 'first_visit', mt.sessions, mt.sessions, 'aktivna',
                    v_staff, v_t, v_staff, v_t)
            returning id into v_ms;
            insert into payment (member_id, staff_id, shift_id, membership_type_id, membership_id,
                                 kind, amount_rsd, business_date, paid_at,
                                 created_by, created_at, updated_by, updated_at)
            values (v_mid, v_staff, v_shift, mt.id, v_ms, 'membership', v_amount, d, v_t,
                    v_staff, v_t, v_staff, v_t);
            update member set created_at = v_t, created_by = v_staff, updated_at = v_t,
                              updated_by = v_staff
            where id = v_mid;
            update dm_st set ms_id = v_ms, ms_type = mt.id, ms_start = null, ms_end = null,
                             ms_left = mt.sessions, ms_time = true
            where member_id = v_mid;
          end if;
        end if;
      else
        perform demo._new_member(d, d, v_workers, v_trainers, p_to);
      end if;
    end loop;

    -- Today's arrivals -------------------------------------------------------------
    drop table if exists pg_temp.dm_arr;
    create temp table dm_arr as
    select st.member_id,
           demo.at(d, demo.arrival_minute(d)) as t,
           demo.rint(60, 110) as dur,
           false as fitpass
    from dm_st st
    where st.alive_from <= d
      and st.alive_until >= d
      and not (st.pause_from is not null and d between st.pause_from and st.pause_to)
      and (st.alive_from = d
           or random() < least(0.95, st.rate / 7 * demo.weekday(d) * demo.season(d)));

    -- Fitpass guests.
    v_fit := round(demo.rint(6, 12) * demo.weekday(d) * demo.season(d))::int;
    insert into dm_arr
    select null, demo.at(d, demo.arrival_minute(d)), demo.rint(60, 100), true
    from generate_series(1, v_fit);

    v_keys := array_fill('-infinity'::timestamptz, array[22]);

    for a in select * from dm_arr order by t loop
      v_t := a.t;
      if v_t < v_s1_start then v_t := v_s1_start + make_interval(mins => demo.rint(1, 5)); end if;
      if v_t > v_horizon then continue; end if;

      if v_handover is not null and v_t >= v_handover then
        v_staff := v_s2_staff; v_shift := v_s2;
      else
        v_staff := v_s1_staff; v_shift := v_s1;
      end if;

      -- A payment is rung up a minute after the arrival, but never past a handover.
      v_pt := v_t + interval '1 min';
      if v_handover is not null and v_t < v_handover and v_pt >= v_handover then
        v_pt := v_t;
      end if;

      v_out :=least(v_t + make_interval(mins => a.dur), demo.at(d, v_close + 5));

      -- Key: a random free key; members occasionally go without ("bez ključa").
      v_key := null;
      if a.fitpass or random() > 0.04 then
        v_free := array(select k from generate_series(1, 22) k where v_keys[k] <= v_t);
        if array_length(v_free, 1) > 0 then
          v_key := v_free[1 + floor(random() * array_length(v_free, 1))::int];
        end if;
      end if;
      if a.fitpass and v_key is null then continue; end if; -- Fitpass needs a key

      -- Fitpass ---------------------------------------------------------------------
      if a.fitpass then
        insert into checkin (member_id, staff_id, shift_id, key_no, is_fitpass, is_group_fitpass,
                             key_returned, checked_out_at, business_date,
                             created_by, created_at, updated_by, updated_at)
        values (null, v_staff, v_shift, v_key, true, random() < 0.2,
                v_out <= v_horizon, case when v_out <= v_horizon then v_out end, d,
                v_staff, v_t, v_staff, v_t)
        returning id into v_ck;
        insert into payment (staff_id, shift_id, checkin_id, kind, amount_rsd, is_fitpass,
                             business_date, paid_at, created_by, created_at, updated_by, updated_at)
        select v_staff, v_shift, v_ck, 'fitpass_surcharge', 300, true, d, v_t,
               v_staff, v_t, v_staff, v_t
        from checkin where id = v_ck and is_group_fitpass;
        v_keys[v_key] := case when v_out <= v_horizon then v_out else 'infinity' end;
        continue;
      end if;

      -- Member ----------------------------------------------------------------------
      select * into s from dm_st where member_id = a.member_id;
      v_valid := s.ms_id is not null
                 and (s.ms_start is null or s.ms_end >= d)
                 and (s.ms_time or s.ms_left > 0);
      v_ms := null;
      v_pay := null;
      v_trainer := s.persona = 'trener';
      select * into mt from dm_type where id = coalesce(case when v_valid then s.ms_type end, s.pref_type);
      v_cat := mt.cat_id;
      v_dec := false;

      -- Churned members sometimes still show up once more without paying: skip them.
      if not v_valid and random() > s.renew_p and s.ms_id is null and s.exp_id is null
         and s.alive_from < d then
        update dm_st set alive_until = d - 1 where member_id = s.member_id;
        continue;
      end if;

      -- Occasionally the worker picks the wrong member first and cancels it (void).
      if random() < 0.005 then
        insert into checkin (member_id, staff_id, shift_id, key_no, business_date, voided,
                             voided_at, voided_by, created_by, created_at, updated_by, updated_at)
        select id, v_staff, v_shift, null, d, true, v_t - interval '1 min', v_staff,
               v_staff, v_t - interval '2 min', v_staff, v_t - interval '1 min'
        from member where id <> s.member_id and not archived
        order by random() limit 1;
      end if;

      insert into checkin (member_id, staff_id, shift_id, key_no, business_date,
                           created_by, created_at, updated_by, updated_at)
      values (s.member_id, v_staff, v_shift, v_key, d, v_staff, v_t, v_staff, v_t)
      returning id into v_ck;

      -- A walk-in who signs up today is registered right before their first arrival.
      if s.alive_from = d and not exists (select 1 from membership where member_id = s.member_id) then
        update member set created_at = v_t - interval '3 min', created_by = v_staff,
                          updated_at = v_t - interval '3 min', updated_by = v_staff
        where id = s.member_id and created_at >= demo.at(d, 0);
      end if;

      if not v_valid then
        if v_trainer and s.exp_id is null and random() < 0.35 then
          -- Trainer session without an active package: reserved debt at the captured daily
          -- price (create_checkin's reserved branch); it is settled with the next payment.
          select std into v_price from dm_type where cat_id = mt.cat_id and package = '1/1';
          update checkin set with_trainer = true, training_category_id = mt.cat_id,
                             trainer_id = s.trainer_id
          where id = v_ck;
          insert into reserved_session (member_id, checkin_id, training_category_id, session_date,
                                        amount_rsd, created_by, created_at)
          values (s.member_id, v_ck, mt.cat_id, d, v_price, v_staff, v_t);
          v_dec := true;
        elsif s.exp_id is not null and s.exp_left > 0 and random() < 0.5 then
          -- Uses a remaining session of the expired package (override after expiry).
          update membership set sessions_left = sessions_left - 1, updated_at = v_t,
                                updated_by = v_staff
          where id = s.exp_id;
          select * into mt from dm_type where id = (select membership_type_id from membership where id = s.exp_id);
          update checkin set membership_id = s.exp_id, decremented_session = true,
                             with_trainer = mt.cat in ('individualni', 'duo', 'vodjeni'),
                             training_category_id = case when mt.cat in ('individualni', 'duo', 'vodjeni') then mt.cat_id end,
                             trainer_id = case when mt.cat in ('individualni', 'duo', 'vodjeni') then s.trainer_id end
          where id = v_ck;
          if mt.cat in ('individualni', 'duo', 'vodjeni') then
            insert into session_log (member_id, membership_id, checkin_id, trainer_id,
                                     training_category_id, session_date, created_at)
            values (s.member_id, s.exp_id, v_ck, s.trainer_id, mt.cat_id, d, v_t);
          end if;
          update dm_st set exp_left = exp_left - 1,
                           exp_id = case when exp_left - 1 > 0 then exp_id end
          where member_id = s.member_id;
          v_dec := true;
        else
          -- Pays for a new membership at the counter.
          v_type := s.pref_type;
          if random() < 0.08 then
            -- occasionally tries a different package in the same category
            select id into v_type from dm_type
            where cat = (select cat from dm_type where id = s.pref_type) and package <> '1/1'
            order by random() limit 1;
            v_type := coalesce(v_type, s.pref_type);
          end if;
          select * into mt from dm_type where id = v_type;
          v_amount := case when s.discount and mt.cat = 'otvoreni' and mt.disc is not null
                           then mt.disc else mt.std end;
          v_custom := random() < 0.03 and mt.package <> '1/1';
          v_reason := null;
          if v_custom then
            v_amount := greatest(100, v_amount - 100 * demo.rint(2, 8));
            v_reason := demo.pick(array['Stari cenovnik', 'Dogovor sa vlasnikom', 'Student',
                                        'Povratak posle povrede', 'Porodični popust']);
          end if;

          if s.ms_id is not null then
            update membership set status = 'istekla', updated_at = v_t where id = s.ms_id;
          end if;

          insert into membership (member_id, membership_type_id, start_mode, start_date, end_date,
                                  sessions_total, sessions_left, status,
                                  created_by, created_at, updated_by, updated_at)
          values (s.member_id, mt.id, 'payment', d, d + (mt.duration_days - 1),
                  mt.sessions, mt.sessions, 'aktivna', v_staff, v_t, v_staff, v_t)
          returning id into v_ms;

          -- Rarely a wrong package is rung up first and voided.
          if random() < 0.003 then
            insert into payment (member_id, staff_id, shift_id, membership_type_id, kind, amount_rsd,
                                 business_date, paid_at, voided, voided_by, voided_at, void_reason,
                                 created_by, created_at, updated_by, updated_at)
            select s.member_id, v_staff, v_shift, o.id, 'membership', o.std, d, v_t,
                   true, v_staff, v_t + interval '2 min', 'Pogrešan paket',
                   v_staff, v_t, v_staff, v_t + interval '2 min'
            from dm_type o where o.id <> mt.id and o.cat = mt.cat order by random() limit 1;
          end if;

          insert into payment (member_id, staff_id, shift_id, membership_type_id, membership_id,
                               checkin_id, kind, amount_rsd, is_custom_price, custom_reason,
                               business_date, paid_at, created_by, created_at, updated_by, updated_at)
          values (s.member_id, v_staff, v_shift, mt.id, v_ms, v_ck, 'membership', v_amount,
                  v_custom, v_reason, d, v_pt,
                  v_staff, v_pt, v_staff, v_pt)
          returning id into v_pay;

          -- Any open debt is settled with the payment (one row per reserved session).
          for v_rs in select * from reserved_session
                      where member_id = s.member_id and not settled order by created_at loop
            insert into payment (member_id, staff_id, shift_id, kind, amount_rsd, business_date,
                                 paid_at, created_by, created_at, updated_by, updated_at)
            values (s.member_id, v_staff, v_shift, 'debt_settlement', v_rs.amount_rsd, d,
                    v_pt, v_staff, v_pt,
                    v_staff, v_pt)
            returning id into v_pay;
            update reserved_session
            set settled = true, settled_payment_id = v_pay, settled_at = v_pt
            where id = v_rs.id;
          end loop;

          -- Some time-based memberships get a pause of 1–4 weeks (more often around holidays).
          v_pause_pct := case when extract(month from d) in (6, 7, 8, 12) then 35 else 18 end;
          if mt.is_time_based and random() * 100 < v_pause_pct then
            update dm_st set pause_from = d + demo.rint(5, 15) where member_id = s.member_id;
            update dm_st set pause_to = pause_from + demo.rint(7, 28) - 1 where member_id = s.member_id;
          else
            update dm_st set pause_from = null, pause_to = null where member_id = s.member_id;
          end if;

          update dm_st
          set ms_id = v_ms, ms_type = mt.id, ms_start = d, ms_end = d + (mt.duration_days - 1),
              ms_left = mt.sessions, ms_time = mt.is_time_based
          where member_id = s.member_id;

          if (select pause_from from dm_st where member_id = s.member_id) is not null then
            update dm_st set ms_end = ms_end + (pause_to - pause_from + 1)
            where member_id = s.member_id;
            update membership m
            set end_date = st.ms_end, paused_days = st.pause_to - st.pause_from + 1
            from dm_st st
            where m.id = v_ms and st.member_id = s.member_id;
          end if;

          v_valid := true;
          select * into s from dm_st where member_id = s.member_id;
        end if;
      end if;

      -- Session accounting on a valid membership.
      if v_valid and not v_dec then
        -- first visit starts a prepaid first_visit membership
        if s.ms_start is null then
          update membership set start_date = d, end_date = d + (mt.duration_days - 1),
                                updated_at = v_t, updated_by = v_staff
          where id = s.ms_id;
          update dm_st set ms_start = d, ms_end = d + (mt.duration_days - 1)
          where member_id = s.member_id;
        end if;

        update checkin set membership_id = s.ms_id where id = v_ck;

        if mt.cat in ('individualni', 'duo', 'vodjeni') then
          update checkin set with_trainer = true, training_category_id = mt.cat_id,
                             trainer_id = s.trainer_id, decremented_session = true
          where id = v_ck;
          update membership set sessions_left = sessions_left - 1, updated_at = v_t,
                                updated_by = v_staff
          where id = s.ms_id;
          insert into session_log (member_id, membership_id, checkin_id, trainer_id,
                                   training_category_id, session_date, created_at)
          values (s.member_id, s.ms_id, v_ck, s.trainer_id, mt.cat_id, d, v_t);
          update dm_st set ms_left = ms_left - 1 where member_id = s.member_id;
        elsif mt.cat = 'otvoreni' and not mt.is_time_based then
          update checkin set decremented_session = true where id = v_ck;
          update membership set sessions_left = sessions_left - 1, updated_at = v_t,
                                updated_by = v_staff
          where id = s.ms_id;
          update dm_st set ms_left = ms_left - 1 where member_id = s.member_id;
        end if;

        -- Loyal members sometimes pay the next month a few days early (queued, zakazana).
        if mt.is_time_based and v_pay is null and s.q_id is null
           and s.ms_end is not null and s.ms_end - d between 0 and 3
           and random() < 0.5 and s.alive_until > d + 30 then
          v_amount := case when s.discount and mt.cat = 'otvoreni' and mt.disc is not null
                           then mt.disc else mt.std end;
          insert into membership (member_id, membership_type_id, start_mode, sessions_total,
                                  sessions_left, status, created_by, created_at, updated_by, updated_at)
          values (s.member_id, mt.id, 'payment', mt.sessions, mt.sessions, 'zakazana',
                  v_staff, v_t, v_staff, v_t)
          returning id into v_ms;
          insert into payment (member_id, staff_id, shift_id, membership_type_id, membership_id,
                               checkin_id, kind, amount_rsd, business_date, paid_at,
                               created_by, created_at, updated_by, updated_at)
          values (s.member_id, v_staff, v_shift, mt.id, v_ms, v_ck, 'membership', v_amount, d,
                  v_pt, v_staff, v_pt,
                  v_staff, v_pt);
          update dm_st set q_id = v_ms, q_type = mt.id where member_id = s.member_id;
        end if;
      end if;

      -- Leaving: key back ("Otišao"); about one key a week is never returned.
      if v_out <= v_horizon and not (v_key is not null and random() < 1.0 / 450) then
        update checkin set key_returned = true, checked_out_at = v_out where id = v_ck;
        if v_key is not null then v_keys[v_key] := v_out; end if;
      elsif v_key is not null then
        v_keys[v_key] := 'infinity';
      end if;
    end loop;

    d := d + 1;
  end loop;

  -- Finalise ------------------------------------------------------------------------

  -- Memberships paused right now: status pauzirana, end_date not yet extended.
  update membership m
  set status = 'pauzirana',
      paused_at = demo.at(st.pause_from, 10 * 60),
      paused_days = 0,
      end_date = m.end_date - (st.pause_to - st.pause_from + 1)
  from dm_st st
  where m.id = st.ms_id
    and st.pause_from is not null
    and p_to between st.pause_from and st.pause_to
    and m.status = 'aktivna';

  -- Pauses that have not started yet did not happen.
  update membership m
  set end_date = m.end_date - (st.pause_to - st.pause_from + 1), paused_days = 0
  from dm_st st
  where m.id = st.ms_id and st.pause_from is not null and st.pause_from > p_to;

  -- Walk-ins "signed up" today after 11:00 never arrived: drop them.
  delete from member m
  where m.created_at > demo.at(p_to, 11 * 60)
    and not exists (select 1 from checkin c where c.member_id = m.id)
    and not exists (select 1 from membership x where x.member_id = m.id);
  delete from pg_temp.dm_st st where not exists (select 1 from member m where m.id = st.member_id);

  -- Some long-gone members were archived (never with open debt). Every fifth one,
  -- by member number, so the choice is deterministic.
  update member m
  set archived = true,
      archived_at = demo.at(st.alive_until + 45, 12 * 60),
      updated_at = demo.at(st.alive_until + 45, 12 * 60),
      updated_by = v_admin
  from dm_st st
  where m.id = st.member_id
    and st.alive_until < p_to - 90
    and m.member_no % 5 = 0
    and not exists (select 1 from reserved_session r where r.member_id = m.id and not r.settled)
    and not exists (select 1 from membership x where x.member_id = m.id
                    and x.status in ('aktivna', 'pauzirana', 'zakazana'));

  return jsonb_build_object(
    'today',       p_to,
    'members',     (select count(*) from member),
    'checkins',    (select count(*) from checkin where not voided),
    'payments',    (select count(*) from payment where not voided),
    'takings_rsd', (select coalesce(sum(amount_rsd), 0) from payment where not voided),
    'shifts',      (select count(*) from shift)
  );
end $$;

-- Creates one member with a persona. p_joined is the sign-up day, p_alive_from the
-- first day they may arrive; p_established marks members who joined before the
-- window (they already stayed, so they are never the "drop-out" persona).
-- Returns the member id.
drop function if exists demo._new_member(date, date, uuid[], uuid[], date);
create or replace function demo._new_member(
  p_joined     date,
  p_alive_from date,
  p_workers    uuid[],
  p_trainers   uuid[],
  p_today      date,
  p_established boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = public, demo
as $$
declare
  v_r        numeric := random();
  v_persona  text;
  v_rate     numeric;
  v_type     bigint;
  v_cat      text;
  v_pkg      text;
  v_until    date;
  v_renew    numeric;
  v_female   boolean := random() < 0.52;
  v_first    text;
  v_phone    text;
  v_id       uuid;
  v_staff    uuid := p_workers[1 + floor(random() * 3)::int];
  v_at       timestamptz;
begin
  if p_established and v_r >= 0.75 and v_r < 0.90 then
    v_r := random() * 0.75;
  end if;

  if v_r < 0.35 then
    v_persona := 'verni';   v_rate := 2.8 + random() * 1.4;  v_renew := 0.98;
    v_type := case when random() < 0.12 then (select id from pg_temp.dm_type where cat = 'kardio')
                   else (select id from pg_temp.dm_type where cat = 'otvoreni' and package = '30/1') end;
    v_until := case when random() < 0.12 then p_alive_from + demo.rint(60, 330) else p_today + 1000 end;
  elsif v_r < 0.60 then
    v_persona := 'povremeni'; v_rate := 1.2 + random() * 1.2; v_renew := 0.9;
    v_pkg := case when random() < 0.5 then '8/1' else '12/1' end;
    v_type := (select id from pg_temp.dm_type where cat = 'otvoreni' and package = v_pkg);
    v_until := case when random() < 0.5 then p_alive_from + demo.rint(45, 300) else p_today + 1000 end;
  elsif v_r < 0.75 then
    v_persona := 'trener';  v_rate := 1.6 + random() * 1.0;  v_renew := 0.93;
    v_cat := case when random() < 0.5 then 'individualni'
                  when random() < 0.4 then 'duo' else 'vodjeni' end;
    v_pkg := demo.pick(array(select package from pg_temp.dm_type
                             where cat = v_cat and package <> '1/1' order by sessions));
    v_type := (select id from pg_temp.dm_type where cat = v_cat and package = v_pkg);
    v_until := case when random() < 0.3 then p_alive_from + demo.rint(60, 300) else p_today + 1000 end;
  elsif v_r < 0.90 then
    v_persona := 'odustaje'; v_rate := 2.0 + random() * 1.2; v_renew := 0.7;
    v_pkg := case when random() < 0.6 then '30/1' else '12/1' end;
    v_type := (select id from pg_temp.dm_type where cat = 'otvoreni' and package = v_pkg);
    v_until := p_alive_from + demo.rint(25, 100);
  else
    v_persona := 'dnevni';  v_rate := 0.3 + random() * 0.6;  v_renew := 0.97;
    v_type := (select id from pg_temp.dm_type where cat = 'otvoreni' and package = '1/1');
    v_until := case when random() < 0.4 then p_alive_from + demo.rint(30, 250) else p_today + 1000 end;
  end if;

  v_first := demo.pick(case when v_female then demo.first_names_f() else demo.first_names_m() end);
  loop
    v_phone := '06' || demo.pick(array['0','1','2','3','4','5','6','9']) || ' '
               || lpad(demo.rint(0, 999)::text, 3, '0') || ' '
               || lpad(demo.rint(0, 9999)::text, 4, '0');
    exit when not exists (
      select 1 from member where regexp_replace(phone, '\D', '', 'g') = regexp_replace(v_phone, '\D', '', 'g'));
  end loop;

  v_at := demo.at(p_joined, demo.arrival_minute(p_joined));

  insert into member (first_name, last_name, phone, discount_flag, comment,
                      created_by, created_at, updated_by, updated_at)
  values (
    v_first,
    demo.pick(demo.last_names()),
    v_phone,
    random() < 0.12,
    case when random() < 0.05 then demo.pick(array[
      'Povreda kolena — bez čučnjeva sa opterećenjem.',
      'Astma — ima pumpicu u torbi.',
      'Operacija ramena pre 6 meseci, lagano.',
      'Dijabetes tip 1.',
      'Trudnoća — samo lagani kardio.',
      'Hernija diska — bez mrtvog dizanja.',
      'Plaća i za brata, dolaze zajedno.'])
    end,
    v_staff, v_at, v_staff, v_at)
  returning id into v_id;

  insert into pg_temp.dm_st (member_id, persona, rate, pref_type, discount, trainer_id,
                             alive_from, alive_until, renew_p)
  values (v_id, v_persona, v_rate, v_type,
          (select discount_flag from member where id = v_id),
          p_trainers[1 + floor(random() * 2)::int],
          p_alive_from, v_until, v_renew);

  return v_id;
end $$;

-- -----------------------------------------------------------------------------
-- demo.reset(p_today): wipe operational data and regenerate ~13 months up to today
-- (one extra month of warm-up so the oldest visible month is not a sign-up spike).
-- Catalog (training_category, membership_type, price, gym_key) and staff are kept.
-- -----------------------------------------------------------------------------
create or replace function demo.reset(p_today date default business_today())
returns jsonb
language plpgsql
security definer
set search_path = public, demo
as $$
declare
  v_stats jsonb;
begin
  -- Same order as scripts/wipe-operational-data.sql (FK-safe).
  delete from reserved_session;
  delete from session_log;
  delete from payment;
  delete from checkin;
  delete from membership;
  delete from member;
  delete from shift;
  delete from login_attempt;
  alter sequence member_no_seq restart with 1;

  v_stats := demo.generate(p_today - 394, p_today);

  insert into demo.meta (k, v) values ('last_reset', v_stats)
  on conflict (k) do update set v = excluded.v;

  return v_stats;
end $$;

revoke all on all functions in schema demo from public, anon, authenticated;
