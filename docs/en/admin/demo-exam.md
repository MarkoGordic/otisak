# The built-in demo exam

Every boot, the server checks for an exam titled `Šaljivi test: crtani junaci`. If missing, it creates one.

The fixture is `server/src/seeds/saljivi-test.json`. It's imported at compile time and ships inside the Docker image. No runtime file dependency.

## What gets created

`ensureDemoExam()` in `server/src/bootstrap.ts` runs after `ensureBootstrapAdmin()`. It:

1. Finds or creates the `Demo` subject (code `DEMO`).
2. Calls `importExamFromJson(saljivi, adminId, ...)` with overrides: `exam_mode = practice`, `self_service = true`, `is_public = true`, `status = active`.
3. Sets the creator to the first admin in the table.

Where it shows up:

- Students: in the **Vežba** tab on the dashboard. Visible even when the global practice toggle is off because the exam is public.
- Admins and Demo-subject assistants: in `/manage` like any other exam.

## Idempotency

The check is `SELECT id FROM otisak_exams WHERE title = 'Šaljivi test: crtani junaci'`. On subsequent boots, that row exists, so nothing happens.

To reset the demo, delete it from `/manage`. The next boot re-seeds it.

## Removing the demo permanently

Either:

- Remove the `ensureDemoExam()` call from `server/src/index.ts` and delete the existing exam from `/manage`.
- Or also rename the title in the JSON to break the lookup, if you want the file to stay but not auto-seed.

## Replacing the demo

1. Export your exam from `/manage` (the **JSON** button).
2. Replace `server/src/seeds/saljivi-test.json` with that file.
3. Delete the existing demo exam from `/manage` so the new title is picked up.
4. Rebuild and restart.

The lookup is by title. If your replacement keeps the same title as the existing demo, the existing row blocks it. Rename the title in JSON or delete the old row first.
