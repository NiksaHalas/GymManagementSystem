-- Rate limiting for login attempts.
-- Stores per (username + IP) attempt records; old rows are cleaned up periodically by the app.
-- No RLS needed — only the service-role admin client writes/reads this table.

create table if not exists login_attempt (
  id            bigint generated always as identity primary key,
  attempt_key   text not null,     -- "login:<username>:<ip>"
  attempted_at  timestamptz not null default now()
);

create index login_attempt_key_at_idx
  on login_attempt (attempt_key, attempted_at);

-- Revoke from anon/authenticated; only service_role accesses this table
revoke all on login_attempt from anon, authenticated;
grant all on login_attempt to service_role;

-- Enable RLS (no policies: anon/authenticated are revoked, service_role bypasses RLS)
alter table login_attempt enable row level security;
alter table login_attempt force row level security;
