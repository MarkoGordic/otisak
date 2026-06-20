<p align="center">
  <img src=".github/banner.png" alt="OTISAK — platforma za ispitivanje" width="680">
</p>

<p align="center">A self-hosted exam and assessment platform.</p>

## Quick start

```bash
cp .env.example .env
# set SESSION_SECRET to a 64-char random hex (the server refuses to boot without it)
docker compose up --build
```

The app is exposed on `HOST_PORT` (default `3000`). On first boot the server creates an `admin@otisak.local` account with a random password and prints it once to the logs:

```bash
docker compose logs app | grep -A2 'admin account bootstrapped'
```

A built-in practice exam is seeded on the same boot and shows up in the **Vežba** tab.

## Roles

| Role | Can |
|---|---|
| **admin** | everything: users, subjects, all exams, all questions |
| **assistant** | manage exams and questions on assigned subjects |
| **student** | take enrolled exams, plus any public practice exam |

## Features

- Seven question types: single-/multi-choice, code, image, open-text (AI-graded), ordering, matching, fill-in-the-blank
- Per-exam config: duration, pass threshold, shuffling, partial scoring, negative points
- Live room view: per-student progress, lockdown, timer adjustments, late-join queue
- Auto-save with idempotent submit, CSV student import, per-exam JSON export/import

## Documentation

End-user documentation lives in [`app/docs/`](app/docs/) and is served in-app at `/docs`.

## License

MIT — see [`LICENSE`](LICENSE).
