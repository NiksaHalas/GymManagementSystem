-- Fuzzy member search: pg_trgm + trigram indexes + a search RPC.

create extension if not exists pg_trgm;

-- trigram GIN indexes for fast ILIKE / similarity on the searchable text columns
create index if not exists member_first_name_trgm_idx on member using gin (first_name gin_trgm_ops);
create index if not exists member_last_name_trgm_idx  on member using gin (last_name  gin_trgm_ops);
create index if not exists member_phone_trgm_idx      on member using gin (phone      gin_trgm_ops);

-- search_members: paginated browse (empty q) or fuzzy search (non-empty q),
-- enriched with the member's single active/paused membership summary.
-- security definer so trigram ordering is consistent; members are readable by all
-- authenticated users anyway (member_select using(true)).
create or replace function search_members(
  q                text    default '',
  include_archived boolean default false,
  lim              int     default 50,
  off              int     default 0
)
returns table (
  id                       uuid,
  member_no                bigint,
  first_name               text,
  last_name                text,
  phone                    text,
  discount_flag            boolean,
  comment                  text,
  archived                 boolean,
  created_at               timestamptz,
  membership_status        membership_status,
  membership_label         text,
  membership_end_date      date,
  membership_sessions_left int,
  membership_is_time_based boolean,
  total_count              bigint
)
language sql
stable
security definer
set search_path = public
as $$
  with q_norm as (
    select
      coalesce(q, '') as raw,
      nullif(regexp_replace(coalesce(q, ''), '\D', '', 'g'), '') as digits
  ),
  active_m as (
    select distinct on (m.member_id)
      m.member_id,
      m.status,
      m.end_date,
      m.sessions_left,
      mt.label,
      mt.is_time_based
    from membership m
    join membership_type mt on mt.id = m.membership_type_id
    where m.status in ('aktivna', 'pauzirana')
    order by m.member_id, m.created_at desc
  ),
  base as (
    select me.*
    from member me, q_norm
    where (include_archived or not me.archived)
      and (
        q_norm.raw = ''
        or me.first_name ilike '%' || q_norm.raw || '%'
        or me.last_name  ilike '%' || q_norm.raw || '%'
        or (me.first_name || ' ' || me.last_name) ilike '%' || q_norm.raw || '%'
        or (q_norm.digits is not null and me.phone ilike '%' || q_norm.digits || '%')
        or (q_norm.digits is not null and me.member_no::text like q_norm.digits || '%')
      )
  ),
  counted as (select count(*)::bigint as total from base)
  select
    b.id,
    b.member_no,
    b.first_name,
    b.last_name,
    b.phone,
    b.discount_flag,
    b.comment,
    b.archived,
    b.created_at,
    am.status,
    am.label,
    am.end_date,
    am.sessions_left,
    am.is_time_based,
    (select total from counted)
  from base b
  left join active_m am on am.member_id = b.id, q_norm
  order by
    case
      when q_norm.raw = '' then 0
      else greatest(
        similarity(b.first_name, q_norm.raw),
        similarity(b.last_name, q_norm.raw),
        similarity(b.first_name || ' ' || b.last_name, q_norm.raw)
      )
    end desc,
    lower(b.last_name),
    lower(b.first_name)
  limit lim offset off;
$$;

revoke execute on function search_members(text, boolean, int, int) from public, anon;
grant  execute on function search_members(text, boolean, int, int) to authenticated;
