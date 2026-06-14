create type staff_role            as enum ('user', 'admin');
create type training_type         as enum ('otvoreni', 'kardio', 'individualni', 'duo', 'vodjeni');
create type membership_status     as enum ('aktivna', 'istekla', 'pauzirana');
create type membership_start_mode as enum ('payment', 'first_visit');
create type payment_kind          as enum ('membership', 'debt_settlement', 'fitpass_surcharge');
create type shift_end_reason      as enum ('logout', 'switch', 'auto_close', 'inactivity');
