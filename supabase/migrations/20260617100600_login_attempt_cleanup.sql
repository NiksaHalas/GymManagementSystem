-- Periodic cleanup of stale login rate-limit rows (sliding 15-minute window).

create or replace function public.cleanup_login_attempts()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from login_attempt
  where attempted_at < now() - interval '15 minutes';
end;
$$;

revoke execute on function public.cleanup_login_attempts() from public, anon, authenticated;
grant  execute on function public.cleanup_login_attempts() to service_role;

select cron.schedule(
  'cleanup-login-attempts',
  '*/15 * * * *',
  $$ select public.cleanup_login_attempts(); $$
);
