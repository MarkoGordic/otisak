# Arhitektura

OTISAK su dva procesa: Postgres i Node servis. Node servis opslužuje i JSON API i prebild-ovan React client kao statičke fajlove. Nema posebnog front-end host-a. Nema SSR. Nema message brokera. Nema cache sloja. Sve stanje živi u Postgres-u.

```
┌────────────┐      HTTPS       ┌──────────────────────────────┐      TCP      ┌──────────────┐
│  Browser   │ ───────────────▶ │  Express (server/dist)       │ ────────────▶ │  Postgres 16 │
│  React     │ ◀─── WSS ──────▶ │   + Vite-build static client │               │   (init.sql) │
└────────────┘                  └──────────────────────────────┘               └──────────────┘
```

## Stranice

- [`bootstrap.md`](bootstrap.md). Šta se izvršava pri prvom pokretanju: admin nalog, migracije, demo ispit.
- [`authz.md`](authz.md). Sesija, role gates, subject-assignment scope za asistente.
- [`schema.md`](schema.md). Kroz `init.sql`: koje tabele drže šta, plus ne-očigledni constraint-i.
- [`exam-lifecycle.md`](exam-lifecycle.md). Od "uđi u sobu" do "vidim rezultate". Pokušaji, auto-save, WS kanal, lockdown.
- [`deploy.md`](deploy.md). Dockerfile faze, `deploy.sh`, šta očekuje reverse-proxy, healthcheck.

## Zašto baš ovakve odluke

| Odluka | Razlog |
|---|---|
| Bez ORM-a, raw SQL preko `pg` | Šema je mala, upiti su read-heavy join-ovi. ORM bi dodao slojeve bez ubrzanja. |
| Jedan server proces za API i statički client | Jednostavniji deploy. Eliminisana klasa CORS bagova. Client bundle je ~1 MB, splitting ne donosi ništa. |
| WebSocket samo za live sobu | Polaganje ispita je obični REST plus auto-save. WS postoji za asistentov pregled napretka i broadcast event-e (`exam.started`, `lockdown.changed`, `request.created`). |
| Idempotentne in-app migracije | `init.sql` postavlja šemu na prvom boot-u. Runtime migracije su `ALTER ... IF NOT EXISTS` zapisane u `migrations` tabeli. Sigurno za pokretanje na svakom startu kontejnera. |
| Bcrypt 10 (CSV import) i 12 (ručni register) | Ručne registracije su retke. Bulk import jednom po generaciji. Pola sekunde po redu nije bilo isplativo štedeti. |

## Dodavanje nove stranice

1. Stavi pod folder za ulogu kojoj služi (admin, assistant, student, architecture), ne pod feature folder.
2. Linkuj iz `README.md` tog foldera.
3. Ako prelazi preko uloga (npr. AI ocenjivanje važno i asistentima i programerima), biraš primarnu publiku i linkuješ odatle.
