# Predmeti i dodela asistenata

Ekran: `/subjects`. Predmeti grupišu ispite i pitanja iz banke. Svaki ispit i svako pitanje iz banke pripada jednom predmetu. Asistentima se prava daju po predmetu.

## Pravljenje

**Dodaj predmet**. Polja: naziv (obavezno), oznaka (kratki identifikator na karticama ispita), opis.

## Izmena i brisanje

- Olovka: izmena u istom redu.
- Kanta: brisanje. Lančano se brišu i svi ispiti i pitanja iz banke za taj predmet. Samo za admina.

## Asistenti

Dugme **Asistenti** (samo za admina) otvara panel za dodele.

- Gornji deo: trenutne dodele. **Ukloni** ih briše.
- Donji deo: pretraživa lista. **Dodeli** ih dodaje. Prikazuju se samo korisnici sa ulogom `assistant` ili `admin`.

Svaki klik se odmah šalje serveru. Bez dugmeta za snimanje.

## Šta dodela otključava

Dodeljeni asistenti, za taj predmet, mogu:

- Da vide i listaju ispite.
- Da prave, menjaju, brišu, aktiviraju i završavaju ispite.
- Da dodaju i brišu pitanja (i ona iz banke i ona direktno na ispitu).
- Da vode sobu: zabranu rada, podešavanje vremena, završetak za sve, odobravanje zahteva za naknadan ulazak.

Ne mogu da prebace ispit na predmet na koji nisu dodeljeni (server vraća `403`). Predmeti bez dodele se ne pojavljuju u njihovom `/manage`.

## API

| Putanja | Telo / Upotreba |
|---|---|
| `GET /api/admin/subjects/:subjectId/assignments` | Lista. |
| `POST /api/admin/subjects/:subjectId/assignments` | `{ user_id, role? }`. Podrazumevano `assistant`. |
| `DELETE /api/admin/subjects/:subjectId/assignments/:userId` | Briše dodelu. |
