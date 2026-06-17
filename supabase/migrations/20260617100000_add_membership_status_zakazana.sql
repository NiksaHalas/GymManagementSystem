-- Add 'zakazana' (pre-paid, queued) membership status.
-- Must be in a separate migration before use (Postgres enum rule).
alter type membership_status add value if not exists 'zakazana';
