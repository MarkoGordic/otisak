# OTISAK — Dokumentacija

Dokumentacija je organizovana po ulozi. Izaberi onu koja te se tiče:

| Uloga | Gde da kreneš | Šta pokriva |
|---|---|---|
| Administrator | [`admin/`](admin/) | Korisnici, predmeti, dodela asistenata, podešavanja, demo ispit |
| Asistent | [`assistant/`](assistant/) | Kreiranje i vođenje ispita na dodeljenim predmetima |
| Student | [`student/`](student/) | Pristup ispitu, sam ispit, rezultati, režim vežbe |
| Inženjer | [`architecture/`](architecture/) | Tehnologije, tok zahteva, šema, deploy |

## Konvencije

- Jedna uloga po folderu. Ne mešaj uputstva za admina i studenta u istom fajlu.
- Svaki dublji deo je poseban Markdown fajl linkovan iz `README.md` tog foldera, ne jedan ogroman dokument.
- Slike ide pod `docs/_assets/`. Referenciraj ih relativnim putanjama.
- Kad se neka funkcionalnost menja, ažuriraj njenu stranicu **u istom PR-u** sa kodom. Zastarela dokumentacija je gora od nikakve.
