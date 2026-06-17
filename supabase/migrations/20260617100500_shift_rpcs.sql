-- Shift lifecycle RPCs for counter workers.
-- Workers do not SELECT/UPDATE shift directly (RLS admin-only read); these SECURITY DEFINER
-- functions enforce the single-open-shift invariant and handover (ended_reason = 'switch').

create or replace function public.ensure_open_shift()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_staff_id   uuid := auth.uid();
  v_open       shift%rowtype;
  v_is_active  boolean;
begin
  if v_staff_id is null then
    raise exception 'Niste prijavljeni.';
  end if;

  select active into v_is_active from staff where id = v_staff_id;
  if not found or not v_is_active then
    raise exception 'Nalog je deaktiviran.';
  end if;

  -- Lock any open shift row to avoid duplicate opens under concurrent requests
  select * into v_open
  from shift
  where ended_at is null
  order by started_at desc
  limit 1
  for update;

  if not found then
    insert into shift (staff_id, started_at)
    values (v_staff_id, now());
    return;
  end if;

  if v_open.staff_id = v_staff_id then
    return;
  end if;

  -- Handover: close outgoing worker's shift, open for current auth user
  update shift
  set ended_at = now(),
      ended_reason = 'switch'
  where id = v_open.id;

  insert into shift (staff_id, started_at)
  values (v_staff_id, now());
end;
$$;

create or replace function public.end_shift()
returns void
language plpgsql
security definer
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

revoke execute on function public.ensure_open_shift() from public, anon;
revoke execute on function public.end_shift() from public, anon;
grant  execute on function public.ensure_open_shift() to authenticated;
grant  execute on function public.end_shift() to authenticated;
