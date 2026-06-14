-- base privileges (RLS is the real filter on top of these)
grant usage on schema public to anon, authenticated, service_role;
grant select, insert, update, delete on all tables in schema public to authenticated, service_role;
grant usage, select on all sequences in schema public to authenticated, service_role;

-- enable + force RLS on every table
alter table staff            enable row level security; alter table staff            force row level security;
alter table shift            enable row level security; alter table shift            force row level security;
alter table member           enable row level security; alter table member           force row level security;
alter table membership_type  enable row level security; alter table membership_type  force row level security;
alter table price            enable row level security; alter table price            force row level security;
alter table membership       enable row level security; alter table membership       force row level security;
alter table gym_key          enable row level security; alter table gym_key          force row level security;
alter table payment          enable row level security; alter table payment          force row level security;
alter table checkin          enable row level security; alter table checkin          force row level security;
alter table session_log      enable row level security; alter table session_log      force row level security;
alter table reserved_session enable row level security; alter table reserved_session force row level security;

-- staff: read self or admin; only admin manages accounts
create policy staff_select on staff for select to authenticated using (id = auth.uid() or is_admin());
create policy staff_insert on staff for insert to authenticated with check (is_admin());
create policy staff_update on staff for update to authenticated using (is_admin()) with check (is_admin());
create policy staff_delete on staff for delete to authenticated using (is_admin());

-- shift: admin reads all; a worker manages their own
create policy shift_select on shift for select to authenticated using (is_admin());
create policy shift_insert on shift for insert to authenticated with check (staff_id = auth.uid() or is_admin());
create policy shift_update on shift for update to authenticated using (staff_id = auth.uid() or is_admin()) with check (staff_id = auth.uid() or is_admin());

-- member: any worker, anytime; only admin hard-deletes
create policy member_select on member for select to authenticated using (true);
create policy member_insert on member for insert to authenticated with check (true);
create policy member_update on member for update to authenticated using (true) with check (true);
create policy member_delete on member for delete to authenticated using (is_admin());

-- membership_type: everyone reads; admin writes
create policy membership_type_select on membership_type for select to authenticated using (true);
create policy membership_type_insert on membership_type for insert to authenticated with check (is_admin());
create policy membership_type_update on membership_type for update to authenticated using (is_admin()) with check (is_admin());
create policy membership_type_delete on membership_type for delete to authenticated using (is_admin());

-- price: everyone reads; admin writes
create policy price_select on price for select to authenticated using (true);
create policy price_insert on price for insert to authenticated with check (is_admin());
create policy price_update on price for update to authenticated using (is_admin()) with check (is_admin());
create policy price_delete on price for delete to authenticated using (is_admin());

-- membership: counter operations by any worker; admin deletes
create policy membership_select on membership for select to authenticated using (true);
create policy membership_insert on membership for insert to authenticated with check (true);
create policy membership_update on membership for update to authenticated using (true) with check (true);
create policy membership_delete on membership for delete to authenticated using (is_admin());

-- gym_key: everyone reads; admin writes
create policy gym_key_select on gym_key for select to authenticated using (true);
create policy gym_key_insert on gym_key for insert to authenticated with check (is_admin());
create policy gym_key_update on gym_key for update to authenticated using (is_admin()) with check (is_admin());
create policy gym_key_delete on gym_key for delete to authenticated using (is_admin());

-- payment: insert by any worker; update/void only same-day for users, any day for admin
create policy payment_select on payment for select to authenticated using (true);
create policy payment_insert on payment for insert to authenticated with check (true);
create policy payment_update on payment for update to authenticated using (is_admin() or business_date = business_today()) with check (is_admin() or business_date = business_today());
create policy payment_delete on payment for delete to authenticated using (is_admin());

-- checkin: insert by any worker; update only same-day for users, any day for admin
create policy checkin_select on checkin for select to authenticated using (true);
create policy checkin_insert on checkin for insert to authenticated with check (true);
create policy checkin_update on checkin for update to authenticated using (is_admin() or business_date = business_today()) with check (is_admin() or business_date = business_today());
create policy checkin_delete on checkin for delete to authenticated using (is_admin());

-- session_log: read/insert by any worker; admin edits/deletes (history)
create policy session_log_select on session_log for select to authenticated using (true);
create policy session_log_insert on session_log for insert to authenticated with check (true);
create policy session_log_update on session_log for update to authenticated using (is_admin()) with check (is_admin());
create policy session_log_delete on session_log for delete to authenticated using (is_admin());

-- reserved_session: counter operations by any worker; admin deletes
create policy reserved_session_select on reserved_session for select to authenticated using (true);
create policy reserved_session_insert on reserved_session for insert to authenticated with check (true);
create policy reserved_session_update on reserved_session for update to authenticated using (true) with check (true);
create policy reserved_session_delete on reserved_session for delete to authenticated using (is_admin());
