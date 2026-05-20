# Uputstvo za asistenta

Asistenti vode ispite za predmete na koje su dodeljeni. Bez dodela `/manage` je prazan. Pitaj admina da te doda na tvoj predmet pre svega ostalog.

## Stranice

- [Pravljenje ispita](building-an-exam.md). Podešavanja, tipovi pitanja, banka pitanja, JSON import.
- [Vođenje sobe](running-the-room.md). Napredak uživo, podešavanje tajmera, lockdown, zahtevi za naknadan ulazak.
- [Posle ispita](after-the-exam.md). Zatvaranje ispita, izvoz rezultata, AI ocenjivanje za otvorene odgovore.

## Životni ciklus ispita

```
draft  →  scheduled  →  active  →  completed  →  archived
```

- **draft**. Može se menjati.
- **scheduled**. Opciono zakazan za datum. Upisani studenti vide na Dashboard-u.
- **active**. Studenti mogu da pristupe. Izbegavaj izmene odavde.
- **completed**. Konačno. Baza blokira povratak na active.
- **archived**. Skriven sa glavne liste.

Prelaz `completed` → `active` je blokiran na nivou baze. Nijedno UI dugme niti slučajni API poziv ne može da poništi završen ispit.

## Dva načina za kreiranje

1. **Ručno**. `/manage`, **Nov ispit**, pa pitanja na `/manage/:id/edit`.
2. **JSON import**. `/manage`, **Uvezi JSON**. Isti oblik kao export endpoint. Korisno za ponovno korišćenje prošlogodišnjeg ispita ili prebacivanje između okruženja. `subject_name` u JSON-u se matchuje (case-insensitive) sa jednim od tvojih dodeljenih predmeta.

## Banka pitanja ili inline pitanja

Inline pitanja žive na samom ispitu. `/manage/:id/edit` ih standardno prikazuje.

Bank-backed ispiti izvlače N pitanja iz banke koristeći tag pravila. Bazen se generiše ispočetka za svaki pokušaj. Vidi [`building-an-exam.md`](building-an-exam.md) za izbor.
