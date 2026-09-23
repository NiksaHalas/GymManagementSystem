-- record_payment / void_payment and the payment ↔ check-in link: offered price
-- and discounts, custom price bounds, queued renewals, debt settlement, voids,
-- and the group-Fitpass +300 surcharge.

begin;
select plan(22);

create temp table ctx (k text primary key, id uuid);
grant select, insert on ctx to authenticated;
create or replace function pg_temp.c(p_key text) returns uuid
language sql stable as $$ select id from ctx where k = p_key $$;

insert into ctx values
  ('worker',  tests.create_staff('t_worker')),
  ('admin',   tests.create_staff('t_admin', 'admin')),
  ('trainer', tests.create_staff('t_trainer')),
  ('m_new',   tests.create_member('Nova', 'Članica')),
  ('m_disc',  tests.create_member('Popust', 'Porodica', true)),
  ('m_debt',  tests.create_member('Dug', 'Trener')),
  ('m_link',  tests.create_member('Veza', 'Dolazak')),
  ('m_old',   tests.create_member('Juče', 'Uplata'));

select tests.login(pg_temp.c('worker'));

-- Offered price is enforced -------------------------------------------------------
select throws_ok(
  format('select record_payment(p_member_id := %L, p_membership_type_id := %s, p_amount_rsd := 3000)',
    pg_temp.c('m_new'), tests.type_id('otvoreni', '30/1')),
  null, 'Iznos mora biti 3200 RSD.',
  'a non-custom payment must match the offered price');

insert into ctx values ('p_new', record_payment(
  p_member_id := pg_temp.c('m_new'),
  p_membership_type_id := tests.type_id('otvoreni', '30/1'),
  p_amount_rsd := 3200));

select is(
  (select array[m.status::text, m.start_date::text, m.end_date::text]
   from payment p join membership m on m.id = p.membership_id
   where p.id = pg_temp.c('p_new')),
  array['aktivna', business_today()::text, (business_today() + 29)::text],
  'first payment starts a 30-day active membership today');
select is((select kind::text from payment where id = pg_temp.c('p_new')), 'membership',
  'the payment is recorded as a membership payment');

-- Discount members get the discount price on Otvoreni ------------------------------
select lives_ok(
  format('select record_payment(p_member_id := %L, p_membership_type_id := %s, p_amount_rsd := 2700)',
    pg_temp.c('m_disc'), tests.type_id('otvoreni', '30/1')),
  'discount member pays the Otvoreni discount price');

-- Custom price must be strictly between 0 and the offered price --------------------
select throws_like(
  format('select record_payment(p_member_id := %L, p_membership_type_id := %s, p_amount_rsd := 1200, p_is_custom_price := true)',
    pg_temp.c('m_link'), tests.type_id('individualni', '1/1')),
  'Prilagođena cena mora biti između 0 i ponuđene cene%',
  'a custom price equal to the offered price is rejected');

-- Renewal while active is queued ---------------------------------------------------
insert into ctx values ('p_queued', record_payment(
  p_member_id := pg_temp.c('m_new'),
  p_membership_type_id := tests.type_id('otvoreni', '30/1'),
  p_amount_rsd := 2500, p_is_custom_price := true, p_custom_reason := 'Stari cenovnik'));

select is(
  (select array[m.status::text, coalesce(m.start_date::text, 'null')]
   from payment p join membership m on m.id = p.membership_id
   where p.id = pg_temp.c('p_queued')),
  array['zakazana', 'null'],
  'paying while a membership is active queues the renewal (zakazana, no dates yet)');
select ok((select is_custom_price from payment where id = pg_temp.c('p_queued')),
  'custom price is flagged on the payment');

select throws_ok(
  format('select record_payment(p_member_id := %L, p_membership_type_id := %s, p_amount_rsd := 3200, p_start_mode := %L)',
    pg_temp.c('m_new'), tests.type_id('otvoreni', '30/1'), 'first_visit'),
  null, 'Zakazana članarina ne podržava prvi dolazak — koristite plaćanje.',
  'a queued renewal cannot use first-visit start');

-- Voiding an unused membership payment deletes the membership ----------------------
insert into ctx values ('ms_queued', (select membership_id from payment where id = pg_temp.c('p_queued')));
select void_payment(pg_temp.c('p_queued'), 'Greška pri unosu');
select ok(
  (select voided from payment where id = pg_temp.c('p_queued'))
  and not exists (select 1 from membership where id = pg_temp.c('ms_queued')),
  'voiding an unused membership payment voids it and deletes the membership');

-- …but not once the membership has been used ----------------------------------------
select create_checkin(p_member_id := pg_temp.c('m_new'), p_key_no := 1);
select throws_like(
  format('select void_payment(%L, %L)', pg_temp.c('p_new'), 'Storno'),
  'Članarina je već korišćena%',
  'a membership that already has arrivals cannot be voided');

select throws_ok(
  format('select void_payment(%L, %L)', pg_temp.c('p_new'), '   '),
  null, 'Razlog storna je obavezan.',
  'a void requires a reason');

-- Debt settlement --------------------------------------------------------------------
insert into ctx values ('ck_debt', create_checkin(
  p_member_id := pg_temp.c('m_debt'), p_key_no := 2, p_with_trainer := true,
  p_training_category_id := tests.category_id('individualni'),
  p_trainer_id := pg_temp.c('trainer')));
insert into ctx values ('rs_debt',
  (select id from reserved_session where checkin_id = pg_temp.c('ck_debt')));

insert into ctx values ('p_debt', record_payment(
  p_member_id := pg_temp.c('m_debt'),
  p_settle_reserved_ids := array[pg_temp.c('rs_debt')]));

select is(
  (select array[kind::text, amount_rsd::text] from payment where id = pg_temp.c('p_debt')),
  array['debt_settlement', '1200'],
  'settling a reserved session records a debt_settlement payment at the captured price');
select ok(
  (select settled and settled_payment_id = pg_temp.c('p_debt')
   from reserved_session where id = pg_temp.c('rs_debt')),
  'the reserved session is marked settled by that payment');

select throws_ok(
  format('select record_payment(p_member_id := %L, p_settle_reserved_ids := array[%L]::uuid[])',
    pg_temp.c('m_debt'), pg_temp.c('rs_debt')),
  null, 'Rezervisani termin je već izmiren.',
  'a debt cannot be settled twice');

select void_payment(pg_temp.c('p_debt'), 'Pogrešan član');
select ok(
  (select not settled and settled_payment_id is null
   from reserved_session where id = pg_temp.c('rs_debt')),
  'voiding a debt settlement re-opens the debt');

-- Group Fitpass +300 surcharge -------------------------------------------------------
insert into ctx values ('ck_fit', create_checkin(
  p_key_no := 3, p_is_fitpass := true, p_is_group_fitpass := true));

select is(
  (select array[amount_rsd::text, kind::text] from payment where checkin_id = pg_temp.c('ck_fit')),
  array['300', 'fitpass_surcharge'],
  'group Fitpass arrival records a linked +300 surcharge');

select void_checkin(pg_temp.c('ck_fit'));
select is(
  (select void_reason from payment where checkin_id = pg_temp.c('ck_fit') and voided),
  'Poništen dolazak',
  'cancelling the group Fitpass arrival voids its surcharge');

select throws_ok(
  format('select void_checkin(%L)', pg_temp.c('ck_fit')),
  null, 'Dolazak je već poništen.',
  'an arrival cannot be voided twice');

-- A real membership payment linked to an arrival survives voiding the arrival ------------
insert into ctx values ('ck_link', create_checkin(p_member_id := pg_temp.c('m_link'), p_key_no := 4));
insert into ctx values ('p_link', record_payment(
  p_member_id := pg_temp.c('m_link'),
  p_membership_type_id := tests.type_id('kardio', '30/1'),
  p_amount_rsd := 2600,
  p_checkin_id := pg_temp.c('ck_link')));
select void_checkin(pg_temp.c('ck_link'));
select ok(not (select voided from payment where id = pg_temp.c('p_link')),
  'voiding an arrival never voids a membership payment linked to it');

-- One live surcharge per check-in (partial unique index) --------------------------------
select tests.logout();
insert into ctx values ('ck_fit2', gen_random_uuid());
insert into checkin (id, staff_id, key_no, is_fitpass, is_group_fitpass, business_date)
values (pg_temp.c('ck_fit2'), pg_temp.c('worker'), 5, true, true, business_today());
insert into payment (staff_id, checkin_id, kind, amount_rsd, is_fitpass, business_date)
values (pg_temp.c('worker'), pg_temp.c('ck_fit2'), 'fitpass_surcharge', 300, true, business_today());

select throws_ok(
  format($$insert into payment (staff_id, checkin_id, kind, amount_rsd, is_fitpass, business_date)
           values (%L, %L, 'fitpass_surcharge', 300, true, business_today())$$,
    pg_temp.c('worker'), pg_temp.c('ck_fit2')),
  '23505', null,
  'a second live surcharge for the same arrival is rejected');

-- Same-day rule: workers void only today's payments; admins any day --------------------
insert into ctx values ('p_old', gen_random_uuid());
insert into payment (id, member_id, staff_id, kind, amount_rsd, business_date)
values (pg_temp.c('p_old'), pg_temp.c('m_old'), pg_temp.c('worker'), 'debt_settlement', 1000,
        business_today() - 1);

select tests.login(pg_temp.c('worker'));
select throws_ok(
  format('select void_payment(%L, %L)', pg_temp.c('p_old'), 'Storno'),
  null, 'Možete stornirati samo današnje uplate.',
  'a worker cannot void a payment from a previous day');

select tests.login(pg_temp.c('admin'));
select lives_ok(
  format('select void_payment(%L, %L)', pg_temp.c('p_old'), 'Storno'),
  'an admin can void a payment from a previous day');

select * from finish();
rollback;
