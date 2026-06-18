-- Telefon jedinstven po normalizovanim ciframa, globalno (uklj. arhivirane).
-- Funkcionalni unique indeks (regexp_replace je IMMUTABLE) — bez nove kolone/backfilla.
-- Konzistentno sa postojećim member_member_no_uidx / lower() indeksima i sa app
-- normalizePhone (skida sve sem cifara, lib/members/schema.ts).
-- Postojeći member_phone_idx (raw phone) ostaje (drugi izraz; bez scope-creep-a).
create unique index member_phone_digits_uidx
  on member ((regexp_replace(phone, '\D', '', 'g')));
