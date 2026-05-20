# OTISAK dokumentacija

Izaberi ulogu i kreni tu.

| Uloga | Kuda | Šta pokriva |
|---|---|---|
| Administrator | [`admin/`](admin/) | Korisnici, predmeti, dodela asistenata, podešavanja, demo ispit |
| Asistent | [`assistant/`](assistant/) | Pravljenje i vođenje ispita na dodeljenim predmetima |
| Student | [`student/`](student/) | Pristup ispitu, ekran ispita, rezultati, vežba |
| Inženjer | [`architecture/`](architecture/) | Tehnologije, tok zahteva, šema, deploy |

## Konvencije

Jedan folder po ulozi. Ne mešaj uputstva za admina i studenta u istom fajlu.

Svaka tema je svoja kratka stranica linkovana iz README-a tog foldera. Bez fajlova od 1000 linija.

Slike idu u `docs/_assets/`. Referenciraj ih relativnim putanjama.

Kada se funkcionalnost menja, ažuriraj njenu stranicu u istom PR-u. Zastarela dokumentacija je gora od nikakve.
