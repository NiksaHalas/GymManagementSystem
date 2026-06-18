-- Arhiviranje (archived false→true) blokirano dok postoje neizmireni rezervisani
-- (dužni) termini (PRD §3.5). App actions.ts već radi pre-check radi UX-a, ali to je
-- count-then-act (TOCTOU); ovaj BEFORE UPDATE triger je autoritativni DB guard
-- (po uzoru na member_restore_admin_guard, 20260618132000). Poruka je identična
-- app poruci, pa i u retkoj trci korisnik vidi isti tekst (mapMemberWriteError
-- vraća error.message kao fallback). Vidi PRD §3.5, DB.md §3.3/§5.1.
create or replace function public.enforce_member_archive_no_debt()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.archived and not old.archived
     and exists (
       select 1 from reserved_session
       where member_id = new.id and not settled
     ) then
    raise exception 'Član ima neizmirene rezervisane (dužne) termine. Izmirite ih pre arhiviranja.'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger member_archive_no_debt_guard
  before update on member
  for each row
  when (old.archived is distinct from new.archived)
  execute function public.enforce_member_archive_no_debt();
