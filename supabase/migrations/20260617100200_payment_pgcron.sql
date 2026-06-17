-- Daily membership promotion and expiration (pg_cron)

create or replace function public.promote_memberships()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_today date := business_today();
begin
  -- Expire active memberships past end date or with no sessions left
  update membership m
  set status = 'istekla',
      updated_at = now()
  from membership_type mt
  where m.membership_type_id = mt.id
    and m.status = 'aktivna'
    and (
      (m.end_date is not null and m.end_date < v_today)
      or (not mt.is_time_based and coalesce(m.sessions_left, 0) <= 0)
    );

  -- Promote oldest queued membership when member has no active/paused
  with next_zakazana as (
    select distinct on (m.member_id)
      m.id,
      m.member_id,
      m.membership_type_id
    from membership m
    where m.status = 'zakazana'
      and not exists (
        select 1 from membership a
        where a.member_id = m.member_id
          and a.status in ('aktivna', 'pauzirana')
      )
    order by m.member_id, m.created_at asc
  )
  update membership m
  set status = 'aktivna',
      start_date = v_today,
      end_date = v_today + (mt.duration_days - 1),
      updated_at = now()
  from next_zakazana nz
  join membership_type mt on mt.id = nz.membership_type_id
  where m.id = nz.id;
end;
$$;

revoke execute on function public.promote_memberships() from public;
revoke execute on function public.promote_memberships() from anon, authenticated;
grant  execute on function public.promote_memberships() to service_role;

select cron.schedule(
  'promote-memberships',
  '5 1 * * *',
  $$ select public.promote_memberships(); $$
);
