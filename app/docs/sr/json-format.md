# JSON format ispita

Tačan oblik koji primaju **Uvezi ispit** i **Izvezi ispit**, kao JSON fajl ili kao ZIP sa slikama. Ovo je referenca: za sam postupak pogledaj [Upravljanje ispitima](exams.md) i [Vežbe](practice.md).

Uvoz JSON-a nije samo prečica. Pitanja tipa `ordering`, `matching` i `fill_blank` **ne mogu da se naprave u editoru ispita**, pa je za te tipove ovo jedini način da se napišu.

## Omotač

```json
{
  "version": 1,
  "exam": { },
  "questions": [ ]
}
```

| Ključ | Obavezan | Napomena |
|---|---|---|
| `version` | ne | Izvoz ga upisuje, uvoz ga nikad ne čita. Informativno. |
| `exam` | **da** | Objekat. Ako nedostaje, vraća `400`. |
| `questions` | **da** | Niz. Može da bude prazan, ali mora da postoji i mora da bude niz. |

## ZIP sa slikama

Umesto samog JSON fajla može da se uveze **ZIP**: JSON ispita i slike zajedno. Kod pitanja tipa `image`, `content` je tada **putanja do slike unutar ZIP-a**, relativno u odnosu na JSON fajl.

```
kolokvijum.zip
├── exam.json
└── slike/
    ├── 01.jpg
    └── 02.png
```

```json
{ "type": "image", "text": "Koja topologija je prikazana?", "points": 1, "multi_answer": false,
  "content": "slike/01.jpg",
  "answers": [ { "text": "Zvezda", "is_correct": true }, { "text": "Prsten", "is_correct": false } ] }
```

- JSON fajl može da se zove bilo kako ako je jedini u ZIP-u. Ako ih ima više, uvozi se onaj koji se zove `exam.json`.
- Sve može da bude i u jednom folderu (npr. `Kolokvijum/exam.json`, `Kolokvijum/slike/01.jpg`), što je ono što pravi **Compress** na macOS-u ili **Send to > Compressed folder** na Windows-u. `__MACOSX` i skriveni fajlovi se zanemaruju.
- Velika i mala slova u imenu slike se ne razlikuju (`01.JPG` i `01.jpg` su isti fajl).
- Slike mogu da budu bilo koje veličine do 25 MB po slici. Aplikacija ih sama smanji i kompresuje.
- **Ako i jedna slika fali ili je neispravna, uvoz se odbija pre nego što se išta napravi**, uz spisak imena koja ne valjaju.
- Ista slika može da se koristi u više pitanja i čuva se jednom.

**Izvezi ispit** pravi upravo ovakav ZIP čim ispit ima bar jednu otpremljenu sliku (slike idu u `images/`). Ispit bez slika se izvozi kao običan JSON.

## Šta fajl ne odlučuje

Dve stvari dolaze sa **stranice na kojoj uvoziš**, a ne iz fajla:

- **Predmet.** Bira se u formi za uvoz i obavezan je. Polje `subject_name` iz fajla se zanemaruje.
- **Pravi ispit ili vežba.** Uvoz na `/manage` pravi pravi ispit. Uvoz na `/practice` pravi vežbu. Polje `exam_mode` iz fajla se zanemaruje, a aplikacija te upozori kada ga nađe.

Uvezen ispit se uvek pravi kao **nacrt**, bez obzira na to koju si stranicu koristio.

## Polja u `exam`

Sva polja osim `title` su opciona.

| Polje | Tip | Podrazumevano | Napomena |
|---|---|---|---|
| `title` | string | | **Obavezno.** Skraćuju se razmaci. Ako nedostaje ili je prazno, uvoz pada. |
| `description` | string | `null` | Prikazuje se na ulaznom ekranu. |
| `duration_minutes` | broj | `60` | `0` ili neispravna vrednost postaje 60. |
| `pass_threshold` | broj | `50` | Procenat. `0` postaje 50. Koristi se samo kada je `has_pass_threshold` uključen. |
| `has_pass_threshold` | boolean | `true` | `false` prikazuje samo bodove, bez ocene položio ili pao. |
| `allow_review` | boolean | `false` | Studenti vide tačne odgovore nakon zatvaranja ispita. |
| `shuffle_questions` | boolean | `false` | Nasumičan redosled po pokušaju, stabilan pri osvežavanju stranice. |
| `shuffle_answers` | boolean | `false` | Nasumičan redosled ponuđenih odgovora unutar pitanja. |
| `partial_scoring` | boolean | `false` | Samo pitanja sa više tačnih odgovora. Vidi [Bodovanje](#bodovanje). |
| `negative_points_enabled` | boolean | `false` | |
| `negative_points_value` | broj | `0` | Mora da bude 0 ili više. |
| `negative_points_threshold` | broj | `0` | Broj netačnih odgovora koji prolaze bez oduzimanja bodova. |

Boolean vrednosti se tumače široko: `"true"` i `1` važe kao tačno, a `0`, `""` i `null` kao netačno.

## Polja u `questions`

| Polje | Tip | Podrazumevano | Napomena |
|---|---|---|---|
| `type` | string | | **Obavezno.** Jedan od sedam tipova ispod. |
| `text` | string | | **Obavezno.** Najviše 8000 znakova. |
| `content` | string | `null` | Najviše 16000. Značenje zavisi od `type`, vidi ispod. |
| `points` | broj | **`0`** | Vredi pročitati dvaput: pitanje bez `points` ne nosi **nijedan** bod. |
| `position` | broj | na kraj | Redosled u ispitu. |
| `explanation` | string | `null` | Najviše 4000. Prikazuje se na pregledu odgovora. |
| `ai_grading_instructions` | string | `null` | Najviše 4000. Uputstvo za ocenjivanje `open_text` pitanja. |
| `multi_answer` | boolean | izvedeno | Radio dugmad ili polja za štikliranje. Ako se izostavi, dva ili više tačnih odgovora znači štikliranje. |
| `answers` | niz | `[]` | Vidi ispod. |

Kada ga postaviš, `multi_answer` je merodavan: `false` prikazuje radio dugmad čak i kada je više odgovora označeno kao tačno, pa student može da izabere samo jedan. Ako ga izostaviš, izvodi se jednom, pri uvozu, iz broja tačnih odgovora. Ipak ga uvek piši eksplicitno, da namera ostane ista i posle kasnijih izmena odgovora.

### Stavke u `answers`

| Polje | Tip | Podrazumevano | Napomena |
|---|---|---|---|
| `text` | string | | **Obavezno.** Stavka bez njega se izbacuje. |
| `is_correct` | boolean | `false` | |
| `position` | broj | indeks u nizu | |

## Tipovi pitanja

| Tip | Šta stoji u `content` |
|---|---|
| `text` | Ništa. Koristi `answers`. |
| `code` | Isečak koda. Vidi ispod. |
| `image` | Adresa slike. |
| `open_text` | Ništa. Slobodan odgovor, `answers` mora da bude prazan. |
| `ordering` | Tačan redosled, kao JSON string. |
| `matching` | Parovi, kao JSON string. |
| `fill_blank` | Praznine, kao JSON string. |

### text

```json
{
  "type": "text",
  "text": "Koji od navedenih su programski jezici?",
  "points": 2,
  "multi_answer": true,
  "answers": [
    { "text": "Python", "is_correct": true, "position": 0 },
    { "text": "HTML", "is_correct": false, "position": 1 },
    { "text": "Rust", "is_correct": true, "position": 2 }
  ]
}
```

### code

`content` je JSON string sa isečkom koda i jezikom:

```json
{
  "type": "code",
  "text": "Šta ovo ispisuje?",
  "points": 2,
  "content": "{\"snippet\":\"print(2 ** 3)\",\"language\":\"python\"}",
  "answers": [
    { "text": "8", "is_correct": true },
    { "text": "6", "is_correct": false }
  ]
}
```

Radi i običan string sa kodom, samo bez bojenja sintakse.

### image

`content` je putanja do slike u ZIP-u (vidi [ZIP sa slikama](#zip-sa-slikama)), adresa otpremljene slike (`/api/otisak/images/...`), `http(s)` adresa ili `data:` adresa.

```json
{
  "type": "image",
  "text": "Koja topologija je prikazana?",
  "points": 1,
  "content": "https://example.com/topology.png",
  "answers": [
    { "text": "Zvezda", "is_correct": true },
    { "text": "Prsten", "is_correct": false }
  ]
}
```

Najlakše je uvesti ZIP sa slikama. Druga mogućnost je da se slika otpremi kasnije, dugmetom **Otpremi sliku** u editoru ispita. Ako se običan JSON sa putanjama do slika uveze bez ZIP-a, uvoz uspeva, aplikacija upozori koje slike nedostaju, a ta pitanja čekaju da im se slika otpremi u editoru.

`data:` adresa pri uvozu postaje otpremljena slika, a u pitanju ostaje samo kratka adresa. Spoljna `http(s)` adresa se ne preuzima, nego se prikazuje direktno sa tog servera, pa nestaje ako nestane i taj server.

### open_text

```json
{
  "type": "open_text",
  "text": "Objasni razliku između steka i hipa.",
  "points": 3,
  "ai_grading_instructions": "Daj 3 boda ako odgovor pominje i automatsku alokaciju na steku i ručnu alokaciju na hipu. 1 bod za samo jedno od toga. 0 ako nema nijedno.",
  "answers": []
}
```

Ocenjuje ga AI kada je `ai_grading_instructions` postavljen, inače se ocenjuje ručno.

### ordering

`content` je JSON string. `items` **jeste** tačan redosled.

```json
{
  "type": "ordering",
  "text": "Poređaj OSI slojeve, od najnižeg.",
  "points": 2,
  "content": "{\"items\":[\"Fizički\",\"Sloj veze\",\"Mrežni\",\"Transportni\"]}",
  "answers": []
}
```

### matching

`content` je JSON string sa dva paralelna niza: `left[i]` se spaja sa `right[i]`.

```json
{
  "type": "matching",
  "text": "Spoji komponentu sa njenom ulogom.",
  "points": 2,
  "content": "{\"left\":[\"CPU\",\"RAM\",\"Disk\"],\"right\":[\"Obrada\",\"Radna memorija\",\"Trajno skladište\"]}",
  "answers": []
}
```

### fill_blank

`content` je JSON string sa spiskom praznina. Svaka praznina ima `id` i tačnu vrednost `correct`. U `text` se svaka praznina piše kao `___ID___`, tri donje crte sa svake strane.

```json
{
  "type": "fill_blank",
  "text": "Binarna pretraga radi u ___A___ vremenu i zahteva ___B___ niz.",
  "points": 2,
  "content": "{\"blanks\":[{\"id\":\"A\",\"correct\":\"O(log n)\"},{\"id\":\"B\",\"correct\":\"sortiran\"}]}",
  "answers": []
}
```

**Oznake praznina moraju da budu velikim slovima** (`A`, `B2`, `MY_ID`: slova od A do Z, cifre i donja crta). Oznaka malim slovima se ne prepoznaje kao praznina: prikazaće se kao običan tekst, student neće dobiti polje za unos, a pitanje će nositi 0 bodova.

## Bodovanje

| Tip | Pravilo |
|---|---|
| `text`, `code`, `image` sa jednim tačnim | Tačan odgovor nosi sve bodove. |
| `text`, `code`, `image` sa više tačnih | Bilo koji netačan izbor nosi 0. Svi tačni nose sve bodove. Podskup samo tačnih nosi srazmeran deo **samo ako** je `partial_scoring` uključen, inače 0. |
| `ordering` | Sve ili ništa. Redosled mora da bude tačan u potpunosti. |
| `matching` | Sve ili ništa. Svaki par mora da bude tačan. |
| `fill_blank` | Sve ili ništa. Svaka praznina mora da bude tačna. Poredi se bez obzira na velika i mala slova i bez okolnih razmaka. |
| `open_text` | Onoliko koliko dodeli AI ocenjivač ili koliko dodeliš ručno. |

`partial_scoring` važi **samo** za pitanja sa više tačnih odgovora. Nema nikakav efekat na `ordering`, `matching` i `fill_blank`: ta pitanja su uvek sve ili ništa.

## Zanemaruje se pri uvozu

Ovo se prihvata i preskače umesto da obori uvoz, da bi stariji izvozi i dalje radili:

- `exam_mode`: odlučuje stranica na kojoj uvoziš. Aplikacija upozori kada fajl ima ovo polje.
- `subject_name`, `subject_code`: izvoze se kao podatak za čoveka koji čita fajl.
- `version`.
- `tags` na pitanju: oznake imaju samo pitanja iz banke pitanja.

## Uopšte se ne prenosi kroz fajl

Izvoz ovo ne upisuje, a uvoz ne može da postavi, pa se **pri izvozu pa uvozu gubi**:

`tags`, `allow_notes`, `allow_calculator`.

Ni ovo se nikad ne postavlja uvozom: `status` (uvek `draft`), `scheduled_at`, `auto_activate`, `uses_question_bank`, `repeat_interval_minutes`, `is_public`, `self_service`.

## Ograničenja

**ZIP može da ima do 100 MB** (do 300 MB raspakovan, najviše 25 MB po slici). **JSON fajl do 40 MB**, zajedno sa eventualnim ugrađenim `data:` slikama.

Po polju: `text` 8000 znakova, `content` 16000, `explanation` 4000, `ai_grading_instructions` 4000.

## Greške

| Status | Značenje |
|---|---|
| `400` | Nedostaje `exam` ili `questions`. |
| `400` | Nije izabran predmet (`SUBJECT_REQUIRED`). |
| `400` | Izabrani predmet ne postoji (administrator). |
| `403` | Asistent si i nisi dodeljen izabranom predmetu. |
| `400` | U ZIP-u nedostaje slika (`MISSING_IMAGES`) ili je neispravna (`BAD_IMAGE`). Ništa nije napravljeno. |
| `400` | ZIP nema JSON fajl, ima ih više a nijedan nije `exam.json`, ili fajl nije ispravan ZIP. |
| `413` | ZIP je preko 100 MB (300 MB raspakovan), ili JSON preko 40 MB. |
| `500` | Nedostaje `exam.title`, nepoznat `type` pitanja, ili je polje duže od dozvoljenog. |

Dva načina otkazivanja se ponašaju različito i vredi znati koji je koji:

- **Pitanje bez `type` ili `text` se ćutke preskače.** Uvoz uspeva, samo sa manje pitanja nego što ih fajl ima. Proveri broj pitanja posle uvoza.
- **Nepoznat `type` (ili predugo polje) obara uvoz sa greškom 500 na pola posla.** Uvoz nije u transakciji, pa ispit i pitanja napravljena pre onog lošeg **ostaju** kao nedovršen nacrt. Obriši ga ili popravi umesto da pretpostaviš da se ništa nije desilo.

## Najmanji ispravan fajl

```json
{
  "exam": { "title": "Brza provera" },
  "questions": [
    {
      "type": "text",
      "text": "Da li je Zemlja okrugla?",
      "points": 1,
      "answers": [
        { "text": "Da", "is_correct": true },
        { "text": "Ne", "is_correct": false }
      ]
    }
  ]
}
```

Sve ostalo pada na podrazumevane vrednosti iz tabela iznad: 60 minuta, prag od 50%, bez mešanja, bez pregleda odgovora.
