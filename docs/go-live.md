# Puštanje u rad (Go-Live) — master checklist

Operativni vodič za prvo realno puštanje sistema na šalteru. Prati korake redom.
Pre check-in/plaćanja **mora** biti odrađen Korak 2.5 (registracija šaltera), inače
`requireCounterToday()` blokira rad.

Povezani dokumenti:
- [Smoke test](smoke-test.md) — provera ključnih scenarija pre prvog otvaranja.
- [USB backup setup](backup-setup.md) — Windows Task Scheduler na šalter PC-u.
- Tehnička referenca: [Tech.md](Tech.md) §9 (deploy), §10 (env varijable).

---

## Korak 1 — Verifikacija

### 1.1 Migracije baze
- Očekivano: **41/41 migracija, bez drifta**, poslednja `20260625160000 revert_offline_p_id`.
- Provera: `npx supabase migration list --linked`.
- Status: ✅ već potvrđeno.

### 1.2 Env varijable na Vercel-u (ručna provera korisnika)
Otvori Vercel → Project → Settings → Environment Variables (Production). Proveri:

| Varijabla | Vrednost / napomena | Sensitive? |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL | **NE — „Plain"** |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Public (anon/publishable) ključ | **NE — „Plain"** |
| `NEXT_PUBLIC_SITE_URL` | `https://gym-management-system-five-ashy.vercel.app` (tačan prod URL, bez viška znakova) | **NE — „Plain"** |
| `SUPABASE_SERVICE_ROLE_KEY` | Privilegovan ključ (server/lokalno) | DA — Sensitive |
| `COUNTER_DEVICE_SECRET` | HMAC tajna za `gym_counter` cookie | DA — Sensitive |
| `RESEND_API_KEY` | Slanje reset email-ova | DA — Sensitive |
| `RESEND_FROM_EMAIL` | From adresa | po želji |

> ⚠️ **Kritično:** `NEXT_PUBLIC_*` varijable moraju biti **„Plain", NIKAD „Sensitive".**
> Sensitive ih uskraćuje build koraku → Next.js ih inline-uje kao `undefined` → aplikacija
> pada sa 500 na svakoj ruti („Your project's URL and Key are required").
> Vidi [Tech.md](Tech.md) §9 incidents i memoriju „prod-deployment-topology".

> ⚠️ `NEXT_PUBLIC_SITE_URL` mora biti **tačan, kompletan prod URL**. Malformiran string
> razbija link u reset email-u (`http://auth/callback...` → „Server Not Found").

### 1.3 Auth config (reset email „Link važi 1 sat")
- Potvrdi da je `npm run auth:push-config` odrađen sa **prod** `NEXT_PUBLIC_SITE_URL`
  (skripta postavlja `mailer_otp_exp=3600` + Redirect URLs; vidi [Tech.md](Tech.md) §9 korak 4).
- Skripta odbija `http://localhost:3000` osim uz `--allow-localhost` — pokreni je sa prod URL-om.
- Rezultat: u Supabase Dashboard → Auth → URL Configuration stoji
  `{NEXT_PUBLIC_SITE_URL}/auth/callback` u Redirect URLs i Email OTP expiry = 3600.

---

## Korak 2 — Nalozi i recovery

- **2+ aktivna Admina** (zbog last-active-admin guard-a — ne može se ostati bez Admina).
- Svakom radniku popunjen **realan recovery email** na `/nalozi`.
- Pripremljen **Admin-postavljen test nalog** sa kontrolisanim inboxom (za reset-lozinke smoke
  scenario u [smoke-test.md](smoke-test.md)).

---

## Korak 2.5 — Registracija šaltera  *(pre check-in dela smoke testa)*

- Na **fizičkom šalter PC-u** (Chrome), prijavljen kao Admin, otvori `/nalozi`.
- Uključi **counter-device toggle** → postavlja potpisani `gym_counter` cookie na tom uređaju.
- Bez tog cookie-ja `requireCounterToday()` blokira check-in i plaćanje
  (vidi [Tech.md](Tech.md) §2.3/§3.4). **Mora pre Koraka 3.**

---

## Korak 3 — Smoke test  *(zajedno, pre prvog realnog otvaranja)*

- Odradi kompletan prolaz po [smoke-test.md](smoke-test.md) na **prod-u** sa `ZZ_TEST` podacima.
- Svaki scenario daje očekivani rezultat.
- Na kraju: **cleanup** test podataka (void check-in/plaćanja + arhiviranje test člana).
- ➜ uz potvrdu korisnika: `git push` grane `docs/go-live-runbook` → PR #1 → merge u `main`.
- ➜ uz potvrdu korisnika: `git push` grane `chore/backup-usb-logging` → PR #2
  (pre merge: korisnik prođe env checklist iznad + pročita diff skripte) → merge.

---

## Korak 4 — USB backup na šalter PC  *(posle merge PR #2)*

- Preduslovi na licu mesta: Node.js instaliran; kloniran repo (ili samo
  `scripts/backup-usb.mjs` + `node_modules/@supabase/supabase-js`); USB priključen u terminima.
- Postavi po [backup-setup.md](backup-setup.md): Task Scheduler 09:00 / 15:00 / 21:00,
  korisničke env varijable, `RETAIN=7`.

---

## Gejtovi (obavezni)
1. Agent pravi grane + fajlove **bez push-a**.
2. Pre `git push` / otvaranja PR-a → eksplicitna potvrda korisnika.
3. Pre merge PR #2 → korisnik prođe Vercel env checklist (Korak 1.2) + pročita diff skripte.
