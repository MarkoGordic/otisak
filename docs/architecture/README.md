# Architecture

OTISAK is a two-process system: a Postgres database and a Node service that serves both the JSON API and the pre-built React client as static files. There is no separate front-end host, no SSR, no message broker, no cache layer — everything stateful lives in Postgres.

```
┌────────────┐      HTTPS       ┌──────────────────────────────┐      TCP      ┌──────────────┐
│  Browser   │ ───────────────▶ │  Express (server/dist)       │ ────────────▶ │  Postgres 16 │
│  React     │ ◀─── WSS ──────▶ │   + Vite-built static client │               │   (init.sql) │
└────────────┘                  └──────────────────────────────┘               └──────────────┘
```

## In this folder

- [`bootstrap.md`](bootstrap.md) — what runs on first boot: admin account, migrations, demo exam seed.
- [`authz.md`](authz.md) — session model, role gates, the subject-assignment scope for assistants.
- [`schema.md`](schema.md) — annotated tour of `init.sql`: which tables hold what, and the non-obvious constraints.
- [`exam-lifecycle.md`](exam-lifecycle.md) — what happens from "join the room" to "results visible" — attempts, auto-save, the WS room channel, the lockdown table.
- [`deploy.md`](deploy.md) — Dockerfile stages, `deploy.sh`, reverse-proxy expectations, healthcheck.

## Why these choices

| Decision | Reason |
|---|---|
| No ORM, raw SQL via `pg` | Schema is small and queries are mostly read-heavy joins; an ORM would add abstraction without speeding anything up. |
| One server process for both API and static client | Simplifies deploy, eliminates a class of CORS bugs, and the client bundle is ~1 MB so there's no scaling reason to split. |
| WebSocket for live-room only | Exam-taking is plain REST + auto-save. WS exists for the assistant's live progress view and broadcast events (`exam.started`, `lockdown.changed`, `request.created`). |
| Idempotent in-app migrations | `init.sql` defines the schema for first boot; runtime migrations are `ALTER … IF NOT EXISTS` and recorded in a `migrations` table. Safe to run on every container start. |
| Bcrypt at rounds 10 (CSV import) / 12 (manual register) | Manual registrations happen rarely, bulk-import happens once per cohort. Trading half a second of import time per row was not worth it. |

## Adding a new doc page

1. Put it under the audience folder it serves (admin / assistant / student / architecture), not under a feature folder.
2. Link to it from that folder's `README.md`.
3. If it crosses audiences (e.g. AI grading concerns both assistants and architects), pick the *primary* audience and link from there.
