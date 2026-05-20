# Posle ispita

Šta da uradiš kad je ispit u statusu `completed`.

## Gde gledati

`/manage/:examId` ostaje otvoren posle zatvaranja, sad samo za čitanje. Odatle:

- Tabla napretka pokazuje konačne predaje.
- Dugmad za izvoz su u zaglavlju.
- Linkovi do izveštaja po studentu su na svakom redu studenta.

## Izvoz rezultata

**Rezultati** u zaglavlju preuzima ZIP sa:

- `results.csv`. Jedan red po studentu: rezultat, maksimum, procenat, prolaz ili pad, utrošeno vreme, vremenski pečati.
- `results-table.pdf`. Isti podaci u tabeli pripremljenoj za štampu.
- `per-student/`. Jedan PDF po studentu sa njegovim odgovorima, tačnim odgovorima i poenima po pitanju.

ZIP se pravi u trenutku zahteva. Za velike grupe može da potraje minut. Ne osvežavaj stranicu.

Samo za CSV: `GET /api/otisak/manage/:examId/results.csv`.

## Izveštaji po studentu

Klik na red studenta na tabli napretka otvara `/manage/:examId/report/:userId`:

- Svako pitanje: studentov odgovor naspram tačnog.
- Dodeljeni poeni po pitanju.
- Provedeno vreme po pitanju (iz dnevnika aktivnosti).
- Povratna informacija AI ocenjivača, ako je puštano.

Koristi kad student osporava rezultat.

## AI ocenjivanje

Otvorene odgovore može da ocenjuje Claude ili OpenAI. Dva režima:

### Tokom predaje

AI podešavanja ispita: `grading_mode = inline`. Ocenjivanje se izvršava kao deo predaje. Konačan rezultat je odmah. Kašnjenje predaje raste nekoliko sekundi po otvorenom pitanju.

### Naknadno (podrazumevano)

Predaja se odmah vraća sa `ai_grading_status = pending` po odgovoru. Status pokušaja je `partial` dok ne pokreneš ocenjivanje.

Pokreni iz sobe: **Pokreni AI ocenjivanje** u zaglavlju. Server stavlja svaki odgovor u red, zove provajdera, čita rezultat i povratnu informaciju, i ažurira ukupan rezultat.

Po odgovoru: oko 3 do 5 sekundi. Napredak je uživo.

### Podešavanje provajdera

Dva načina da se obezbedi API ključ:

- **Serverski ključ**. Čuva se na AI podešavanjima ispita. Server plaća ocenjivanje. Postavlja se u `/admin/ai`.
- **Studentski ključevi**. Postavi `allow_student_api_keys = true` na ispitu. Svaki student zakači svoj ključ iz profila. Plaća ocenjivanje. Korisno za ispite koji se rade kod kuće ili vannastavno.

`max_student_credits` ograničava koliko jedan student može da potroši preko svog ključa na tom ispitu.

### Pisanje uputstva za ocenjivanje

Polje je po pitanju. Ide u sistemsku poruku za taj poziv.

Dobro: "Daj 2 poena ako odgovor pominje i stack i heap. 1 poen ako pominje samo jedno. 0 ako nijedno."

Loše: "Oceni pošteno." "Budi blag."

Ocenjivač vraća rezultat i kratko obrazloženje. Oba se čuvaju u `otisak_attempt_answers`.

## Ponovno pokretanje ispita

Red u `/manage` pokazuje **Pokreni ponovo** za ispite u statusu `completed`.

Briše sve pokušaje i njihove odgovore za ispit, vraća `exam_started_at` na null, vraća status na `draft`.

Nepovratno. Bez vraćanja. Prvo izvezi ZIP ako želiš istoriju.
