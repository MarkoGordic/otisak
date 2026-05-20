# Pravljenje ispita

Importuješ iz JSON-a? Skoči na [JSON import](#json-import).

## Kreiranje

`/manage`, **Nov ispit**. Polja:

- **Naslov**. Studenti vide.
- **Predmet**. Obavezno. Dropdown pokazuje tvoje dodeljene predmete. Admin vidi sve.
- **Trajanje**. Minuti. Default 60.
- **Mod**. `real` ili `practice`. Practice default `self_service = true` i `is_public = true`. Real default oba off.

Čuva se kao `draft`.

## Panel podešavanja

`/manage/:id/edit` otvara editor. Podešavanja su pri vrhu.

| Podešavanje | Efekat |
|---|---|
| Naslov | Može da se menja dok ispit nije active. |
| Opis | Prikazuje se na ekranu za pristup. |
| Trajanje (min) | Dužina tajmera. |
| Prag prolaza (%) | Označava prolaz ili pad. Ne blokira predaju. |
| Mod | `real` ili `practice`. Promena okreće `self_service` i `is_public` da se slažu. |
| Pregled odgovora | Studenti vide tačne odgovore na ekranu rezultata posle zatvaranja ispita. |
| Promešaj pitanja | Nasumičan redosled po pokušaju. Seedovano da refresh ne meša ponovo. |
| Promešaj odgovore | Nasumičan redosled opcija unutar pitanja. Isti seed. |
| Parcijalno ocenjivanje | Multi-correct pitanja dobijaju proporcionalne poene umesto sve-ili-ništa. |
| Negativni poeni | Vidi ispod. |

**Sačuvaj podešavanja** čuva promenu.

### Negativni poeni

Off po default-u. Kad je on, posle `negative_points_threshold` pogrešnih odgovora svaki sledeći pogrešan oduzima `negative_points_value`. Ukupno nikad ne pada ispod nule.

Primer: threshold 1, vrednost 0.5. Prvi pogrešan je besplatan. Svaki sledeći košta 0.5.

## Tipovi pitanja

Sedam tipova. Prva tri su uobičajena:

| Tip | Upotreba |
|---|---|
| `text` | Multiple choice. Toggle `multi_answer` za checkbox-ove. |
| `code` | Multiple choice sa syntax-highlighted snippet-om. Bira se jezik. |
| `image` | Multiple choice sa slikom (fajl ili URL). |
| `open_text` | Slobodan tekst. AI-ocenjivanje ako napišeš instrukcije; inače ručno. |
| `ordering` | Student vuče stavke u tačan redosled. |
| `matching` | Spajanje stavki levo sa desno. |
| `fill_blank` | Tekst pitanja sa `{{1}}`, `{{2}}` placeholder-ima. Student kuca svaki. |

Poslednja tri rade ali im je editor grublji. Testiraj attempt flow pre nego što daš studentima.

### multi_answer je autoritativan

`multi_answer` flag na pitanju kontroliše radio vs checkbox. Ne izvodi se iz "koliko je tačnih". Uključi flag za checkbox. Off sa više tačnih odgovora prikazuje radio; student bira samo jedan.

## Inline vs bank-backed

**Inline (default)**. Pitanja žive na ispitu. Lista u `/manage/:id/edit` je ono što studenti vide. Za male ispite (< ~30 pitanja), reusable šablone, punu kontrolu.

**Bank-backed**. Postavi `uses_question_bank = true`. Dodaj tag pravila: svako kaže "izvuci N pitanja tagovanih `<tag>` vrednih M poena". Bazen se regeneriše po pokušaju. Za velike banke po temi i različite uzorke po studentu.

## JSON import

`/manage`, **Uvezi JSON**. Isti oblik kao export endpoint.

```json
{
  "version": 1,
  "exam": {
    "title": "string (obavezno)",
    "description": "string",
    "duration_minutes": 60,
    "pass_threshold": 50,
    "exam_mode": "real|practice",
    "allow_review": true,
    "shuffle_questions": true,
    "shuffle_answers": true,
    "partial_scoring": false,
    "negative_points_enabled": false,
    "negative_points_value": 0,
    "negative_points_threshold": 0,
    "subject_name": "matchuje case-insensitive"
  },
  "questions": [
    {
      "type": "text",
      "text": "Tekst pitanja",
      "points": 1,
      "position": 0,
      "multi_answer": false,
      "answers": [
        { "text": "A", "is_correct": true, "position": 0 },
        { "text": "B", "is_correct": false, "position": 1 }
      ]
    }
  ]
}
```

Ako si asistent i matchovani predmet nije tvoj, server vraća `403`.

`multi_answer` se čuva pri round-tripu ako je prisutan. Stariji fixture-i bez njega padaju na heuristiku "više tačnih znači multi-answer".

## Promene životnog ciklusa

Iz reda u `/manage`:

- **Aktiviraj**. `draft` ili `scheduled` u `active`. Studenti mogu da uđu. Tajmer kreće kad klikneš **Pokreni tajmer** u sobi.
- **Završi**. `active` u `completed`. Konačno. Ne može da se vrati.
- **Arhiviraj**. Sklanja sa glavne liste.

Kad je `completed`, rezultati postaju vidljivi studentima ako je `allow_review` uključen.
