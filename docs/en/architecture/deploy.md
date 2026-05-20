# Deploy

One Docker image, one `docker-compose.yml`. The image bundles the API, the static client, and (for PDF export) system Chromium. Postgres runs alongside.

## Dockerfile

Multi-stage:

```
[client-build]   node:20-alpine    Vite client
[server-build]   node:20-slim      tsc with devDeps
[server-prod]    node:20-slim      prod-only deps
[runner]         node:20-slim      dist + prod deps + Chromium
```

Why:

- Client builder runs `vite build`, outputs static files. Final image has just `dist/`, no node_modules.
- Server full install (TypeScript, `@types/*`) only in the build stage. Runner gets the prod install. Saves ~80 MB.
- Runner installs system Chromium and minimal libs. Puppeteer uses the system binary. Bundled Chromium download is disabled via `PUPPETEER_SKIP_DOWNLOAD=true`.

### Important

- Build context must include `client/`, `server/`, and `docs/`. The Vite glob in `client/src/lib/docs.ts` reads `../../../docs/**/*.md` and needs `docs/` present at build time.
- `.dockerignore` must not blanket-exclude `**/*.md`. It used to (the docs site silently shipped empty). Now only top-level meta files are excluded. There's a warning comment in the file.
- BuildKit cache mounts on `/root/.npm` and `/var/cache/apt` speed up repeat builds.

## docker-compose.yml

### db

```yaml
db:
  image: postgres:16-alpine
  volumes:
    - pgdata:/var/lib/postgresql/data
    - ./init.sql:/docker-entrypoint-initdb.d/init.sql
  healthcheck: pg_isready
```

Named volume `pgdata` persists across restarts. `docker compose down -v` wipes it. `init.sql` runs once on an empty data directory; skipped on re-up with data.

### app

```yaml
app:
  build: .
  ports:
    - "${HOST_PORT:-3000}:3001"
  environment:
    DATABASE_URL: postgresql://otisak:otisak@db:5432/otisak
    SESSION_SECRET: ${SESSION_SECRET:?required}
    CLIENT_URL: ${CLIENT_URL:-http://localhost:${HOST_PORT:-3000}}
```

`HOST_PORT` default 3000. Container always listens on 3001 inside.

`SESSION_SECRET` is required (`:?`). Server also re-checks at boot: must be at least 16 chars.

## deploy.sh

Self-hosted helper. It:

1. Picks a free `HOST_PORT`.
2. Generates a 64-char hex `SESSION_SECRET` if `.env` doesn't have one.
3. Writes `.env`.
4. Runs `docker compose up -d --build`.

Flags:

| Flag | What |
|---|---|
| `--clean` | Tears down volumes too. Destructive. |
| `--port N` | Force a specific port. |
| `--no-build` | Skip rebuild, just restart. |

Doesn't `git pull`. Do that yourself first.

## Reverse proxy

Example nginx site:

```nginx
server {
  listen 443 ssl;
  server_name otisak.example.edu;
  ssl_certificate     /etc/letsencrypt/live/otisak.example.edu/fullchain.pem;
  ssl_certificate_key /etc/letsencrypt/live/otisak.example.edu/privkey.pem;

  location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection 'upgrade';
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
}
```

`Upgrade`/`Connection` headers are required for the WebSocket at `/ws/exam/:examId`. Caddy and Traefik work too.

## Healthcheck

`/api/health` returns `{ "status": "ok" }` once the DB connection is up and bootstrap finished.

Compose polls every 15s with a 5s timeout and a 45s start period. The start period gives bootstrap (migrations, admin seed, demo seed) time to finish.

## Updating

Routine update (new code, no schema change):

```bash
git pull
docker compose up -d --build app
```

Rebuilds the app image and recreates the container. DB stays untouched.

Schema change: migration runs on next boot. If it fails, the new container won't start; old container is already gone. Plan downtime accordingly.

Destructive changes (rename column, drop table): test on a copy first.

## Backups

Postgres data lives in `pgdata`.

```bash
docker compose exec db pg_dump -U otisak otisak > backup-$(date +%F).sql
docker compose exec -T db psql -U otisak otisak < backup-2025-01-01.sql
```

Enough for small deployments. For larger, use pgBackRest or WAL-G.
