# Konverzija pitanja pomoću AI

Ova stranica je napisana tako da je **predaš AI asistentu** (ChatGPT, Claude, Gemini) zajedno sa svojim pitanjima, a on ti vrati fajl spreman za **Uvezi ispit**.

## Kako se koristi

1. Kopiraj celu ovu stranicu (od naslova do kraja) u novi razgovor sa AI asistentom.
2. Ispod nje prilepi ili zakači svoja pitanja (Word, PDF, tekst, slika ispita, bilo šta) i napiši: *"Pretvori ova pitanja u OTISAK JSON po uputstvu iznad. Naslov ispita: ..., trajanje: ... minuta."*
3. Sačuvaj odgovor kao fajl `exam.json`.
4. **Ako ispit ima slike:** AI je posle JSON-a naveo spisak **Slike** (npr. `slike/01.png`: šema mreže, pitanje 4). Napravi folder, u njega stavi `exam.json` i podfolder `slike` sa slikama nazvanim tačno tako (`01.png`, `02.png`, ...), pa folder spakuj u ZIP (desni klik, **Compress** na Mac-u ili **Send to > Compressed folder** na Windows-u). Slike mogu da budu bilo koje veličine, aplikacija ih sama smanji. Ekstenzija ne mora da se poklapa: `01.jpg` umesto `01.png` je u redu.
5. Na `/manage` (ili `/practice` za vežbu) klikni **Uvezi ispit**, izaberi predmet i fajl (`exam.json`, ili ZIP ako ima slika).
6. Posle uvoza otvori ispit i **proveri broj pitanja i bodove**. Ispit se uvek uvozi kao nacrt, pa ništa nije vidljivo studentima dok ga ne aktiviraš.

Ako neka slika fali u ZIP-u, uvoz se odbija i kaže koja. Ako uvezeš samo `exam.json` bez slika, uvoz prolazi, a slike posle otpremiš u editoru ispita dugmetom **Otpremi sliku**.

Sve ispod ove linije je uputstvo za AI.

---

## Uputstvo za AI

Ti pretvaraš ispitna pitanja u JSON fajl za aplikaciju OTISAK. Fajl se uvozi automatski, bez ljudske provere svakog polja, pa **svako pravilo ispod mora da se poštuje tačno**. Greška u formatu ne daje poruku o grešci: pitanje se tiho preskoči, nosi 0 bodova, ili se prikaže pogrešno.

### Šta vraćaš

- **Jedan** JSON objekat, u jednom ` ```json ` bloku. Ništa pre ni posle bloka, osim liste **Slike** (vidi [Slike](#slike)) i liste **Za proveru** (vidi [Pitanja na koja nisi siguran](#pitanja-na-koja-nisi-siguran)), ako su potrebne.
- Ako možeš da praviš fajlove (imaš izvršavanje koda), a slike su ti dostupne kao fajlovi (npr. u priloženom Word dokumentu, folder `word/media`), možeš odmah da vratiš gotov ZIP: `exam.json` u korenu i slike u `slike/`, sa imenima kao u `content`. U suprotnom vrati samo JSON.
- Ispravan JSON: dvostruki navodnici, bez komentara, bez zareza posle poslednjeg elementa, UTF-8.
- Zadrži srpska slova (č, ć, ž, š, đ) i pismo izvornika. Ne prevodi i ne prepravljaj tekst pitanja i odgovora, osim očiglednih slovnih grešaka.
- Ne izmišljaj pitanja, odgovore ni tačne odgovore. Ako izvornik ne kaže koji je odgovor tačan, pitaj umesto da pogađaš.

### Omotač

```json
{
  "version": 1,
  "exam": {
    "title": "Kolokvijum 1",
    "description": null,
    "duration_minutes": 60,
    "pass_threshold": 50,
    "has_pass_threshold": true,
    "allow_review": false,
    "shuffle_questions": false,
    "shuffle_answers": false,
    "partial_scoring": false,
    "negative_points_enabled": false,
    "negative_points_value": 0,
    "negative_points_threshold": 0
  },
  "questions": []
}
```

- `exam.title` je **obavezan** i ne sme da bude prazan. Ako ga korisnik nije dao, uzmi ga iz izvornika ili pitaj.
- Ostala polja u `exam` postavi samo ako ih korisnik traži, inače ostavi vrednosti iz primera.
- `partial_scoring: true` daje srazmerne bodove na pitanjima sa više tačnih odgovora. Postavi ga samo ako korisnik to kaže.
- **Ne dodaji** `subject_id`, `subject_name`, `exam_mode`, `status` ni `tags`. Predmet i vrstu ispita bira korisnik u aplikaciji.

### Polja svakog pitanja

| Polje | Obavezno | Pravilo |
|---|---|---|
| `type` | da | Tačno jedno od: `text`, `code`, `image`, `open_text`, `ordering`, `matching`, `fill_blank`. Bilo šta drugo obara ceo uvoz. |
| `text` | da | Tekst pitanja. Do 8000 znakova. Vidi [Pravila za tekst](#pravila-za-tekst). |
| `points` | da | Broj bodova, ceo broj veći od 0. **Ako izostane, pitanje nosi 0 bodova.** Ako izvornik ne navodi bodove, stavi `1`. |
| `multi_answer` | za `text`, `code`, `image` | `false` = jedan tačan (radio dugmad), `true` = više tačnih (polja za štikliranje). Uvek ga piši eksplicitno. Kod ostalih tipova izostavi ga. |
| `answers` | da | Niz ponuđenih odgovora. Kod `open_text`, `ordering`, `matching`, `fill_blank` je **prazan niz** `[]`. |
| `content` | zavisi od tipa | String. Do 16000 znakova. Vidi tipove ispod. |
| `explanation` | ne | Objašnjenje tačnog odgovora, vidljivo studentu na pregledu posle ispita. Do 4000 znakova. Samo ako ga izvornik ima. |
| `ai_grading_instructions` | samo `open_text` | Kriterijum ocenjivanja. Do 4000 znakova. |

Svaki element `answers` izgleda ovako:

```json
{ "text": "Tekst odgovora", "is_correct": true }
```

`is_correct` je `true` ili `false`, nikad izostavljen. Redosled u nizu je redosled prikaza. `position` nije potreban.

### Pravila za tekst

Tekst pitanja (`text`) i odgovora (`answers[].text`) prikazuje se kao **običan tekst**:

- **Nema Markdowna ni HTML-a.** `**podebljano**`, `` `kod` ``, `<b>`, `$x^2$` se prikazuju doslovno, sa svim znakovima. Ne koristi ih.
- **Prelom reda se ne vidi.** Ceo `text` se prikazuje kao jedan pasus. Ne oslanjaj se na `\n` za raspored.
- Kratak izraz ili ime funkcije u tekstu je u redu kao običan tekst: `Šta vraća funkcija len za prazan niz?`
- **Kod od više redova nikad ne ide u `text` ni u odgovor.** Ide u `content` pitanja tipa `code`.
- Ne dodaji napomene tipa "(više tačnih odgovora)", "(zaokružite jedan)" ni "Označite sve tačne". Aplikacija sama prikazuje uputstvo na osnovu `multi_answer`.
- Ne numeriši pitanja ("1.", "Pitanje 3:") i ne stavljaj slova ispred odgovora ("a)", "B."). Aplikacija to radi sama.
- Ne stavljaj bodove u tekst ("(2 boda)"). Bodovi idu u `points`.

### Tip pitanja: kako da izabereš

| U izvorniku je... | `type` | `multi_answer` |
|---|---|---|
| Pitanje sa ponuđenim odgovorima, tačno jedan tačan | `text` | `false` |
| Pitanje sa ponuđenim odgovorima, više tačnih | `text` | `true` |
| Isto, ali uz pitanje stoji kod od više redova | `code` | `false` ili `true` |
| Isto, ali uz pitanje stoji slika, dijagram, šema | `image` | `false` ili `true` |
| Pitanje bez ponuđenih odgovora, student piše odgovor | `open_text` | izostavi |
| Poređaj stavke u ispravan redosled | `ordering` | izostavi |
| Poveži pojmove iz dve kolone | `matching` | izostavi |
| Rečenica sa prazninama koje student popunjava | `fill_blank` | izostavi |

Jedno pitanje ima **najviše jedan** blok koda **ili** jednu sliku, nikad oba. Pitanje "tačno/netačno" je `text` sa dva odgovora, `Tačno` i `Netačno`, i `multi_answer: false`.

### text: jedan tačan odgovor

```json
{
  "type": "text",
  "text": "Koji sloj OSI modela je zadužen za rutiranje?",
  "points": 1,
  "multi_answer": false,
  "answers": [
    { "text": "Mrežni", "is_correct": true },
    { "text": "Transportni", "is_correct": false },
    { "text": "Sloj veze", "is_correct": false },
    { "text": "Fizički", "is_correct": false }
  ]
}
```

Tačno **jedan** odgovor ima `is_correct: true`.

### text: više tačnih odgovora

```json
{
  "type": "text",
  "text": "Koji od navedenih protokola rade na transportnom sloju?",
  "points": 2,
  "multi_answer": true,
  "answers": [
    { "text": "TCP", "is_correct": true },
    { "text": "UDP", "is_correct": true },
    { "text": "IP", "is_correct": false },
    { "text": "HTTP", "is_correct": false }
  ]
}
```

Bar **dva** odgovora imaju `is_correct: true`. Ako student štiklira bilo koji netačan, dobija 0 bodova.

### code: pitanje sa blokom koda

Kod ide u `content`, **ne** u `text`. `content` je **string koji i sam sadrži JSON** sa dva ključa:

- `snippet`: ceo kod, sa prelomima reda i uvlačenjem tačno kao u izvorniku.
- `language`: jezik za bojenje sintakse. Dozvoljene vrednosti: `python`, `javascript`, `typescript`, `java`, `c`, `cpp`, `csharp`, `sql`, `bash`, `json`, `xml`, `css`, `php`, `go`, `rust`, `kotlin`, `ruby`, `x86asm`, `plaintext`. Za HTML koristi `xml`. Za pseudokod ili nepoznat jezik koristi `plaintext`.

Pošto je `content` JSON upisan u string unutar JSON-a, escapovanje se radi **dvaput**. Najsigurnije: napravi objekat `{"snippet": ..., "language": ...}`, serijalizuj ga u string, i taj string upiši kao vrednost `content`. Nemoj ručno da kucaš kosu crtu po kosu crtu.

Primer, Python sa prelomom reda:

```json
{
  "type": "code",
  "text": "Šta ispisuje sledeći kod?",
  "points": 2,
  "multi_answer": false,
  "content": "{\"snippet\": \"for i in range(3):\\n    print(i)\", \"language\": \"python\"}",
  "answers": [
    { "text": "0 1 2", "is_correct": true },
    { "text": "1 2 3", "is_correct": false },
    { "text": "0 1 2 3", "is_correct": false }
  ]
}
```

Primer, C sa navodnicima i `\n` unutar samog koda (kod u izvorniku glasi `printf("%d\n", x * 2);`):

```json
{
  "type": "code",
  "text": "Šta ispisuje sledeći kod?",
  "points": 2,
  "multi_answer": false,
  "content": "{\"snippet\": \"int x = 5;\\nprintf(\\\"%d\\\\n\\\", x * 2);\", \"language\": \"c\"}",
  "answers": [
    { "text": "10", "is_correct": true },
    { "text": "5", "is_correct": false },
    { "text": "x * 2", "is_correct": false }
  ]
}
```

Pravila escapovanja, od koda do `content`:

| U kodu | U `content` stringu |
|---|---|
| prelom reda | `\\n` |
| tab | `\\t` (ili zameni sa 4 razmaka) |
| `"` | `\\\"` |
| `\` (npr. `\n` u C stringu) | `\\\\` |

Odgovori kod `code` pitanja su kratki, u jednom redu, i bez Markdowna. Ako su ponuđeni odgovori sami po sebi blokovi koda od više redova, to pitanje ne može verno da se prenese: stavi ga u listu [nesigurnih](#pitanja-na-koja-nisi-siguran).

### image: pitanje sa slikom

`content` je putanja do slike, običan string (ne JSON).

```json
{
  "type": "image",
  "text": "Koja topologija mreže je prikazana na slici?",
  "points": 1,
  "multi_answer": false,
  "content": "slike/01.png",
  "answers": [
    { "text": "Zvezda", "is_correct": true },
    { "text": "Prsten", "is_correct": false },
    { "text": "Magistrala", "is_correct": false }
  ]
}
```

#### Slike

- Slike numeriši redom pojavljivanja i piši ih kao `slike/01.png`, `slike/02.png`, ... Nastavnik će slike sačuvati pod tim imenima i spakovati ih zajedno sa JSON-om u ZIP.
- Posle JSON bloka dodaj listu pod naslovom **Slike**: za svaku putanju redni broj pitanja i kratak opis slike, tako da nastavnik zna koju sliku da sačuva pod kojim imenom. Na primer: "`slike/01.png`: pitanje 4, šema mreže sa pet računara povezanih na svič".
- Ista slika u više pitanja dobija istu putanju.
- Ako izvornik daje adresu slike (`https://...`), upiši tu adresu umesto putanje i ne stavljaj je na listu.
- **Nikad ne pravi `data:` adresu** i ne kucaj base64 sam: takva slika je skoro uvek neispravna.
- Ako se slika sastoji samo od koda (snimak ekrana koda), prepiši kod i napravi `code` pitanje umesto `image`.

### open_text: slobodan odgovor

```json
{
  "type": "open_text",
  "text": "Objasni razliku između procesa i niti.",
  "points": 3,
  "ai_grading_instructions": "3 boda: pominje da niti dele memoriju procesa i da proces ima sopstveni adresni prostor. 2 boda: tačno objašnjava samo jedno od toga. 0 bodova: ništa od navedenog.",
  "answers": []
}
```

- `answers` je **uvek** `[]`.
- `ai_grading_instructions` napiši ako izvornik ima rešenje ili kriterijum: šta odgovor mora da sadrži i koliko bodova nosi koji deo. Bez njega pitanje ocenjuje nastavnik ručno, pa ga tada izostavi.

### ordering: redosled

`content` je JSON u stringu sa ključem `items`. **Niz `items` je tačan redosled.** Aplikacija ga sama meša studentu.

```json
{
  "type": "ordering",
  "text": "Poređaj slojeve TCP/IP modela od najnižeg ka najvišem.",
  "points": 2,
  "content": "{\"items\": [\"Pristup mreži\", \"Internet\", \"Transportni\", \"Aplikativni\"]}",
  "answers": []
}
```

Bodovanje je sve ili ništa.

### matching: povezivanje

`content` je JSON u stringu sa dva niza iste dužine, `left` i `right`. **`left[i]` se spaja sa `right[i]`.**

```json
{
  "type": "matching",
  "text": "Poveži komponentu sa njenom ulogom.",
  "points": 2,
  "content": "{\"left\": [\"CPU\", \"RAM\", \"SSD\"], \"right\": [\"Obrada instrukcija\", \"Radna memorija\", \"Trajno skladištenje\"]}",
  "answers": []
}
```

Bodovanje je sve ili ništa. Svaka stavka u `right` mora da bude različita.

### fill_blank: popunjavanje praznina

U `text` se svaka praznina piše kao `___ID___` (tri donje crte, oznaka, tri donje crte). `content` je JSON u stringu sa nizom `blanks`, gde svaka praznina ima `id` i tačan odgovor `correct`.

```json
{
  "type": "fill_blank",
  "text": "Binarna pretraga ima složenost ___A___ i radi samo nad ___B___ nizom.",
  "points": 2,
  "content": "{\"blanks\": [{\"id\": \"A\", \"correct\": \"O(log n)\"}, {\"id\": \"B\", \"correct\": \"sortiranim\"}]}",
  "answers": []
}
```

- Oznake su **velika slova**, cifre i donja crta (`A`, `B`, `P1`). Mala slova se ne prepoznaju: student ne dobija polje za unos i pitanje nosi 0 bodova.
- Svaki `id` iz `blanks` mora da se pojavi u `text` tačno jednom, i obrnuto.
- Provera ignoriše velika i mala slova i razmake na krajevima, ali je inače doslovna. `correct` mora da bude tačno ono što bi student napisao, u očekivanom padežu. Ako izvornik dozvoljava više oblika odgovora, izaberi najverovatniji i stavi pitanje u listu nesigurnih.
- Bodovanje je sve ili ništa.

### Pitanja na koja nisi siguran

Posle JSON bloka, samo ako je potrebno, dodaj kratku listu pod naslovom **Za proveru**, sa rednim brojem pitanja i razlogom. Na primer:

- izvornik ne označava tačan odgovor (tada pitanje **ne ubacuj** u JSON, samo ga navedi ovde),
- odgovor je blok koda od više redova,
- `fill_blank` prihvata više oblika odgovora,
- bodovi nisu navedeni pa je stavljeno `1`.

Ako nema ničeg za proveru, ne piši ništa posle JSON bloka.

### Provera pre nego što vratiš odgovor

Prođi kroz svako pitanje i proveri:

1. `type` je jedan od sedam dozvoljenih, malim slovima.
2. `text` nije prazan, nema Markdown, nema numeraciju, nema bodove.
3. `points` postoji i veći je od 0.
4. Kod `text`, `code`, `image`: `multi_answer` postoji; sa `false` tačno jedan `is_correct: true`, sa `true` bar dva; bar dva ponuđena odgovora ukupno.
5. Kod `code`: `content` je string koji se parsira u objekat sa `snippet` i `language`; `language` je sa spiska.
6. Kod `image`: `content` je `https://` adresa ili putanja `slike/NN.png`, i svaka putanja je na listi **Slike**.
7. Kod `open_text`, `ordering`, `matching`, `fill_blank`: `answers` je `[]`.
8. Kod `ordering`, `matching`, `fill_blank`: `content` je string koji se parsira u objekat odgovarajućeg oblika.
9. Kod `fill_blank`: sve oznake su velika slova i poklapaju se sa `text`.
10. Ceo odgovor je jedan ispravan JSON objekat sa `exam.title` i nizom `questions`.

### Ceo primer

```json
{
  "version": 1,
  "exam": {
    "title": "Računarske mreže, kolokvijum 1",
    "duration_minutes": 45,
    "pass_threshold": 50,
    "has_pass_threshold": true,
    "shuffle_questions": true,
    "shuffle_answers": true,
    "partial_scoring": false
  },
  "questions": [
    {
      "type": "text",
      "text": "Koji sloj OSI modela je zadužen za rutiranje?",
      "points": 1,
      "multi_answer": false,
      "answers": [
        { "text": "Mrežni", "is_correct": true },
        { "text": "Transportni", "is_correct": false },
        { "text": "Sloj veze", "is_correct": false }
      ]
    },
    {
      "type": "text",
      "text": "Koji od navedenih protokola rade na transportnom sloju?",
      "points": 2,
      "multi_answer": true,
      "answers": [
        { "text": "TCP", "is_correct": true },
        { "text": "UDP", "is_correct": true },
        { "text": "IP", "is_correct": false }
      ]
    },
    {
      "type": "code",
      "text": "Šta ispisuje sledeći kod?",
      "points": 2,
      "multi_answer": false,
      "content": "{\"snippet\": \"for i in range(3):\\n    print(i)\", \"language\": \"python\"}",
      "answers": [
        { "text": "0 1 2", "is_correct": true },
        { "text": "1 2 3", "is_correct": false }
      ]
    },
    {
      "type": "image",
      "text": "Koja topologija mreže je prikazana na slici?",
      "points": 1,
      "multi_answer": false,
      "content": "slike/01.png",
      "answers": [
        { "text": "Zvezda", "is_correct": true },
        { "text": "Prsten", "is_correct": false }
      ]
    },
    {
      "type": "open_text",
      "text": "Objasni čemu služi DNS.",
      "points": 3,
      "ai_grading_instructions": "3 boda: navodi da DNS prevodi imena domena u IP adrese. 0 bodova: ne pominje prevođenje imena.",
      "answers": []
    }
  ]
}
```

**Slike**

- `slike/01.png`: pitanje 4, šema sa pet računara povezanih na centralni svič.
