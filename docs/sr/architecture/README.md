# Arhitektura

OTISAK je sistem od dva procesa: Postgres baza i Node servis koji opslužuje i JSON API i prebild-ovan React client kao statičke fajlove. Nema posebnog front-end host-a, nema SSR, nema message brokera, nema cache sloja — sve stateful živi u Postgres-u.

```
┌────────────┐      HTTPS       ┌──────────────────────────────┐      TCP      ┌──────────────┐
│  Browser   │ ───────────────▶ │  Express (server/dist)       │ ────────────▶ │  Postgres 16 │
│  React     │ ◀─── WSS ──────▶ │   + Vite-build static client │               │   (init.sql) │
└────────────┘                  └──────────────────────────────┘               └──────────────┘
```

## U ovom folderu

- [`bootstrap.md`](bootstrap.md) — šta se dešava pri prvom pokretanju: admin nalog, migracije, demo ispit.
- [`authz.md`](authz.md) — sesija, role-based provere, scope asistenata na osnovu dodela predmeta.
- [`schema.md`](schema.md) — kroz `init.sql`: koje tabele drže šta, plus ne-očigledni constraint-i.
- [`exam-lifecycle.md`](exam-lifecycle.md) — od "uđi u sobu" do "vidim rezultate": pokušaji, auto-save, WS kanal sobe, lockdown tabela.
- [`deploy.md`](deploy.md) — Dockerfile faze, `deploy.sh`, šta očekuje reverse-proxy, healthcheck.

## Zašto baš ovakve odluke

| Odluka | Razlog |
|---|---|
| Bez ORM-a, raw SQL preko `pg` | Šema je mala, upiti su uglavnom read-heavy join-ovi; ORM bi dodao apstrakciju bez da ubrza bilo šta. |
| Jedan server proces i za API i za statički client | Jednostavniji deploy, eliminisana cela klasa CORS bagova, a client bundle je ~1 MB tako da nema razloga za skaliranje da se odvaja. |
| WebSocket samo za live sobu | Polaganje ispita je obični REST + auto-save. WS služi asistentovom live pregledu napretka i broadcast event-ima (`exam.started`, `lockdown.changed`, `request.created`). |
| Idempotentne in-app migracije | `init.sql` definiše šemu na prvom boot-u; runtime migracije su `ALTER … IF NOT EXISTS` zapisane u `migrations` tabeli. Sigurno za pokretanje na svakom startu kontejnera. |
| Bcrypt rounds 10 (CSV import) / 12 (ručni register) | Ručne registracije se dešavaju retko, bulk import jednom po generaciji. Pola sekunde po redu pri import-u nije isplativo. |

## Dodavanje nove stranice dokumentacije

1. Stavi je pod folder za ulogu kojoj služi (admin / assistant / student / architecture), ne pod feature folder.
2. Linkuj je iz `README.md` tog foldera.
3. Ako pokriva više uloga (npr. AI ocenjivanje je važno i asistentima i programerima), izaberi *primarnu* publiku i linkuj odatle.
