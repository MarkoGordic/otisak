# Deploy

Jedan Docker image, jedan `docker-compose.yml`. Image nosi API, statički client i (za PDF izvoz) sistemski Chromium. Postgres ide pored.

## Dockerfile

Multi-stage:

```
[client-build]   node:20-alpine    Vite client
[server-build]   node:20-slim      tsc sa devDeps
[server-prod]    node:20-slim      samo prod deps
[runner]         node:20-slim      dist + prod deps + Chromium
```

Zašto:

- Client builder pokreće `vite build`, daje statičke fajlove. Krajnji image ima samo `dist/`, bez node_modules.
- Server full install (TypeScript, `@types/*`) samo u build fazi. Runner ima prod install. Ušteđuje ~80 MB.
- Runner instalira sistemski Chromium i minimum lib-ova. Puppeteer koristi sistemski binary. Bundled Chromium download je isključen preko `PUPPETEER_SKIP_DOWNLOAD=true`.

### Važno

- Build context mora da uključuje `client/`, `server/` i `docs/`. Vite glob u `client/src/lib/docs.ts` čita `../../../docs/**/*.md` i traži da `docs/` bude prisutan u build vremenu.
- `.dockerignore` ne sme blanket da isključi `**/*.md`. Pre je (docs site je tiho šipovao prazan). Sad samo gornji meta fajlovi su isključeni eksplicitno. Komentar u fajlu upozorava sledećeg da ne vrati wildcard.
- BuildKit cache mounts na `/root/.npm` i `/var/cache/apt` ubrzavaju ponovne build-ove.

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

Imenovan volume `pgdata` traje između restart-a. `docker compose down -v` ga briše. `init.sql` se izvršava jednom na praznom data directory-ju; preskočen pri re-up sa podacima.

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

`HOST_PORT` default 3000. Kontejner uvek sluša na 3001 unutra.

`SESSION_SECRET` je obavezan (`:?`). Server takođe re-checks pri boot-u: minimum 16 karaktera.

## deploy.sh

Helper za self-hosted. Radi:

1. Bira slobodan `HOST_PORT`.
2. Generiše 64-char hex `SESSION_SECRET` ako `.env` nema.
3. Upisuje `.env`.
4. Pokreće `docker compose up -d --build`.

Flag-ovi:

| Flag | Šta |
|---|---|
| `--clean` | Briše i volume-e. Destruktivno. |
| `--port N` | Forsira specifičan port. |
| `--no-build` | Bez rebuild-a, samo restart. |

Ne radi `git pull`. To uradi prvo sam.

## Reverse proxy

Primer nginx site-a:

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

`Upgrade`/`Connection` header-i su obavezni za WebSocket na `/ws/exam/:examId`. Caddy i Traefik takođe rade.

## Healthcheck

`/api/health` vraća `{ "status": "ok" }` kad je DB konekcija aktivna i bootstrap završen.

Compose pollu-je svakih 15s sa 5s timeout-om i 45s start period-om. Start period daje bootstrap-u (migracije, admin seed, demo seed) vreme da završi.

## Ažuriranje

Rutinski (nov kod, bez schema promene):

```bash
git pull
docker compose up -d --build app
```

Rebuild image-a, recreate kontejnera. DB se ne dira.

Schema promena: migracija ide na sledećem boot-u. Ako padne, nov kontejner ne kreće; stari je već nestao. Planiraj downtime.

Destruktivne promene (rename kolone, drop tabele): testiraj na kopiji prvo.

## Backup-i

Postgres podaci žive u `pgdata`.

```bash
docker compose exec db pg_dump -U otisak otisak > backup-$(date +%F).sql
docker compose exec -T db psql -U otisak otisak < backup-2025-01-01.sql
```

Dovoljno za male deploy-e. Za veće, pgBackRest ili WAL-G.
