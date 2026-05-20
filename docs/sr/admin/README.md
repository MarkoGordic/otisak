# Uputstvo za administratora

Administrator je uloga sa najvišim privilegijama. Admin može sve: upravljanje korisnicima, predmetima, svim ispitima i globalnim podešavanjima. Prvi administrator se automatski kreira pri prvom pokretanju (vidi [`architecture/bootstrap.md`](../architecture/bootstrap.md)).

## Zadaci

- [Upravljanje korisnicima](users.md) — kreiranje, izmena, promena uloge, resetovanje lozinke, bulk-import preko CSV-a.
- [Predmeti i dodela asistenata](subjects.md) — kreiranje predmeta i dodela asistenata kako bi mogli da upravljaju ispitima na tom predmetu.
- [Globalna podešavanja](settings.md) — toggle za režim vežbe, buduća podešavanja.
- [Ugrađeni demo ispit](demo-exam.md) — šta je, kako ga ukloniti ili zameniti.

## Šta uraditi nakon prvog pokretanja

1. Izvuci bootstrap admin lozinku iz log-a kontejnera (`docker compose logs app | grep -A2 'admin account bootstrapped'`).
2. Loguj se i **promeni svoju lozinku** sa ekrana za izmenu korisnika.
3. Kreiraj bar jedan predmet (`/subjects`).
4. Dodeli asistente tom predmetu (dugme `Asistenti` na predmetu). Asistenti bez dodeljenog predmeta ne vide ništa na `/manage` stranici.
5. Kreiraj prave korisnike preko CSV import-a (`/admin/users` → `Uvezi CSV`).

## Šta admin može a asistent ne može

| Akcija | Admin | Asistent |
|---|---|---|
| Kreira / menja / briše korisnike | ✅ | ❌ |
| Resetuje bilo čiju lozinku | ✅ | ❌ |
| Kreira / menja / briše predmete | ✅ | ❌ |
| Dodeljuje asistente predmetima | ✅ | ❌ |
| Menja globalna podešavanja | ✅ | ❌ |
| Upravlja ispitima na predmetu | ✅ | samo dodeljeni |
| Upravlja bankom pitanja predmeta | ✅ | samo dodeljeni |

Sve ove provere se sprovode na nivou rute, ne samo u UI-ju — vidi [`architecture/authz.md`](../architecture/authz.md).
