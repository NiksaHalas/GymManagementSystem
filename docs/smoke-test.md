# Smoke test — pre prvog otvaranja

Cilj: u jednom prolazu, na **prod-u**, proveriti sve ključne scenarije pre prvog realnog
rada na šalteru. Koristi se poseban skup test podataka (`ZZ_TEST`) koji se na kraju briše.

**Preduslovi:**
- Završeni Koraci 1, 2, 2.5 iz [go-live.md](go-live.md) (env, nalozi, registracija šaltera).
- Radi se na fizičkom šalter PC-u sa `gym_counter` cookie-jem (inače check-in/plaćanje blokirani).

**Konvencija za test podatke (`ZZ_TEST`):**
- Test član: ime/prezime npr. **„ZZ_TEST Proba"**, sa **jedinstvenim test telefonom**
  (npr. `060000000000`) — lako pronaći i obrisati.
- Sve što se kreira tokom testa briše se u sekciji **Cleanup** na dnu.

Reference: [PRD.md](PRD.md) §3, §9.1; [Tech.md](Tech.md) §2.3.

---

## Scenariji

Za svaki: izvrši → potvrdi „Očekivano". Ako nešto odstupa, **stani i prijavi**.

### 1. Login
- Prijava radnika/Admina sa važećim kredencijalima.
- **Očekivano:** uspešan login; auto-otvorena smena; sidebar navigacija vidljiva.

### 2. Reset lozinke (test nalog)
- Na login ekranu „Zaboravljena lozinka" → unos email-a **test naloga** (kontrolisani inbox).
- Otvori email → klik na link → `/reset` → postavi novu lozinku → prijava novom lozinkom.
- **Očekivano:** email stiže; link vodi na `https://.../auth/callback?...&next=/reset`
  (NE `http://auth/...`); link **važi 1 sat**; nova lozinka radi.

### 3. Check-in
- Na `/dashboard` pretraži test člana (ime/prezime/broj člana) → check-in dialog → potvrdi
  (po potrebi: ključ, trener-sesija, komentar).
- **Očekivano:** dialog se zatvara posle uspešne potvrde; dolazak upisan na današnji dan.

### 4. Plaćanje
- Naplati članarinu test članu (`PaymentDialog`): kategorija → paket → auto cena
  (po potrebi popust uz potvrdu, `start_mode`).
- **Očekivano:** plaćanje upisano; vidljivo u `/pazar`; auto-link sa današnjim dolaskom
  istog člana (`payment.checkin_id`).

### 5. Smena / handover („Zameni radnika")
- Pokreni „Zameni radnika" (handover).
- **Očekivano:** tekuća smena se zatvara, nova se otvara na drugog radnika; vidljivo u `/smene`.

### 6. Fitpass +300 (i void koji skida +300)
- Grupni Fitpass check-in test člana.
- **Očekivano:** odmah naplaćen `fitpass_surcharge` +300 RSD (ulazi u dnevni total);
  badge na redu dolaska. Zatim **void tog dolaska** → +300 se **stornira**.

### 7. Void plaćanja
- Storniraj jedno plaćanje iz Scenarija 4 (obavezan razlog).
- **Očekivano:** plaćanje stornirano; povezana izmena članarine vraćena; dnevni total = neto.

### 8. Ključevi (dodela / „otišao" / pretraga poslednjeg držaoca)
- Dodeli fizički ključ test članu pri check-inu; pretraži po broju ključa; označi „Otišao".
- **Očekivano:** ključ vezan za držaoca; pretraga vraća poslednjeg držaoca; „Otišao" oslobađa ključ.

### 9. GYM05 — open-visit guard
- Pokušaj **drugi check-in** test člana dok je još „prisutan" (nije „otišao").
- **Očekivano:** blokirano sa **GYM05** greškom + UI hint (nema duplog dolaska dok je prisutan).

### 10. Override po isteku sesije
- Član sa isteklim session-based paketom (solo Otvoreni ili trener), preostalo ≥1 sesija →
  pokušaj check-in.
- **Očekivano:** worker confirm „iskoristi 1 preostalu sesiju na isteklom paketu";
  potvrda skida sesiju; odbijanje → dolazak bez skidanja (trener → `reserved_session` debt);
  badge „Istekla — preostalo {n} sesija".

### 11. Nevraćeni ključevi (report)
- Otvori „Nevraćeni ključevi" sekciju u keys panelu za izabrani `business_date`.
- **Očekivano:** lista fizičkih ključeva koji nisu vraćeni preko „Otišao" (držalac, vreme, radnik);
  count badge; pojačan stil posle zatvaranja teretane / za prošle dane.

### 12. Pauza / nastavak članarine
- Na kartici test člana: „Pauziraj članarinu" → confirm; pa „Nastavi članarinu" → confirm.
- **Očekivano:** amber badge na dashboard-u dok je pauzirano; check-in u pauzi upisuje dolazak
  bez session/debt efekata; nastavak produžava `end_date` za tačan broj pauziranih dana.

---

## Cleanup test podataka

Posle uspešnog prolaza ukloni sve `ZZ_TEST` tragove:

1. **Void** svih test check-in-ova kreiranih tokom testa (preko „void današnjeg check-in-a").
2. **Storniraj** sva test plaćanja (Scenariji 4, 6) ako već nisu — obavezan razlog npr. „smoke test".
3. **Arhiviraj** test člana („ZZ_TEST Proba"). Arhiviranje je blokirano dok postoje neizmireni
   owed sessions — prvo izmiri/poništi eventualni dug, pa arhiviraj.
4. Proveri `/pazar` za izabrani dan: neto total ne sme sadržati zaostale test iznose.

> Telefon test člana je jedinstven (`060000000000`) — pretragom po njemu lako se potvrdi da
> nije ostao aktivan trag. Telefon je unique i za arhivirane članove, pa za ponovljeni test
> koristi drugi test broj.
