# Životni ciklus ispita

Od "student ulazi" do "vidim rezultate". Reference su na `server/src/`.

## Pristup

Dva puta. Oba završavaju redom u `otisak_attempts`.

### Upisan pristup

Student je upisan (admin ga dodao ili je importovan u grupu).

1. `POST /exams/:examId/attempt`.
2. Server proverava: upisan, ispit `active`, nema aktivnog pokušaja.
3. INSERT `otisak_attempts` sa `started_at = now`, generiše `shuffle_seed`, vraća attempt id i pitanja.

### Pristup preko indeksa

Za javne prave ispite. Student kuca indeks i ID ispita.

1. `POST /exams/:examId/lookup-by-index`.
2. Server traži korisnika po `index_number` (case-insensitive). Nema: `404`.
3. Pravi sesiju pa ide put upisanog pristupa.

Ako je tajmer već krenuo a student nije bio upisan, odgovor je `LATE_JOIN_REQUIRED`. UI pokazuje **Zahtev za naknadan ulazak**.

## Tokom ispita

`/exam/:examId` radi tri stvari paralelno.

### Auto-save

Svaka promena odgovora pravi save. Hard tajmer na 30s. Endpoint: `POST /exams/:examId/answers`. Upsert na `(attempt_id, question_id)`. Konkurentni save-ovi se serializuju na unique constraint-u. Klijent buffer-uje i dedup-uje; pet brzih klikova šalju jedan request.

### Activity logging

Klijent batch-uje male event-e svakih 5s. Endpoint: `POST /exams/:examId/events`. Server kapira batch na 500 event-a i potvrđuje da attempt pripada korisniku. Pokreće per-student izveštaj.

### Live updates

WebSocket ka `/ws/exam/:examId`:

| Event | Efekat |
|---|---|
| `exam.started` | Prelaz sa "čekaj" na ekran ispita. |
| `lockdown.changed` | Pauza ili nastavak. |
| `exam.finished` | Server-zatvaranje. Ide na rezultate, ili na home ako `redirect_students=true`. |

REST fallback: `/lockdown` pollovan svakih 2s.

## Tajmer

Prikaz je klijent-side. Deadline je autoritativan na serveru.

```
deadline = exam_started_at
         + duration_minutes
         + extra_seconds
         + paused_seconds (suma svih lockdown trajanja)
```

Svaki API odgovor koji sadrži ispit nosi deadline. Klijent veruje.

Ako deadline prođe tokom pokušaja, sledeći save poziv se odbacuje i pokušaj se auto-završava.

## Predaja

`POST /exams/:examId/submit` zove `finishAttempt(attempt)`:

1. U transakciji:
   - Označi `submitted=true`, `finished_at=now`.
   - Računa `points_awarded` po pitanju iz sačuvanih odgovora.
   - Primenjuje penal negativnih poena ako je on.
   - Postavlja `total_points`.
2. Ako ima open-text pitanja i AI mod je `inline`: ocenjivanje inline.
3. Inače `ai_grading_status=pending`.

Transakcija čini predaju idempotentnom. Ponovljeni request vidi `submitted=true` i samo vraća postojeći rezultat.

## Auto-finish

Dva puta bez klika studenta:

### Istek deadline-a

Na svakom save-u ili `/lockdown` poll-u server proverava deadline. Ako je prošao:

1. `autoFinishIfExpired(attempt)`.
2. Zove `finishAttempt` sa onim što je sačuvano.
3. Sledeći klijentski response nosi finished status. Klijent prelazi na rezultate.

### Finish-all

Asistent klikne **Završi**. Server zove `finishExamForEveryone(examId, { redirectStudents })`:

1. Učita nepredate pokušaje.
2. `finishAttempt` po pokušaju (petlja, ne paralelno: predvidiv DB load).
3. Postavi status ispita `completed`.
4. Zatvori aktivan lockdown.
5. Broadcast `exam.finished`.

Klijenti se prebacuju na rezultate ili home u zavisnosti od flag-a.

## Vežba pokušaji

Vežba ispiti se ponašaju drugačije.

`createPracticeInstance` se izvršava kad student klikne **Pokreni** na vežba ispitu:

1. Učita šablon ispit.
2. INSERT dete red u `otisak_exams` sa `parent_exam_id = template.id`, `status = active`, `is_practice = true`.
3. Ako je bank-backed: materijalizuj N pitanja iz banke u dete. Inače: kopiraj inline pitanja iz šablona.
4. INSERT attempt za korisnika na detetu.
5. Vrati dete-ispit id. Klijent ide na `/exam/<childId>`.

Svaki vežba pokušaj je samostalan. Šablon se nikad ne menja.

Predaja zatvara samo dete. Šablon ostaje `active`. Rezultati odmah vidljivi (vežba default `allow_review=true`).

## Rezultati

Pravi ispiti: vidljivi tek kad je ispit `completed`. Dashboard polluje i prikazuje "Rezultati" link kad se status okrene.

Vežba ispiti: dete prelazi na `completed` pri predaji; student vidi rezultat odmah.

`/exam/:examId/results` učita:

- Pokušaj sa `total_points` i `max_points`.
- Sva pitanja sa izabranim odgovorima studenta.
- Ako `allow_review = true`: i tačne odgovore i per-question feedback.
- AI feedback za AI-ocenjene ako postoji.
