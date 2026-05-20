# Uputstvo za asistenta

Asistenti vode ispite na predmetima na koje su dodeljeni. Bez dodela `/manage` je prazan. Pre svega ostalog, zamoli admina da te doda na tvoj predmet.

## Stranice

- [Pravljenje ispita](building-an-exam.md). Podešavanja, tipovi pitanja, banka pitanja, uvoz iz JSON-a.
- [Vođenje sobe](running-the-room.md). Napredak uživo, podešavanje vremena, zabrana rada, zahtevi za naknadan ulazak.
- [Posle ispita](after-the-exam.md). Zatvaranje ispita, izvoz rezultata, AI ocenjivanje za otvorene odgovore.

## Životni ciklus ispita

```
draft  →  scheduled  →  active  →  completed  →  archived
```

- **draft**. Može da se menja.
- **scheduled**. Opciono zakazan za datum. Upisani studenti ga vide na početnoj strani.
- **active**. Studenti mogu da pristupe. Od tog trenutka izbegavaj izmene.
- **completed**. Konačno. Baza ne dozvoljava povratak u `active`.
- **archived**. Sklonjeno sa glavne liste.

Prelaz `completed` → `active` blokiran je na nivou baze. Nijedno dugme u sučelju ni slučajni API poziv ne mogu da ponište završen ispit.

## Dva načina pravljenja

1. **Ručno**. `/manage`, **Nov ispit**, zatim pitanja na `/manage/:id/edit`.
2. **Uvoz iz JSON-a**. `/manage`, **Uvezi JSON**. Isti oblik kao što daje endpoint za izvoz. Korisno za ponovno korišćenje prošlogodišnjeg ispita ili prebacivanje između okruženja. Vrednost `subject_name` iz JSON-a se poklapa (bez razlike u veličini slova) sa nekim od tvojih dodeljenih predmeta.

## Banka pitanja ili pitanja na ispitu

Pitanja na ispitu (inline) žive uz sam ispit. `/manage/:id/edit` ih podrazumevano prikazuje.

Ispiti vezani za banku izvlače N pitanja iz banke po pravilima nad oznakama. Bazen se ponovo izvlači za svaki pokušaj. Vidi [`building-an-exam.md`](building-an-exam.md) za izbor između dva načina.
