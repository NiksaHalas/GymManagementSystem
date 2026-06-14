-- trigger-only functions: no role needs EXECUTE (triggers invoke them regardless)
revoke execute on function public.assign_member_no() from anon, authenticated;
revoke execute on function public.handle_new_user() from anon, authenticated;

-- policy helpers: only signed-in users need EXECUTE (for RLS evaluation), never anon
revoke execute on function public.is_admin() from anon;
revoke execute on function public.current_staff() from anon;
revoke execute on function public.business_today() from anon;
