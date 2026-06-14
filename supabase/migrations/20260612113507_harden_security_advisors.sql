-- pin search_path on business_today
alter function public.business_today() set search_path = '';

-- trigger-only functions: remove RPC exposure (triggers still fire regardless)
revoke execute on function public.assign_member_no() from public;
revoke execute on function public.handle_new_user() from public;

-- policy helpers: callable only by signed-in users (needed for policy evaluation), not anon
revoke execute on function public.is_admin() from public;
grant  execute on function public.is_admin() to authenticated;
revoke execute on function public.current_staff() from public;
grant  execute on function public.current_staff() to authenticated;
revoke execute on function public.business_today() from public;
grant  execute on function public.business_today() to authenticated;

-- bind permissive write policies to the acting staff member (audit per DB.md §5)
alter policy member_insert           on member           with check (created_by = auth.uid());
alter policy member_update           on member           using (true) with check (updated_by = auth.uid());
alter policy membership_insert       on membership       with check (created_by = auth.uid());
alter policy membership_update       on membership       using (true) with check (updated_by = auth.uid());
alter policy payment_insert          on payment          with check (staff_id = auth.uid());
alter policy checkin_insert          on checkin          with check (staff_id = auth.uid());
alter policy reserved_session_insert on reserved_session  with check (created_by = auth.uid());
