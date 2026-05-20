# Predmeti i dodela asistenata

Ekran: `/subjects`. Predmeti grupišu ispite i pitanja iz banke. Svaki ispit i svako pitanje iz banke pripada jednom predmetu. Asistenti su scope-ovani po predmetu.

## Kreiranje

**Dodaj predmet**. Polja: naziv (obavezno), kod (kratki id na karticama ispita), opis.

## Izmena i brisanje

- Olovka: inline izmena.
- Kanta: brisanje. Kaskadno: svi ispiti i pitanja iz banke se takođe brišu. Samo admin.

## Asistenti

**Asistenti** dugme (samo admin) otvara panel za dodele.

- Gornji deo: trenutne dodele. **Ukloni** uklanja.
- Donji deo: pretražljiv picker. **Dodeli** dodaje. Pojavljuju se samo korisnici sa ulogom `assistant` ili `admin`.

Svaki klik gađa server odmah. Bez dugmeta za snimanje.

## Šta dodela otključava

Dodeljeni asistenti, za taj predmet, mogu:

- Da vide i listaju ispite.
- Da kreiraju, menjaju, brišu, aktiviraju, završavaju ispite.
- Da dodaju i brišu inline i bank pitanja.
- Da vode sobu: lockdown, tajmer, finish-all, odobravanje zahteva za naknadan ulazak.

Ne mogu da premeste ispit na predmet na koji nisu dodeljeni (`403`). Nedodeljeni predmeti se ne pojavljuju u njihovom `/manage`.

## API

| Endpoint | Body / Upotreba |
|---|---|
| `GET /api/admin/subjects/:subjectId/assignments` | Lista. |
| `POST /api/admin/subjects/:subjectId/assignments` | `{ user_id, role? }`. Default `assistant`. |
| `DELETE /api/admin/subjects/:subjectId/assignments/:userId` | Uklanja. |
