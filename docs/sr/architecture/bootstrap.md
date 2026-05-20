# Pokretanje (bootstrap)

Šta se izvršava pri prvom pokretanju. Sve je idempotentno.

## Redosled

`server/src/index.ts` radi tri stvari pre nego što otvori HTTP port:

1. `runMigrations()`. Primenjuje migracije šeme koje su na čekanju.
2. `ensureBootstrapAdmin()`. Pravi prvog admina ako nijedan ne postoji.
3. `ensureDemoExam()`. Seje ugrađen demo ispit ako ne postoji ispit sa tim naslovom.

Na čistoj instalaciji sva tri ispišu kratak sažetak. Na svim sledećim pokretanjima sva tri se ne odazivaju.

## Šema

`init.sql` se izvršava jednom kad Postgres krene na praznom volumenu. Pravi sve tabele, indekse, enum tipove i postavlja `app_settings` red za `practice_mode_enabled = false`.

Postgres preskače `init.sql` ako volumen već sadrži podatke. Od tog trenutka, promene šeme idu kroz `runMigrations()`.

## Migracije

`server/src/db/migrations.ts` je niz koraka oblika `{ id, sql }`. Izvršavaju se redom na svakom pokretanju.

Svaki korak:

- Radi u transakciji.
- Koristi `ALTER ... IF NOT EXISTS` da bi ponovno izvršavanje bilo bezbedno.
- Posle uspeha, upisuje svoj `id` u tabelu `migrations` sa `ON CONFLICT DO NOTHING`. Red je informativan. Pravu kontrolu daje `IF NOT EXISTS`.

Pravila:

- Dodavanje kolone ili tabele: dopiši nov korak.
- Menjanje koraka koji je već pušten: nemoj. Dopiši nov korak koji radi izmenu.
- Brisanje koraka: nemoj. Kvari ponovljivost.

## Pokretanje admina

Logika u `ensureBootstrapAdmin()`:

1. Broj `users WHERE role = 'admin'`. Različito od nule: izlazi.
2. Pravi nasumičnu lozinku od 10 znakova (bez `0/O/1/l/I` zbog moguće zabune).
3. Bcrypt 10 rundi.
4. Upisuje red: email = `BOOTSTRAP_ADMIN_EMAIL` iz okruženja ili `admin@otisak.local`, ime = `Administrator`.
5. Ispisuje natpis na stdout sa email-om i lozinkom.

Otvoreni tekst se nikad ne čuva. Pronađi ga iz zapisa kontejnera:

```bash
docker compose logs app | grep -A2 'admin account bootstrapped'
```

Ako propustiš zapis, resetuj lozinku kroz bazu ili obriši volumen i posej ponovo.

## Demo ispit

Logika u `ensureDemoExam()`:

1. Čita `seeds/saljivi-test.json`. Naslov: `Šaljivi test: crtani junaci`.
2. Ako ispit sa tačno tim naslovom postoji, izlazi.
3. Pronalazi prvog admina. Ako ga nema, ispiše poruku i izlazi.
4. Pronalazi ili pravi predmet `Demo` (oznaka `DEMO`).
5. `importExamFromJson(saljivi, adminId, { exam_mode: 'practice', self_service: true, is_public: true, status: 'active', subject_id })`.

Studenti ga vide u **Vežba**; admin i asistenti na predmetu Demo u `/manage`.

Za zamenu ili uklanjanje, vidi [`../admin/demo-exam.md`](../admin/demo-exam.md).

## Slučajevi kvara

- `ensureBootstrapAdmin` i `ensureDemoExam` hvataju sopstvene greške i ispišu ih. Server svejedno kreće. U najgorem slučaju: prazna početna stranica dok admin nešto ne uveze.
- `runMigrations` ne. Neuspešna migracija ruši pokretanje. Popravi je ili vrati prethodnu verziju.
