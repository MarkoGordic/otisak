# Uputstvo za administratora

Administrator je najviša uloga. Admin može sve: korisnici, predmeti, svi ispiti, sva pitanja, globalna podešavanja. Prvi admin se kreira automatski pri prvom pokretanju (vidi [`../architecture/bootstrap.md`](../architecture/bootstrap.md)).

## Stranice

- [Upravljanje korisnicima](users.md). Kreiranje, izmena, promena uloge, reset lozinke, bulk import iz CSV-a.
- [Predmeti i dodela asistenata](subjects.md). Kreiranje predmeta. Dodela asistenata da vode ispite na predmetu.
- [Globalna podešavanja](settings.md). Toggle za režim vežbe i buduća podešavanja.
- [Ugrađeni demo ispit](demo-exam.md). Šta je, kako ga ukloniti ili zameniti.

## Provera za prvo pokretanje

1. Izvuci bootstrap lozinku iz log-a kontejnera: `docker compose logs app | grep -A2 'admin account bootstrapped'`.
2. Loguj se. Promeni svoju lozinku sa ekrana za izmenu korisnika.
3. Kreiraj bar jedan predmet na `/subjects`.
4. Dodeli asistente predmetu klikom na **Asistenti** dugme. Asistenti bez dodele vide praznu `/manage` stranicu.
5. Uvezi studente preko CSV-a na `/admin/users` dugmetom **Uvezi CSV**.

## Šta admin može a asistent ne može

| Akcija | Admin | Asistent |
|---|---|---|
| Kreira, menja, briše korisnike | da | ne |
| Resetuje bilo čiju lozinku | da | ne |
| Kreira, menja, briše predmete | da | ne |
| Dodeljuje asistente predmetima | da | ne |
| Menja globalna podešavanja | da | ne |
| Upravlja ispitima na predmetu | da | samo dodeljeni |
| Upravlja bankom pitanja predmeta | da | samo dodeljeni |

Ove provere se izvršavaju na serveru, ne samo u UI-ju. Vidi [`../architecture/authz.md`](../architecture/authz.md).
