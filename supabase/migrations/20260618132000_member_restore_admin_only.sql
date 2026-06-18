-- Restore (archived true→false) dozvoljen samo adminu. Arhiviranje (false→true)
-- ostaje otvoreno svakom radniku (PRD §2). RLS WITH CHECK ne vidi OLD vrednost,
-- pa se pravilo enforce-uje BEFORE UPDATE trigerom (autoritativni guard;
-- app requireAdmin() ostaje samo UX). Vidi PRD §3.3, DB.md §5.1, Tech.md §11.
create or replace function public.enforce_member_restore_admin()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.archived and not new.archived and not is_admin() then
    raise exception 'Samo administrator može vratiti člana iz arhive.'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger member_restore_admin_guard
  before update on member
  for each row
  when (old.archived is distinct from new.archived)
  execute function public.enforce_member_restore_admin();
