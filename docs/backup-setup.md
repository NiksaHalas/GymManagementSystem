# USB backup — postavljanje na šalter PC (Windows)

Automatski USB backup baze 3× dnevno preko Windows Task Scheduler-a. Skripta:
`scripts/backup-usb.mjs` (PRD §3.15, [Tech.md](Tech.md) §8). **Samo Windows.**

Ako je `DATABASE_URL` postavljen, koristi se `pg_dump` (`full.dump`); ako nije, koristi se
**JSON export fallback** (po jedan `*.json` po tabeli). Čuva poslednjih **7** runova (`RETAIN=7`),
starije briše automatski.

---

## 1. Preduslovi na šalter PC-u

1. **Node.js** instaliran (LTS). Provera u Command Prompt-u: `node --version`.
2. **Kod skripte** na disku — biraj jedno:
   - kloniran ceo repo, **ili**
   - samo `scripts/backup-usb.mjs` + lokalni `node_modules/@supabase/supabase-js`
     (skripta koristi `@supabase/supabase-js` za JSON fallback).
3. **USB disk** priključen u terminima backup-a (09:00 / 15:00 / 21:00). Zapamti slovo
   diska (npr. `D:`).
4. (Opciono) `pg_dump` u `PATH`-u ako želiš `pg_dump` umesto JSON fallback-a — tada postavi i
   `DATABASE_URL`.

---

## 2. Env varijable (korisničke, na nalogu Task Scheduler-a)

Postavi kao **korisničke** env varijable na Windows nalogu pod kojim se task izvršava
(Settings → System → About → Advanced system settings → Environment Variables → User variables),
ili preko `setx`:

```
setx NEXT_PUBLIC_SUPABASE_URL    "https://qkmrssvfeljfkqbbxfpr.supabase.co"
setx SUPABASE_SERVICE_ROLE_KEY   "<service-role-key>"
setx GYM_USB_BACKUP_PATH         "D:\"
```

> `SUPABASE_SERVICE_ROLE_KEY` je **privilegovan** — drži ga samo lokalno na šalter PC-u,
> nikad u browseru/repou. `GYM_USB_BACKUP_PATH` definiše USB putanju (može i kao argument
> komande umesto env-a). (Opciono `DATABASE_URL` za `pg_dump` granu.)

> Napomena: `setx` postavlja varijablu za **buduće** procese — zatvori i ponovo otvori
> Command Prompt / Task Scheduler da bi je videli.

---

## 3. Komanda backup-a

```
node scripts/backup-usb.mjs
```

USB putanja se uzima iz `GYM_USB_BACKUP_PATH`, ili je prosledi kao argument:

```
node scripts/backup-usb.mjs D:\
```

Rezultat ide u `<usb>\gym-backup\<timestamp>\` (npr. `full.dump` ili više `*.json` fajlova).

---

## 4. Tri zadatka u Task Scheduler-u (09:00 / 15:00 / 21:00)

Za svaki od tri termina napravi po jedan zadatak (isti, samo različito vreme):

1. Otvori **Task Scheduler** → **Create Task** (ne „Basic Task").
2. **General:** ime npr. `Gym USB Backup 09:00`; „Run whether user is logged on or not"
   po potrebi; nalog mora imati postavljene env varijable iz koraka 2.
3. **Triggers:** New → Daily → vreme **09:00** (pa zasebni zadaci za **15:00** i **21:00**).
4. **Actions:** New → Start a program:
   - Program/script: putanja do `node.exe` (npr. `C:\Program Files\nodejs\node.exe`).
   - Add arguments: `scripts\backup-usb.mjs`
     (ili `scripts\backup-usb.mjs D:\` ako ne koristiš env za putanju).
   - Start in: koren repoa / folder gde je `scripts\` (npr. `C:\gym\GymManagementSystem`).
5. **Conditions / Settings:** po potrebi „Run task as soon as possible after a scheduled
   start is missed" (ako PC nije bio upaljen u tačnom terminu).

Ponovi za **15:00** i **21:00** (ukupno 3 zadatka).

---

## 5. Verifikacija

- U Task Scheduler-u za svaki zadatak: **„Last Run Result" = `0x0`** (uspeh, exit 0).
- Pojavi se nov folder `<usb>\gym-backup\<timestamp>\`.
- **Provera veličine dump-a** (oslanja se na logging iz skripte): pokreni jednom ručno
  `node scripts/backup-usb.mjs D:\` i potvrdi da ispis sadrži veličinu rezultata
  (`full.dump` bajtovi/KB/MB, ili zbir `*.json` fajlova) + `Backup complete: ...` + exit 0.
- Namerno pogrešan env (npr. obrisan `SUPABASE_SERVICE_ROLE_KEY`) → skripta izlazi sa **exit 1**
  i porukom o nedostajućem env-u.
- Rotacija: posle 7+ runova u `<usb>\gym-backup\` ostaje **najviše 7** najnovijih foldera.
