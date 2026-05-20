# Pravljenje ispita

Uvoziš iz JSON-a? Pređi na [Uvoz iz JSON-a](#uvoz-iz-json-a).

## Pravljenje

`/manage`, **Nov ispit**. Polja:

- **Naslov**. Studenti ga vide.
- **Predmet**. Obavezno. Padajući meni pokazuje tvoje dodeljene predmete. Admin vidi sve.
- **Trajanje**. U minutima. Podrazumevano 60.
- **Režim**. `real` ili `practice`. Vežba podrazumeva `self_service = true` i `is_public = true`. Pravi ispit ima oba isključena.

Čuva se kao `draft`.

## Panel sa podešavanjima

`/manage/:id/edit` otvara uređivač. Podešavanja su pri vrhu.

| Podešavanje | Efekat |
|---|---|
| Naslov | Može da se menja dok ispit nije aktivan. |
| Opis | Prikazuje se na ekranu za pristup. |
| Trajanje (min) | Dužina trajanja. |
| Prag prolaza (%) | Označava prolaz ili pad. Ne sprečava predaju. |
| Režim | `real` ili `practice`. Promena obrće i `self_service` i `is_public` tako da se slažu. |
| Pregled odgovora | Studenti vide tačne odgovore na ekranu rezultata posle zatvaranja ispita. |
| Promešaj pitanja | Nasumičan redosled po pokušaju. Seme je stabilno, pa osvežavanje ne meša ponovo. |
| Promešaj odgovore | Nasumičan redosled opcija unutar pitanja. Isto seme. |
| Parcijalno ocenjivanje | Pitanja sa više tačnih odgovora dobijaju srazmeran broj poena umesto sve-ili-ništa. |
| Negativni poeni | Vidi ispod. |

**Sačuvaj podešavanja** zapisuje promenu.

### Negativni poeni

Podrazumevano isključeno. Kad je uključeno, posle `negative_points_threshold` pogrešnih odgovora svaki sledeći pogrešan oduzima `negative_points_value`. Ukupno nikad ne pada ispod nule.

Primer: prag 1, vrednost 0.5. Prvi pogrešan je besplatan. Svaki sledeći košta 0.5.

## Tipovi pitanja

Sedam tipova. Prva tri se najčešće koriste:

| Tip | Upotreba |
|---|---|
| `text` | Više ponuđenih odgovora. Uključi `multi_answer` za polja za štikliranje. |
| `code` | Više ponuđenih odgovora uz isečak koda sa istaknutom sintaksom. Bira se jezik. |
| `image` | Više ponuđenih odgovora uz sliku (fajl ili URL). |
| `open_text` | Slobodan tekst. AI ocenjuje ako napišeš uputstvo za ocenjivanje; inače ručno. |
| `ordering` | Student prevlači stavke u tačan redosled. |
| `matching` | Spajanje stavki sa leve i desne strane. |
| `fill_blank` | Tekst pitanja sa mestima `{{1}}`, `{{2}}`. Student upisuje svako. |

Poslednja tri rade, ali im je uređivač grublji. Probaj putanju kroz pokušaj pre nego što ga daš studentima.

### `multi_answer` je merodavan

Polje `multi_answer` na pitanju određuje radio prekidače ili polja za štikliranje. Ne izvodi se iz "koliko ih je tačno". Uključi ga za polja za štikliranje. Ako je isključen, a označiš više tačnih odgovora, prikazuju se radio prekidači i student može da izabere samo jedan.

## Pitanja na ispitu ili iz banke

**Na ispitu (podrazumevano)**. Pitanja žive uz sam ispit. Lista u `/manage/:id/edit` je ono što studenti vide. Koristi se za male ispite (manje od oko 30 pitanja), za predloške koji se ponovo koriste i za punu kontrolu.

**Iz banke**. Postavi `uses_question_bank = true`. Dodaj pravila po oznakama: svako kaže "izvuci N pitanja sa oznakom `<oznaka>` vrednih M poena". Bazen se ponovo izvlači za svaki pokušaj. Koristi se za velike banke po temi i različite uzorke po studentu.

## Uvoz iz JSON-a

`/manage`, **Uvezi JSON**. Isti oblik kao putanja za izvoz.

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
    "subject_name": "poklapanje bez razlike u veličini slova"
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

Ako si asistent a poklopljeni predmet nije tvoj, server vraća `403`.

`multi_answer` se čuva pri izvozu pa ponovnom uvozu ako je naveden. Stariji predlošci bez njega koriste pravilo "više tačnih znači multi-answer".

## Promene životnog ciklusa

Iz reda u `/manage`:

- **Aktiviraj**. `draft` ili `scheduled` u `active`. Studenti mogu da pristupe. Vreme kreće tek kad u sobi klikneš **Pokreni tajmer**.
- **Završi**. `active` u `completed`. Konačno. Ne može da se vrati.
- **Arhiviraj**. Sklanja sa glavne liste.

Kad je status `completed`, rezultati postaju vidljivi studentima ako je `allow_review` uključen.
