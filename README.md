# OTISAK

A self-hosted exam and assessment platform. Runs in two containers (Postgres + a Node service that serves the API and the static client) and bootstraps an admin account on first start.

## Quick start

```bash
cp .env.example .env
# set SESSION_SECRET to a 64-char random hex (the server refuses to boot without it)
docker compose up --build
```

The app is exposed on `HOST_PORT` (default `3000`). On first boot the server bootstraps an `admin@otisak.local` account with a random password and prints it once to the container logs:

```
docker compose logs app | grep -A2 'admin account bootstrapped'
```

A built-in practice exam (the "Šaljivi test" demo) is seeded on the same boot and shows up in the **Vežba** tab on the dashboard.

## Stack

- **Client** — Vite + React 18 + TypeScript + Tailwind, no SSR
- **Server** — Express + WebSocket (`ws`) on top of `pg`, no ORM
- **DB** — PostgreSQL 16; schema in [`init.sql`](init.sql), idempotent in-app migrations on every boot
- **Deploy** — one Dockerfile (multi-stage), one `docker-compose.yml`

## Roles

| Role | Can |
|---|---|
| **admin** | everything: users, subjects, all exams, all questions |
| **assistant** | manage exams and bank questions on subjects they're assigned to |
| **student** | take exams they're enrolled in, plus any public practice exam |

Subject assignments are managed by admins from the **Predmeti** page (`Asistenti` button on each subject). Assistants only see and mutate exams whose `subject_id` is in their assignment list — enforced at the route level, not just the UI.

## Features

- Seven question types: single-/multi-choice, code (highlighted), image, open-text (AI-graded), ordering, matching, fill-in-the-blank
- Configurable per-exam: duration, pass threshold, shuffling, partial scoring, negative points
- Lifecycle: draft → scheduled → active → completed → archived (completed and archived can't be reopened)
- Live room view for admins/assistants: per-student progress, lockdown toggle, timer adjustments, late-join request queue
- Auto-save during the attempt; idempotent submit on reconnect
- CSV bulk-import for students; per-user edit, role change, and password reset from the admin UI
- Per-exam JSON export/import for backup or moving between instances
- AI-grading scaffolding for open-text answers (Claude / OpenAI), with optional student-supplied API keys and credit limits
- Built-in toast feedback on every mutation, no native `alert()` dialogs

## Development

```bash
# Postgres only
docker compose up db -d

# Server (Express, watches src/)
cd server && npm install && npm run dev   # http://localhost:3001

# Client (Vite, proxies /api to the server)
cd client && npm install && npm run dev   # http://localhost:5173
```

Type-checking the whole repo:

```bash
( cd server && npx tsc --noEmit ) && ( cd client && npx tsc --noEmit )
```

The client's i18n locale files (`client/src/lib/i18n/{en,sr,sr-cyrl}.ts`) are typed against a shared `I18nKey` union, so adding a key to one without the others fails the typecheck.

## Layout

```
otisak/
├── client/                       # Vite + React app
│   └── src/
│       ├── pages/                # route components
│       ├── components/           # ui/, otisak/ (exam-taking widgets), Toast, Sidebar
│       └── lib/i18n/             # sr-Latn / sr-Cyrl / en, with type-checked keys
├── server/                       # Express + pg
│   └── src/
│       ├── routes/               # auth, admin, exams, exam, questions, subjects, practice, history
│       ├── db/                   # query helpers, types, auth-helpers, migrations
│       ├── lib/                  # importExam, finishExam, studentReport
│       ├── seeds/saljivi-test.json
│       ├── bootstrap.ts          # ensureBootstrapAdmin + ensureDemoExam
│       └── ws/                   # exam event broadcast, live-stats aggregator
├── init.sql                      # full schema, applied by the Postgres image on first run
├── Dockerfile                    # client build → server build → trimmed runtime
└── docker-compose.yml
```

## Environment

| Variable | Required | Default | Notes |
|---|---|---|---|
| `SESSION_SECRET` | yes | — | Min 16 chars; HMACs the session cookie. Server refuses to start otherwise. |
| `DATABASE_URL` | yes | `postgresql://otisak:otisak@db:5432/otisak` | |
| `HOST_PORT` | no | `3000` | Compose maps this to the container's `3001`. |
| `CLIENT_URL` | no | `http://localhost:$HOST_PORT` | Used for CORS. |
| `BOOTSTRAP_ADMIN_EMAIL` | no | `admin@otisak.local` | First-run admin only; ignored once the row exists. |

## Documentation

End-user documentation lives in [`docs/`](docs/) with one page per topic in
each language: managing exams, running tests, managing users, managing
subjects. Also served in-app at [`/docs`](/docs).

## Deploy

`deploy.sh` provisions `.env`, generates a `SESSION_SECRET`, picks a free `HOST_PORT`, builds the image, and runs `docker compose up -d`. Run it on the target host and point any reverse proxy (nginx, Caddy, Traefik) at the chosen port. The container exposes `/api/health` for healthchecks.

## License

MIT — see [`LICENSE`](LICENSE). All runtime dependencies are MIT-compatible
(MIT / ISC / Apache-2.0 / BSD / 0BSD / BlueOak-1.0.0); their license notices
ship inside `node_modules` in the runtime image.
