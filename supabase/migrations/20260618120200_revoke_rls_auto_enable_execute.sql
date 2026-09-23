-- Remove RPC exposure of the rls_auto_enable() event-trigger function.
--
-- Supabase advisor 0028/0029: rls_auto_enable() is SECURITY DEFINER with EXECUTE
-- granted to PUBLIC/anon/authenticated, so it is callable via /rest/v1/rpc/.
-- It is only meant to fire from the `ensure_rls` event trigger (which runs
-- regardless of EXECUTE grants), so no role needs the RPC. Owned by `postgres`,
-- so this revoke is safe and does not affect the event trigger.
--
-- The function is created by the hosted project (not by these migrations), so a
-- fresh database (local `supabase db reset`, CI) does not have it: guard the revoke.

do $$
begin
  if to_regprocedure('public.rls_auto_enable()') is not null then
    revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
  end if;
end $$;
