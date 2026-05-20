# Životni ciklus ispita

Od trenutka kad student uđe do trenutka kad vidi rezultate. Reference su u `server/src/`.

## Pristup

Dva puta. Oba završavaju redom u `otisak_attempts`.

### Upisan pristup

Student je upisan (admin ga je dodao ili je uvezen u grupu).

1. `POST /exams/:examId/attempt`.
2. Server proverava: upisan, ispit `active`, nema otvorenog pokušaja.
3. Upisuje red u `otisak_attempts` sa `started_at = now`, pravi `shuffle_seed`, vraća id pokušaja i pitanja.

### Pristup preko indeksa

Za javne prave ispite. Student kuca indeks i ID ispita.

1. `POST /exams/:examId/lookup-by-index`.
2. Server traži korisnika po `index_number` (bez razlike u veličini slova). Nema ga: `404`.
3. Pravi sesiju i ide putem upisanog pristupa.

Ako je vreme već krenulo a student nije bio upisan, odgovor je `LATE_JOIN_REQUIRED`. Korisničko sučelje pokazuje **Zahtev za naknadan ulazak**.

## Tokom ispita

`/exam/:examId` radi tri stvari uporedno.

### Automatsko snimanje

Svaka promena odgovora zakazuje snimanje. Postoji i tajmer od 30 sekundi. Putanja: `POST /exams/:examId/answers`. Upis ili izmena na paru `(attempt_id, question_id)`. Istovremena snimanja se ređaju kroz ograničenje jedinstvenosti. Klijent grupiše promene i uklanja duplikate; pet brzih klikova šalje jedan zahtev.

### Dnevnik aktivnosti

Klijent svakih 5 sekundi šalje skup malih događaja. Putanja: `POST /exams/:examId/events`. Server prihvata najviše 500 događaja po pošiljci i potvrđuje da pokušaj pripada korisniku. Iz ovog dnevnika se pravi izveštaj po studentu.

### Osvežavanja uživo

WebSocket ka `/ws/exam/:examId`:

| Događaj | Posledica |
|---|---|
| `exam.started` | Prelaz sa ekrana "čekanje" na ekran ispita. |
| `lockdown.changed` | Pauza ili nastavak. |
| `exam.finished` | Zatvaranje sa servera. Vodi na rezultate, ili na početnu ako je `redirect_students=true`. |

Kao rezerva, REST anketira `/lockdown` svake 2 sekunde.

## Vreme

Prikaz je na klijentu. Rok je merodavan na serveru.

```
rok = exam_started_at
    + duration_minutes
    + extra_seconds
    + paused_seconds (suma svih trajanja zabrane rada)
```

Svaki API odgovor koji nosi ispit nosi i rok. Klijent veruje toj vrednosti.

Ako rok prođe tokom pokušaja, sledeći poziv za snimanje se odbija i pokušaj se sam završava.

## Predaja

`POST /exams/:examId/submit` zove `finishAttempt(attempt)`:

1. U transakciji:
   - Postavi `submitted=true`, `finished_at=now`.
   - Izračunaj `points_awarded` po pitanju iz sačuvanih odgovora.
   - Primeni penal negativnih poena, ako je uključen.
   - Postavi `total_points`.
2. Ako ima otvorenih pitanja a režim AI ocenjivanja je `inline`: oceni odmah.
3. Inače `ai_grading_status=pending`.

Transakcija čini predaju idempotentnom. Ponovljeni zahtev vidi `submitted=true` i vraća postojeći rezultat.

## Automatsko završavanje

Dva puta bez klika studenta:

### Istek roka

Na svakom snimanju ili anketiranju `/lockdown` server proverava rok. Ako je istekao:

1. `autoFinishIfExpired(attempt)`.
2. Zove `finishAttempt` sa onim što je sačuvano.
3. Sledeći odgovor klijentu nosi status završeno. Klijent prelazi na rezultate.

### Završi za sve

Asistent klikne **Završi**. Server zove `finishExamForEveryone(examId, { redirectStudents })`:

1. Učita nepredate pokušaje.
2. Za svaki: `finishAttempt` (u petlji, ne uporedo, da bi opterećenje baze bilo predvidivo).
3. Postavi status ispita na `completed`.
4. Zatvori aktivnu zabranu rada.
5. Pošalje `exam.finished` svima.

Klijenti se prebacuju na rezultate ili na početnu, u zavisnosti od oznake.

## Vežba pokušaji

Vežba ispiti se ponašaju drugačije.

`createPracticeInstance` se izvršava kad student klikne **Pokreni** na vežba ispitu:

1. Učita šablon ispit.
2. Upiše dete-red u `otisak_exams` sa `parent_exam_id = template.id`, `status = active`, `is_practice = true`.
3. Ako je iz banke: izvuče N pitanja iz banke u dete. Inače: kopira pitanja sa šablona.
4. Upiše pokušaj za korisnika na detetu.
5. Vrati id dete-ispita. Klijent ide na `/exam/<childId>`.

Svaki vežba pokušaj je samostalan. Šablon se nikad ne menja.

Predaja zatvara samo dete. Šablon ostaje `active`. Rezultati su odmah vidljivi (vežba podrazumeva `allow_review=true`).

## Rezultati

Pravi ispiti: vidljivi tek kad je ispit `completed`. Početna anketira i prikazuje link "Rezultati" kad se status okrene.

Vežba ispiti: dete prelazi u `completed` pri predaji; student vidi rezultat odmah.

`/exam/:examId/results` učita:

- Pokušaj sa `total_points` i `max_points`.
- Sva pitanja sa izabranim odgovorima studenta.
- Ako je `allow_review = true`: i tačne odgovore i komentar po pitanju.
- Komentar AI ocenjivača za AI-ocenjena pitanja, ako postoji.
