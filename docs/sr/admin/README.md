# Uputstvo za administratora

Administrator je najviša uloga. Admin može sve: korisnici, predmeti, svi ispiti, sva pitanja, globalna podešavanja. Prvi admin se pravi automatski pri prvom pokretanju (vidi [`../architecture/bootstrap.md`](../architecture/bootstrap.md)).

## Stranice

- [Upravljanje korisnicima](users.md). Pravljenje, izmena, promena uloge, resetovanje lozinke, masovni uvoz iz CSV-a.
- [Predmeti i dodela asistenata](subjects.md). Pravljenje predmeta. Dodela asistenata da vode ispite na predmetu.
- [Globalna podešavanja](settings.md). Prekidač za režim vežbe i buduća podešavanja.
- [Ugrađeni demo ispit](demo-exam.md). Šta je, kako se uklanja ili zamenjuje.

## Provera za prvo pokretanje

1. Izvuci bootstrap lozinku iz zapisa kontejnera: `docker compose logs app | grep -A2 'admin account bootstrapped'`.
2. Prijavi se. Promeni svoju lozinku sa ekrana za izmenu korisnika.
3. Napravi bar jedan predmet na `/subjects`.
4. Dodeli asistente predmetu klikom na dugme **Asistenti**. Asistenti bez dodele vide praznu `/manage` stranicu.
5. Uvezi studente preko CSV-a na `/admin/users` dugmetom **Uvezi CSV**.

## Šta admin može a asistent ne može

| Akcija | Admin | Asistent |
|---|---|---|
| Pravi, menja, briše korisnike | da | ne |
| Resetuje bilo čiju lozinku | da | ne |
| Pravi, menja, briše predmete | da | ne |
| Dodeljuje asistente predmetima | da | ne |
| Menja globalna podešavanja | da | ne |
| Upravlja ispitima na predmetu | da | samo dodeljeni |
| Upravlja bankom pitanja predmeta | da | samo dodeljeni |

Ove provere se izvršavaju na serveru, ne samo u korisničkom interfejsu. Vidi [`../architecture/authz.md`](../architecture/authz.md).
