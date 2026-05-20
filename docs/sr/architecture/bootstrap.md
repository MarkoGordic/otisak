# Bootstrap

Šta se izvršava pri prvom pokretanju. Sve je idempotentno.

## Redosled

`server/src/index.ts` radi tri stvari pre nego otvori HTTP port:

1. `runMigrations()`. Primenjuje schema migracije.
2. `ensureBootstrapAdmin()`. Kreira prvog admina ako nijedan ne postoji.
3. `ensureDemoExam()`. Seeduje ugrađen demo ako nijedan ispit sa tim naslovom ne postoji.

Na čistoj instalaciji sva tri loguju kratak sažetak. Na narednim pokretanjima sva tri su no-op.

## Šema

`init.sql` se izvršava jednom kad Postgres krene na praznom volume-u. Kreira sve tabele, indekse, enum tipove, i seeduje `app_settings` red za `practice_mode_enabled = false`.

Postgres preskače `init.sql` ako volume već ima podatke. Od tog trenutka, schema promene idu kroz `runMigrations()`.

## Migracije

`server/src/db/migrations.ts` je lista `{ id, sql }` koraka. Izvršavaju se redom na svakom pokretanju.

Svaki korak:

- Radi u transakciji.
- Koristi `ALTER ... IF NOT EXISTS` da je ponovno pokretanje sigurno.
- Posle uspeha, INSERT-uje svoj `id` u `migrations` tabelu sa `ON CONFLICT DO NOTHING`. Red je informativan. Pravi gate je `IF NOT EXISTS`.

Pravila:

- Dodavanje kolone ili tabele: dodaj nov korak.
- Menjanje već poslatog koraka: nemoj. Dodaj nov korak koji radi izmenu.
- Brisanje koraka: nemoj. Kvari reproduktivnost.

## Admin bootstrap

Logika u `ensureBootstrapAdmin()`:

1. Broj `users WHERE role = 'admin'`. Različito od nule: return.
2. Generiše 10-karaktera nasumičnu lozinku (bez `0/O/1/l/I` za izbegavanje konfuzije).
3. Bcrypt 10 rundi.
4. INSERT red: email = `BOOTSTRAP_ADMIN_EMAIL` env ili `admin@otisak.local`, ime = `Administrator`.
5. Štampa banner na stdout sa email-om i lozinkom.

Plaintext se nikad ne čuva. Iz log-a:

```bash
docker compose logs app | grep -A2 'admin account bootstrapped'
```

Ako propustiš log, reset preko baze ili wipe i reseed.

## Demo ispit

Logika u `ensureDemoExam()`:

1. Čita `seeds/saljivi-test.json`. Naslov: `Šaljivi test: crtani junaci`.
2. Ako ispit sa tačno tim naslovom postoji, return.
3. Nalazi prvog admina. Ako ga nema, log i return.
4. Nalazi ili kreira `Demo` predmet (kod `DEMO`).
5. `importExamFromJson(saljivi, adminId, { exam_mode: 'practice', self_service: true, is_public: true, status: 'active', subject_id })`.

Studenti ga vide u **Vežba**; admini i Demo-asistenti u `/manage`.

Za zamenu ili uklanjanje, vidi [`../admin/demo-exam.md`](../admin/demo-exam.md).

## Failure modes

- `ensureBootstrapAdmin` i `ensureDemoExam` hvataju svoje greške i loguju. Server svejedno startuje. Najgore: prazan Dashboard dok admin ne uveze nešto.
- `runMigrations` ne. Neuspešna migracija pada boot. Popravi ili vrati deploy.
