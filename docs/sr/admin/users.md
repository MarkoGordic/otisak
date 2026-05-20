# Upravljanje korisnicima

Ekran: `/admin/users`. Samo za admina.

## Uloge

| Uloga | Šta |
|---|---|
| `student` | Polaže ispite. |
| `assistant` | Upravlja ispitima na dodeljenim predmetima. Vidi [`subjects.md`](subjects.md). |
| `admin` | Pun pristup. |

Ulogu menjaš iz dropdown-a na redu.

## Dodavanje jednog korisnika

**Dodaj korisnika** otvara formu: email, lozinka, ime, broj indeksa, uloga. Email i lozinka su obavezni. Poziva `POST /api/auth/register`. Bcrypt 12 rundi.

## CSV bulk import

**Uvezi CSV** bira fajl. Bez header-a, četiri kolone:

```
id,ime,prezime,indeks
1,Marko,Petrović,ra1-2025
```

Po redu:

1. Indeks u mala slova, belina uklonjena.
2. Email = `<prezime>.<smer><N>.<godina>@example.edu` ako indeks matchuje `xxNNN-YYYY`, inače `<indeks>@example.edu`.
3. Postojeći korisnici (po indeksu ili email-u) se preskaču, ne prepisuju.
4. Default lozinka: `changeme`. Bcrypt 10 rundi.

Radi u grupama od 25. Sažetak na kraju: koliko kreirano, koliko preskočeno, razlozi.

## Izmena

Ikonica olovke. Modal menja ime, email, indeks, ulogu, `is_active`.

Email se proverava na duplikate. Duplikat: `409` + toast `users.emailExists`.

`is_active = false` blokira login ali čuva podatke.

## Reset lozinke

Ikonica ključa. Minimum 6 karaktera. Bcrypt 10 rundi. Reci korisniku van aplikacije.

## Pretraga i filter

- Pretraga: matchuje ime, email, indeks (case-insensitive).
- Dropdown za ulogu: filtrira na jednu.
- Paginacija: 50 po strani.

## API

| Endpoint | Body / Upotreba |
|---|---|
| `GET /api/admin/users` | Lista. Heševi uklonjeni. |
| `PATCH /api/admin/users` | `{ id, name?, email?, role?, index_number?, is_active? }` |
| `PATCH /api/admin/users/password` | `{ id, password }` |
| `POST /api/admin/users/import-csv` | `{ csv: "..." }` |
