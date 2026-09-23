-- create_checkin open-visit guard (GYM05): a member cannot be checked in twice
-- while an earlier visit today is still open (key not returned, incl. "bez ključa").

begin;
select plan(8);

create temp table ctx as
select
  tests.create_staff('t_worker')  as worker,
  tests.create_staff('t_trainer') as trainer,
  tests.create_member('Ana', 'Jovanović') as member;

select tests.give_membership((select member from ctx), 'otvoreni', '30/1');
grant select on ctx to authenticated, anon;

select tests.login((select worker from ctx));

-- 1. Open visit with a key blocks a second check-in; message names the key.
create temp table ck1 as
select create_checkin(p_member_id := (select member from ctx), p_key_no := 1) as id;

select throws_ok(
  format('select create_checkin(p_member_id := %L, p_key_no := 2)', (select member from ctx)),
  'GYM05',
  'Član je već prijavljen i još nije otišao (ključ 1). Prvo evidentirajte „Otišao".',
  'second check-in with an open keyed visit raises GYM05 naming the key'
);

-- 2. The guard also covers the trainer path.
select throws_ok(
  format(
    'select create_checkin(p_member_id := %L, p_key_no := 3, p_with_trainer := true, p_training_category_id := %s, p_trainer_id := %L)',
    (select member from ctx), tests.category_id('individualni'), (select trainer from ctx)
  ),
  'GYM05',
  null,
  'trainer check-in is blocked while a solo visit is open'
);

-- 3. Fitpass arrivals are anonymous and never hit the member guard.
select lives_ok(
  'select create_checkin(p_key_no := 4, p_is_fitpass := true)',
  'Fitpass check-in passes while a member visit is open'
);

-- 4. After "Otišao" (key returned) the member can check in again.
update checkin
set key_returned = true, checked_out_at = now(), updated_by = (select worker from ctx)
where id = (select id from ck1);

select lives_ok(
  format('select create_checkin(p_member_id := %L, p_key_no := 5)', (select member from ctx)),
  'check-in passes once the previous visit is closed'
);

-- 5. An open visit WITHOUT a key also blocks, and says so.
select tests.logout();
update checkin set voided = true where member_id = (select member from ctx);
select tests.login((select worker from ctx));

select create_checkin(p_member_id := (select member from ctx), p_key_no := null);

select throws_like(
  format('select create_checkin(p_member_id := %L, p_key_no := 6)', (select member from ctx)),
  '%bez ključa%',
  'open visit without a key blocks with a "bez ključa" message'
);

-- 6. Voided visits do not count as open.
select tests.logout();
update checkin set voided = true where member_id = (select member from ctx);
select tests.login((select worker from ctx));

select lives_ok(
  format('select create_checkin(p_member_id := %L, p_key_no := 7)', (select member from ctx)),
  'voided visits never trigger the guard'
);

-- 7. Unknown keys are rejected.
select tests.logout();
update checkin set voided = true where member_id = (select member from ctx);
select tests.login((select worker from ctx));

select throws_ok(
  format('select create_checkin(p_member_id := %L, p_key_no := 99)', (select member from ctx)),
  null,
  'Neispravan broj ključa.',
  'key numbers outside the 22 physical keys are rejected'
);

-- 8. Anonymous callers cannot check anyone in.
select tests.login_anon();
select throws_ok(
  format('select create_checkin(p_member_id := %L, p_key_no := 8)', (select member from ctx)),
  '42501',
  null,
  'anon has no EXECUTE on create_checkin'
);

select * from finish();
rollback;
