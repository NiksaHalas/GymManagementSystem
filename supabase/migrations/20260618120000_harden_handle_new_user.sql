-- Harden handle_new_user: never derive role from client-suppliable auth metadata.
--
-- Authorization (role) must never depend on data the client controls. A user can
-- set raw_user_meta_data.role at signup, so trusting it allows privilege escalation
-- if public signup is ever enabled. The trigger now always creates 'user'; the
-- admin role is granted exclusively through the server-authoritative service-role
-- channel (see app/api/admin/accounts/route.ts and scripts/seed-admins.mjs, which
-- run an explicit `update staff set role='admin'` after createUser).

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.staff (id, username, role, recovery_email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'username', split_part(new.email, '@', 1)),
    'user',  -- role is NEVER taken from client-suppliable metadata; granted via service-role update
    new.raw_user_meta_data->>'recovery_email'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;
