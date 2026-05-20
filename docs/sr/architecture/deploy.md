# Postavljanje na server

Jedna Docker slika, jedan `docker-compose.yml`. Slika sadrži API, statički klijent i (za izvoz u PDF) sistemski Chromium. Postgres ide pored.

## Dockerfile

Više faza:

```
[client-build]   node:20-alpine    Vite klijent
[server-build]   node:20-slim      tsc sa devDeps
[server-prod]    node:20-slim      samo prod zavisnosti
[runner]         node:20-slim      dist + prod zavisnosti + Chromium
```

Zašto:

- Faza za klijent pokreće `vite build` i daje statičke fajlove. Krajnja slika nosi samo `dist/`, bez `node_modules`.
- Server ima fazu sa svim zavisnostima (TypeScript, `@types/*`) i fazu sa samo produkcionim zavisnostima. Krajnja slika nosi prod izdanje. Ušteda oko 80 MB.
- Krajnja slika instalira sistemski Chromium i minimum biblioteka. Puppeteer koristi sistemski binar. Preuzimanje ugrađenog Chromium-a je isključeno kroz `PUPPETEER_SKIP_DOWNLOAD=true`.

### Važno

- Kontekst gradnje mora da sadrži `client/`, `server/` i `docs/`. Vite `import.meta.glob` u `client/src/lib/docs.ts` čita `../../../docs/**/*.md` i traži da `docs/` bude prisutan u trenutku gradnje.
- `.dockerignore` ne sme da isključi `**/*.md` kao šablon. Ranije je (i sajt dokumentacije je tiho putovao prazan). Sad su isključeni samo top-level meta fajlovi. U fajlu postoji upozorenje da se ne vraća šablon.
- BuildKit cache mounts na `/root/.npm` i `/var/cache/apt` ubrzavaju ponovne gradnje.

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

Imenovan volumen `pgdata` čuva podatke između restarta. `docker compose down -v` ga briše. `init.sql` se izvršava jednom na praznom direktorijumu; preskače se na narednim pokretanjima.

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

`HOST_PORT` je podrazumevano 3000. Kontejner uvek sluša na 3001 unutra.

`SESSION_SECRET` je obavezan (`:?`). Server takođe proverava pri pokretanju: mora imati najmanje 16 znakova.

## deploy.sh

Pomoćna skripta za samostalno hostovanje. Radi:

1. Bira slobodan `HOST_PORT`.
2. Pravi 64-znakovni heksadekadni `SESSION_SECRET` ako ga nema u `.env`.
3. Upisuje u `.env`.
4. Pokreće `docker compose up -d --build`.

Opcije:

| Opcija | Šta radi |
|---|---|
| `--clean` | Briše i volumene. Nepovratno. |
| `--port N` | Postavlja tačno određen port. |
| `--no-build` | Bez ponovne gradnje, samo restartuje. |

Ne radi `git pull`. To uradi sam pre nje.

## Obratni proksi

Primer postavke u nginx-u:

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

Zaglavlja `Upgrade`/`Connection` su obavezna za WebSocket na `/ws/exam/:examId`. Caddy i Traefik takođe rade.

## Provera ispravnosti

`/api/health` vraća `{ "status": "ok" }` kad je veza ka bazi aktivna i kad je pokretanje završeno.

Compose proverava svakih 15 sekundi sa istekom od 5 sekundi i početnim periodom od 45 sekundi. Početni period daje pokretanju (migracije, posejavanje admina, posejavanje demo-a) vreme da se završi.

## Ažuriranje

Redovno (nov kod, bez promene šeme):

```bash
git pull
docker compose up -d --build app
```

Ponovo gradi sliku i pravi nov kontejner. Baza se ne dira.

Promena šeme: migracija ide pri sledećem pokretanju. Ako padne, novi kontejner ne kreće; stari je već nestao. Planiraj zastoj.

Nepovratne promene (promena imena kolone, brisanje tabele): testiraj na kopiji pre svega.

## Rezervne kopije

Postgres podaci žive u `pgdata`.

```bash
docker compose exec db pg_dump -U otisak otisak > backup-$(date +%F).sql
docker compose exec -T db psql -U otisak otisak < backup-2025-01-01.sql
```

Dovoljno za manje postavke. Za veće: pgBackRest ili WAL-G.
