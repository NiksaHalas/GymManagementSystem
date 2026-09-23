-- Nightly demo reset (hosted demo project ONLY — never a real gym project).
-- Apply after supabase/demo/demo_generator.sql; see docs/demo.md.
--
-- pg_cron runs in UTC: 00:30 UTC is 01:30 (winter) / 02:30 (summer) in Belgrade,
-- after the gym's own jobs (shift auto-close, membership promotion).

select cron.unschedule('demo-nightly-reset')
where exists (select 1 from cron.job where jobname = 'demo-nightly-reset');

select cron.schedule('demo-nightly-reset', '30 0 * * *', $$select demo.reset()$$);
