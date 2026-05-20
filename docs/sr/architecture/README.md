# Arhitektura

OTISAK su dva procesa: Postgres i Node servis. Node servis opslužuje i JSON API i izgrađen React klijent kao statičke fajlove. Nema posebnog hosta za prednji deo. Nema SSR. Nema posrednika za poruke. Nema sloja za keširanje. Svo stanje živi u Postgres-u.

```
┌────────────┐      HTTPS       ┌──────────────────────────────┐      TCP      ┌──────────────┐
│  Browser   │ ───────────────▶ │  Express (server/dist)       │ ────────────▶ │  Postgres 16 │
│  React     │ ◀─── WSS ──────▶ │   + Vite-build static client │               │   (init.sql) │
└────────────┘                  └──────────────────────────────┘               └──────────────┘
```

## Stranice

- [`bootstrap.md`](bootstrap.md). Šta se izvršava pri prvom pokretanju: admin nalog, migracije, posejavanje demo ispita.
- [`authz.md`](authz.md). Sesija, provere uloga, ograničenje asistenata po dodeljenim predmetima.
- [`schema.md`](schema.md). Kroz `init.sql`: koja tabela drži šta, plus neočigledna ograničenja.
- [`exam-lifecycle.md`](exam-lifecycle.md). Od "ulazak u sobu" do "vidim rezultate". Pokušaji, auto-snimanje, WS kanal, zabrana rada.
- [`deploy.md`](deploy.md). Faze Dockerfile-a, `deploy.sh`, šta očekuje obratni proksi, provera ispravnosti.

## Zašto baš ovakve odluke

| Odluka | Razlog |
|---|---|
| Bez ORM-a, raw SQL preko `pg` | Šema je mala, upiti su uglavnom join-ovi koji puno čitaju. ORM bi dodao sloj bez ubrzanja. |
| Jedan server proces za API i statički klijent | Jednostavniji deploy. Otpada cela klasa CORS grešaka. Bandl klijenta je oko 1 MB, nema razloga za razdvajanje. |
| WebSocket samo za sobu uživo | Polaganje ispita je običan REST plus auto-snimanje. WS postoji zbog asistentovog pregleda napretka i događaja `exam.started`, `lockdown.changed`, `request.created`. |
| Idempotentne migracije u aplikaciji | `init.sql` postavlja šemu pri prvom pokretanju. Migracije u vreme rada su `ALTER ... IF NOT EXISTS` i upisane u tabelu `migrations`. Bezbedno se pokreću na svakom paljenju kontejnera. |
| Bcrypt 10 (uvoz iz CSV-a) i 12 (ručna registracija) | Ručne registracije su retke. Masovni uvoz se dešava jednom po generaciji. Pola sekunde po redu pri uvozu nije bilo isplativo štedeti. |

## Dodavanje nove stranice

1. Stavi je u folder one uloge kojoj služi (admin, assistant, student, architecture), a ne u folder po funkcionalnosti.
2. Linkuj je iz `README.md` tog foldera.
3. Ako prelazi preko više uloga (na primer, AI ocenjivanje tiče se i asistenata i programera), izaberi primarnu publiku i linkuj odatle.
