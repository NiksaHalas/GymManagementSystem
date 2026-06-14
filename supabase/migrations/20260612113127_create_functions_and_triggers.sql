-- permanent member number sequence (never reused)
create sequence if not exists member_no_seq;

-- assign member_no on insert (security definer so it can use the sequence regardless of caller role)
create or replace function assign_member_no()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.member_no is null then
    new.member_no := nextval('member_no_seq');
  end if;
  return new;
end;
$$;

create trigger member_assign_no
  before insert on member
  for each row execute function assign_member_no();

-- auto-create a staff profile when an auth user is created
create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.staff (id, username, role, recovery_email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'username', split_part(new.email, '@', 1)),
    coalesce((new.raw_user_meta_data->>'role')::staff_role, 'user'),
    new.raw_user_meta_data->>'recovery_email'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- resolve the caller's staff row from auth.uid()
create or replace function current_staff()
returns staff
language sql
stable
security definer
set search_path = public
as $$
  select * from staff where id = auth.uid();
$$;

-- is the caller an active admin?
create or replace function is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from staff where id = auth.uid() and role = 'admin' and active);
$$;

-- business day in Europe/Belgrade (for same-day RLS rules)
create or replace function business_today()
returns date
language sql
stable
as $$
  select (now() at time zone 'Europe/Belgrade')::date;
$$;
