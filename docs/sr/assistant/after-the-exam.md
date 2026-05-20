# Posle ispita

Šta da uradiš kad je ispit `completed`.

## Gde da gledaš

`/manage/:examId` ostaje otvoren posle zatvaranja, sad read-only. Odatle:

- Live stats panel pokazuje konačne predaje.
- Dugmad za izvoz su u header-u.
- Linkovi ka per-student izveštajima su na svakom redu.

## Izvoz rezultata

**Rezultati** u header-u skida ZIP sa:

- `results.csv`. Jedan red po studentu: rezultat, max, procenat, prolaz ili pad, vreme, timestamp-i.
- `results-table.pdf`. Isti podaci u tabeli za štampu.
- `per-student/`. Jedan PDF po studentu sa odgovorima, tačnim odgovorima i poenima po pitanju.

ZIP se generiše uživo. Za velike grupe može da potraje minut. Ne refresh-uj.

Za samo CSV: `GET /api/otisak/manage/:examId/results.csv`.

## Per-student izveštaji

Klik na red studenta u live stats panelu otvara `/manage/:examId/report/:userId`:

- Svako pitanje sa odgovorom studenta naspram tačnog.
- Dodeljeni poeni po pitanju.
- Vreme provedeno po pitanju (iz activity log-a).
- AI feedback ako je ocenjivanje pušteno.

Koristi kad student osporava rezultat.

## AI ocenjivanje

Open-text odgovore može da ocenjuje Claude ili OpenAI. Dva moda:

### Inline

AI podešavanja ispita: `grading_mode = inline`. Ocenjivanje se izvršava kao deo predaje. Konačan rezultat je odmah. Latencija predaje raste par sekundi po open-text pitanju.

### Deferred (default)

Predaja se vraća odmah sa `ai_grading_status = pending` po odgovoru. Status pokušaja je `partial` dok ne pokreneš ocenjivanje.

Pokretanje iz sobe: **Pokreni AI ocenjivanje** u header-u. Server stavlja svaki odgovor u red, zove provider-a, parsira score i feedback, ažurira ukupan rezultat.

Po odgovoru: ~3-5s. Napredak je uživo.

### Konfiguracija provider-a

Dva načina za API ključ:

- **Server ključ**. Čuva se na AI podešavanjima ispita. Server plaća ocenjivanje. Postavlja se u `/admin/ai`.
- **Studentski ključevi**. Postavi `allow_student_api_keys = true` na ispitu. Svaki student prikači svoj ključ iz profila. Plaća ocenjivanje. Za take-home ili vannastavne ispite.

`max_student_credits` ograničava koliko jedan student može da potroši preko svog ključa u tom ispitu.

### Pisanje instrukcija za ocenjivanje

Po pitanju. Ide u system prompt za taj poziv.

Dobro: "Daj 2 poena ako odgovor pominje i stack i heap. 1 poen za jedan. 0 ako nijedan."

Loše: "Oceni pošteno." "Budi blag."

Grader vraća score i kratak feedback. Oba se čuvaju na `otisak_attempt_answers`.

## Ponovno pokretanje ispita

Red u `/manage` pokazuje **Pokreni ponovo** za `completed` ispite.

Briše sve pokušaje i odgovore za ispit, resetuje `exam_started_at` na null, status nazad na `draft`.

Destruktivno. Bez undo. Prvo eksportuj ZIP ako želiš istoriju.
