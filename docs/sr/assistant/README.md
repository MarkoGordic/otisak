# Uputstvo za asistenta

Asistenti vode ispite za predmete na koje su dodeljeni. Asistent bez dodela vidi praznu `/manage` stranicu — pitaj administratora da te dodeli na tvoj predmet pre nego što išta drugo počneš da radiš.

## Zadaci

- [Pravljenje ispita](building-an-exam.md) — podešavanja, tipovi pitanja, banka pitanja, JSON import.
- [Vođenje sobe za ispit](running-the-room.md) — admin pogled tokom ispita: napredak studenata uživo, podešavanje tajmera, lockdown, čekanje zahteva za naknadan ulazak.
- [Nakon ispita](after-the-exam.md) — zatvaranje ispita, izvoz rezultata, AI ocenjivanje za otvorena pitanja.

## Životni ciklus ispita

```
draft  ──▶  scheduled  ──▶  active  ──▶  completed  ──▶  archived
```

- **draft** — može se menjati. Dodaješ pitanja, podešavaš parametre.
- **scheduled** — opciono zakazan za datum; studenti sa upisom vide ga na Dashboard-u.
- **active** — studenti mogu da pristupe. Od ovog trenutka izbegavaj izmene.
- **completed** — nepovratno: ne može da se vrati na active. Rezultati su konačni.
- **archived** — izvan glavne liste.

Tranzicija `completed` → `active` je blokirana baš na nivou baze podataka — nijedno dugme u UI-ju niti slučajni API poziv ne može da poništi završen ispit.

## Dva načina za kreiranje

1. **Ručno** — `/manage` → `Nov ispit` → dodavanje pitanja jedno po jedno preko `/manage/:id/edit`.
2. **Import JSON** — `/manage` → `Uvezi JSON`. Isti oblik kao export endpoint. Korisno za ponovno korišćenje prošlogodišnjeg ispita ili prebacivanje između okruženja. JSON-ov `subject_name` se mapira (case-insensitive) na neki od tvojih dodeljenih predmeta.

## Banka pitanja vs. inline pitanja

- Ispit može imati svoja inline pitanja (to je ono što `/manage/:id/edit` standardno prikazuje).
- Ili može da bude **banka-podržan**: izvlači N pitanja iz banke filtriranih po tag pravilima, novo generisana po svakom pokušaju. Vidi [`building-an-exam.md`](building-an-exam.md) za to kad birati šta.
