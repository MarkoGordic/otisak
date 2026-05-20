# Upravljanje korisnicima

Ekran: `/admin/users`. Samo za admina.

## Uloge

| Uloga | Šta |
|---|---|
| `student` | Polaže ispite. |
| `assistant` | Upravlja ispitima na dodeljenim predmetima. Vidi [`subjects.md`](subjects.md). |
| `admin` | Pun pristup. |

Ulogu menjaš iz padajućeg menija na redu.

## Dodavanje jednog korisnika

**Dodaj korisnika** otvara obrazac: email, lozinka, ime, broj indeksa, uloga. Email i lozinka su obavezni. Poziva `POST /api/auth/register`. Bcrypt 12 rundi.

## Masovni uvoz studenata iz CSV-a

**Uvezi CSV** bira fajl. Bez zaglavlja, četiri kolone:

```
id,ime,prezime,indeks
1,Marko,Petrović,ra1-2025
```

Po redu:

1. Indeks se prevodi u mala slova; razmaci se uklanjaju.
2. Email = `<prezime>.<smer><N>.<godina>@example.edu` ako se indeks poklapa sa `xxNNN-YYYY`. Inače `<indeks>@example.edu`.
3. Postojeći korisnici (poznati po indeksu ili email-u) se preskaču; ništa se ne prepisuje.
4. Podrazumevana lozinka: `changeme`. Bcrypt 10 rundi.

Radi u grupama od 25 redova. Na kraju vidiš sažetak: koliko je napravljeno, koliko preskočeno i razloge.

## Izmena

Ikonica olovke otvara izmenu. Menja se ime, email, indeks, uloga, `is_active`.

Email se proverava na duplikate. Ako postoji, server vraća `409` i prikazuje poruku `users.emailExists`.

`is_active = false` blokira prijavu, a podaci se čuvaju.

## Resetovanje lozinke

Ikonica ključa. Najmanje 6 karaktera. Bcrypt 10 rundi. Novu lozinku saopšti korisniku van aplikacije.

## Pretraga i filter

- Polje za pretragu: poklapa po imenu, email-u, indeksu (bez razlike u veličini slova).
- Padajući meni za ulogu: sužava na jednu ulogu.
- Stranica drži po 50 redova.

## API

| Putanja | Telo / Upotreba |
|---|---|
| `GET /api/admin/users` | Lista. Heševi lozinki su uklonjeni. |
| `PATCH /api/admin/users` | `{ id, name?, email?, role?, index_number?, is_active? }` |
| `PATCH /api/admin/users/password` | `{ id, password }` |
| `POST /api/admin/users/import-csv` | `{ csv: "..." }` |
