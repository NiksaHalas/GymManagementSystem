-- Read-only check: does the authenticated worker have an open shift?
-- Used by the logout flow to prompt "Završi smenu" before signing out.

create or replace function public.has_open_shift()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from shift
    where staff_id = auth.uid()
      and ended_at is null
  );
$$;

revoke execute on function public.has_open_shift() from public, anon;
grant execute on function public.has_open_shift() to authenticated;
