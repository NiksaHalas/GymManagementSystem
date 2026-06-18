-- Shift least-privilege: stop exposing the open shift row to non-admin workers.
--
-- The `shift_select_open` policy was added only so the SECURITY INVOKER
-- open_or_resume_shift() could SELECT the currently-open shift. Per PRD §2 a
-- worker should not read shifts at all. We instead make open_or_resume_shift()
-- SECURITY DEFINER (like handover_shift / end_shift's owner runs with BYPASSRLS),
-- so it no longer needs an RLS SELECT grant, and drop the policy. Admins keep
-- full read via `shift_select`.

create or replace function public.open_or_resume_shift()
returns text
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

-- The SELECT policy is no longer needed now that open_or_resume_shift is DEFINER.
drop policy if exists shift_select_open on shift;

-- Keep execute grants intact (idempotent).
revoke execute on function public.open_or_resume_shift() from public, anon;
grant  execute on function public.open_or_resume_shift() to authenticated;
