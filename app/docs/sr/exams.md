# Upravljanje ispitima

## Kreiranje ispita

Na stranici "Upravljanje ispitima" postoje dva načina za kreiranje ispita: ručno kreiranje pojedinačnih ispita i uvoz ispita putem JSON datoteke.

### Ručno kreiranje ispita

Klikom na dugme "Novi ispit" u gornjem desnom uglu otvara se forma za kreiranje novog ispita. Potrebno je uneti:
1. Naslov ispita (ovo je tekst koji će biti prikazan studentima na stranici sa ispitima)
2. Predmet (izabrati iz padajuće liste)
3. Trajanje ispita u minutima
4. Režim ispita (odabrati između "Pravi ispit" i "Vežba"), u većini slučajeva će se koristiti režim "Pravi ispit"

Klikom na dugme "Napravi" ispit će biti kreiran i prikazan u listi ispita.

![Kreiranje ispita](../assets/image-2.png)

### Kreiranje ispita uvozom JSON datoteke

Druga mogućnost za kreiranje ispita je uvoz ispita putem JSON datoteke. Klikom na dugme "Uvezi JSON" otvara se sistemska forma za odabir datoteke.

![Uvoz ispita](../assets/image-3.png)

Potrebno je odabrati JSON datoteku sa ispitom. JSON datoteka treba da bude u sledećem formatu:

```json
{
  "version": 1,
  "exam": {
    "title": "Arhitektura računara - Primer PI",
    "description": "Primer ispitnih pitanja PI",
    "duration_minutes": 30,
    "pass_threshold": 50,
    "exam_mode": "practice",
    "allow_review": true,
    "shuffle_questions": false,
    "shuffle_answers": false,
    "partial_scoring": true,
    "negative_points_enabled": false,
    "negative_points_value": 0,
    "negative_points_threshold": 0
  },
  "questions": [
    {
      "type": "text",
      "text": "Frejm sadrži:",
      "points": 1,
      "position": 0,
      "answers": [
        { "text": "argumente", "is_correct": true,  "position": 0 },
        { "text": "globalne promenljive", "is_correct": false, "position": 1 },
        { "text": "povratnu adresu", "is_correct": true,  "position": 2 },
        { "text": "lokalne promenljive", "is_correct": true,  "position": 3 },
        { "text": "nijedan od ponuđenih odgovora nije tačan", "is_correct": false, "position": 4 }
      ]
    }
  ]
}

```

Nakon uspešnog uvoza, ispit će biti prikazan u listi ispita. Ukoliko je potrebno, nakon kreiranja ispita moguće je izvršiti izmene podešavanja ispita, kao i dodati ili izmeniti pitanja i odgovore.

## Izmena ispita

U listi ispita klikom na dugme "Uredi" moguće je izvršiti izmene podešavanja ispita, kao i dodati ili izmeniti pitanja i odgovore.

![Izmena ispita](../assets/image-4.png)

![Izmena ispita](../assets/image-5.png)