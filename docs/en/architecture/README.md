# Architecture

OTISAK is two processes: Postgres and a Node service. The Node service serves both the JSON API and the pre-built React client as static files. No separate front-end host. No SSR. No message broker. No cache layer. All state lives in Postgres.

```
┌────────────┐      HTTPS       ┌──────────────────────────────┐      TCP      ┌──────────────┐
│  Browser   │ ───────────────▶ │  Express (server/dist)       │ ────────────▶ │  Postgres 16 │
│  React     │ ◀─── WSS ──────▶ │   + Vite-built static client │               │   (init.sql) │
└────────────┘                  └──────────────────────────────┘               └──────────────┘
```

## Pages

- [`bootstrap.md`](bootstrap.md). What runs on first boot: admin account, migrations, demo exam seed.
- [`authz.md`](authz.md). Session model, role gates, subject-assignment scope for assistants.
- [`schema.md`](schema.md). Tour of `init.sql`: which tables hold what, and the non-obvious constraints.
- [`exam-lifecycle.md`](exam-lifecycle.md). From "join the room" to "results visible". Attempts, auto-save, the WS channel, lockdowns.
- [`deploy.md`](deploy.md). Dockerfile stages, `deploy.sh`, reverse-proxy expectations, healthcheck.

## Why these choices

| Decision | Reason |
|---|---|
| No ORM, raw SQL via `pg` | Schema is small, queries are read-heavy joins. An ORM would add layers without speeding anything up. |
| One server process for API and static client | Simpler deploy. Kills a class of CORS bugs. Client bundle is about 1 MB, so splitting buys nothing. |
| WebSocket only for the live room | Exam-taking is plain REST plus auto-save. WS exists for the assistant's progress view and broadcast events (`exam.started`, `lockdown.changed`, `request.created`). |
| Idempotent in-app migrations | `init.sql` sets up the schema on the first boot. Runtime migrations are `ALTER ... IF NOT EXISTS` recorded in a `migrations` table. Safe to run on every container start. |
| Bcrypt rounds 10 (CSV import) and 12 (manual register) | Manual registers are rare. Bulk imports happen once per cohort. Half a second per row at import wasn't worth saving. |

## Adding a new doc page

1. Put it under the role folder it serves (admin, assistant, student, architecture), not under a feature folder.
2. Link to it from that folder's `README.md`.
3. If it crosses roles (for example, AI grading concerns both assistants and engineers), pick the primary audience and link from there.
