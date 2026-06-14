-- Enable pg_cron extension for scheduled jobs.
-- pg_cron is available on Supabase but not enabled by default.
create extension if not exists pg_cron schema cron;

-- auto_close_shifts(): closes any open shift after the gym's closing time + 20 min grace.
-- Closing times (Europe/Belgrade local time):
--   Monday–Friday  21:00  → trigger fires from 21:20
--   Saturday       18:00  → trigger fires from 18:20
--   Sunday         16:00  → trigger fires from 16:20
--
-- ended_at is stamped to the actual closing time (NOT to the current time),
-- so the shift record reflects when the worker was supposed to leave.
-- Auth sessions are NOT touched.

create or replace function public.auto_close_shifts()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  belgrade_now   timestamptz := now() at time zone 'Europe/Belgrade';
  belgrade_date  date        := belgrade_now::date;
  dow            int         := extract(isodow from belgrade_now); -- 1=Mon..7=Sun
  close_time     time;
  close_instant  timestamptz;
  trigger_time   timestamptz;
begin
  -- Closing times: Mon-Fri 21:00, Sat 18:00, Sun 16:00
  if dow between 1 and 5 then
    close_time := '21:00'::time;
  elsif dow = 6 then
    close_time := '18:00'::time;
  else
    close_time := '16:00'::time;
  end if;

  -- The instant the gym closes, expressed in UTC
  close_instant := (belgrade_date + close_time) at time zone 'Europe/Belgrade';
  -- Only run after the 20-minute grace period
  trigger_time  := close_instant + interval '20 minutes';

  if now() < trigger_time then
    return; -- too early
  end if;

  -- Close all open shifts
  update public.shift
  set
    ended_at     = greatest(close_instant, started_at),
    ended_reason = 'auto_close'
  where ended_at is null;
end;
$$;

-- Restrict execution: Postgres grants EXECUTE to PUBLIC by default; revoke it.
revoke execute on function public.auto_close_shifts() from public;
revoke execute on function public.auto_close_shifts() from anon, authenticated;
grant  execute on function public.auto_close_shifts() to service_role;

-- Schedule: every 10 minutes, 14:00–20:00 UTC.
-- This window covers all three Belgrade closing triggers for both CET (UTC+1) and CEST (UTC+2).
-- The function gates internally on local time, so it's safe to run frequently.
select cron.schedule(
  'auto-close-shifts',
  '*/10 14-20 * * *',
  $$ select public.auto_close_shifts(); $$
);
