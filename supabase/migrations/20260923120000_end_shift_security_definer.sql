-- end_shift(): run as SECURITY DEFINER, like open_or_resume_shift / handover_shift.
--
-- Migration 20260618120100 dropped the `shift_select_open` policy so workers have
-- no SELECT on `shift`. end_shift() was still SECURITY INVOKER, and an UPDATE with a
-- WHERE clause also needs the row to pass a SELECT policy — so for a worker the
-- update silently matched 0 rows: "Završi smenu" left the shift open until the
-- pg_cron auto-close (shown as "Auto-zatvaranje" instead of "Završena ručno").
--
-- The body only ever closes the caller's own shift (staff_id = auth.uid()), so
-- running it as the owner does not widen what a worker can do.

alter function public.end_shift() security definer;
alter function public.end_shift() set search_path = public;

revoke execute on function public.end_shift() from public, anon;
grant  execute on function public.end_shift() to authenticated;
