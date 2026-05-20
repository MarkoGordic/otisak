# Bootstrap

What runs on first boot. Everything here is idempotent.

## Order

`server/src/index.ts` does three things before opening the HTTP port:

1. `runMigrations()`. Applies pending schema migrations.
2. `ensureBootstrapAdmin()`. Creates the first admin if no admin exists.
3. `ensureDemoExam()`. Seeds the built-in demo exam if no exam with that title exists.

On a clean install, all three log a one-line summary. On subsequent boots all three are no-ops.

## Schema

`init.sql` runs once when Postgres starts on an empty volume. It creates all tables, indexes, enum types, and seeds the `app_settings` row for `practice_mode_enabled = false`.

Postgres skips `init.sql` if the volume already has data. From that point on, schema changes flow through `runMigrations()`.

## Migrations

`server/src/db/migrations.ts` is a list of `{ id, sql }` steps. Executed in order on every boot.

Each step:

- Runs in a transaction.
- Uses `ALTER ... IF NOT EXISTS` so re-running is safe.
- After success, inserts its `id` into the `migrations` table with `ON CONFLICT DO NOTHING`. The row is informational only. The real gate is the `IF NOT EXISTS`.

Rules:

- Adding a column or table: append a new step.
- Modifying an existing step that has shipped: don't. Add a new step.
- Dropping a step: don't. Breaks reproducibility.

## Admin bootstrap

Logic in `ensureBootstrapAdmin()`:

1. Count `users WHERE role = 'admin'`. Non-zero: return.
2. Generate a 10-char random password (no `0/O/1/l/I` to avoid confusion).
3. Bcrypt rounds 10.
4. INSERT a row: email = `BOOTSTRAP_ADMIN_EMAIL` env or `admin@otisak.local`, name = `Administrator`.
5. Print a banner to stdout with email and password.

Plaintext is never stored. Recover from logs:

```bash
docker compose logs app | grep -A2 'admin account bootstrapped'
```

If you miss the log, reset via DB or wipe and reseed.

## Demo exam

Logic in `ensureDemoExam()`:

1. Read `seeds/saljivi-test.json`. Title: `Šaljivi test: crtani junaci`.
2. If an exam with exactly that title exists, return.
3. Find the first admin. If none, log and return.
4. Find or create the `Demo` subject (code `DEMO`).
5. `importExamFromJson(saljivi, adminId, { exam_mode: 'practice', self_service: true, is_public: true, status: 'active', subject_id })`.

Shows up: students see it in **Vežba**; admins and Demo-subject assistants see it in `/manage`.

To replace or remove, see [`../admin/demo-exam.md`](../admin/demo-exam.md).

## Failure modes

- `ensureBootstrapAdmin` and `ensureDemoExam` catch their own errors and log. Server still starts. Worst case: empty dashboard until the admin imports something.
- `runMigrations` does not. A failing migration crashes boot. Fix or revert.
