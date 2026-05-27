# Otisak Deployment

Otisak (Automated Test and Integrated Scoring Assessment Kernel) is **not currently deployed on `gordic.rs`**. This guide covers self-hosting the standalone exam platform.

## Architecture

```
[browser] -> nginx (or any reverse proxy) -> otisak-app:3000 -> otisak-db:5432
```

Self-contained: Next.js 14 app + Postgres in one compose stack. No external auth dependency (own session management). No shared volumes.

## Quick start (local / dev)

```bash
git clone <repo>
cd otisak
cp .env.example .env
# fill in: DATABASE_URL password, NEXTAUTH_SECRET, AI grading keys (if used)

docker compose up --build
```

App at `http://localhost:3000`. DB initialized with default admin:
- email: `admin@otisak.local`
- password: `admin123`

**Change this password before any non-local deploy.**

## Production deploy (any server)

```bash
ssh user@server
git clone <repo> ~/otisak
cd ~/otisak

# 1. Env
cp .env.example .env
chmod 600 .env
nano .env
# Set:
#   DATABASE_URL=postgresql://otisak:<strong-pw>@db:5432/otisak
#   NEXTAUTH_URL=https://otisak.example.com
#   NEXTAUTH_SECRET=$(openssl rand -hex 32)
#   AI_GRADING_API_KEY=...   (if using AI grading)

# 2. Reverse proxy: point your nginx/Traefik/Caddy at otisak-app:3000
#    (the app listens on 3000; map 80/443 with TLS to it).
#    Example nginx site:
#      proxy_pass http://127.0.0.1:3000;
#      proxy_set_header Host $host;
#      proxy_set_header X-Real-IP $remote_addr;
#      proxy_set_header X-Forwarded-Proto $scheme;

# 3. Start
docker compose up -d --build

# 4. Change the default admin password immediately
#    Log in as admin@otisak.local / admin123, then go to Settings → Account.
```

## Standard deploy (code changes)

```bash
cd ~/otisak
git pull origin main
docker compose up -d --build app
```

Rebuilds only `app`. DB volume untouched.

## Environment

`~/otisak/.env` (mode 600). Keys:
- `DATABASE_URL` — Postgres connection string
- `NEXTAUTH_URL` — public URL (must match the URL users hit in browser)
- `NEXTAUTH_SECRET` — generate with `openssl rand -hex 32`
- `AI_GRADING_API_KEY` — optional, for the AI grading feature
- `DEFAULT_ADMIN_EMAIL` / `DEFAULT_ADMIN_PASSWORD` — created on first DB init only

## DANGER ZONE

```bash
docker compose down -v             # destroys all DB data (users, exams, attempts)
docker volume rm otisak_pgdata     # same — DB only
```

`docker compose down` keeps the volume.

## Folding into ELPIS (optional, future)

If you decide to deploy alongside the other ELPIS services on `gordic.rs`:
1. Add an entry to `~/elpis/docker-compose.yml` modeled on `studynest` (Next.js app + dedicated `elpis-otisak-db`).
2. Build context `/home/gordic/otisak`.
3. Volume name `elpis_otisak_db_data`.
4. Networks: `elpis_public_net`, `elpis_private_net`.
5. Add OAuth via elpis-id if you want SSO with the rest of the platform; otherwise keep its own auth.
6. Add Traefik route to `~/elpis/platform/traefik/dynamic.yml` for `otisak.gordic.rs`.

## Troubleshooting

| Symptom | Check |
|---|---|
| App returns 500 on every request | DB schema not migrated — `docker logs otisak-app --tail 50` |
| Default admin login rejected | Already changed, or DB volume newer than initial seed |
| AI grading fails silently | `AI_GRADING_API_KEY` missing/invalid; check app logs |
| Postgres won't start | Volume created with old password — see `~/elpis/DEPLOYMENT.md` "Changing database passwords" |
