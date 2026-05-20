# Šema baze

Sve tabele su definisane u `init.sql`. Migracije u `server/src/db/migrations.ts` rade `ALTER` preko toga.

## Identitet

### `users`

| Kolona | Napomena |
|---|---|
| `id` | UUID, primarni ključ. |
| `email` | UNIQUE NOT NULL. |
| `password_hash` | Bcrypt. Rundi 10 (uvoz iz CSV-a) ili 12 (ručno). |
| `name`, `index_number` | Mogu biti `NULL`. |
| `role` | `admin`, `assistant`, `student`. |
| `is_active` | Mekano brisanje. `requireAuth` odbija neaktivne. |
| `last_login_at` | Ažurira se pri prijavi. |

Indeksi: `email`, `role`.

### `subject_assignments`

Povezuje asistente sa predmetima. Jedinstven par `(user_id, subject_id)`.

| Kolona | Napomena |
|---|---|
| `user_id` | Strani ključ na `users`. |
| `subject_id` | Strani ključ na `otisak_subjects`. |
| `role` | `professor` ili `assistant`. Sučelje danas koristi samo `assistant`. |
| `assigned_by` | Strani ključ na `users`. Trag o dodeli. |

## Sadržaj ispita

### `otisak_subjects`

Polja: `name`, `code` (kratki identifikator na karticama ispita), `description`.

### `otisak_exams`

Velika tabela. Glavne kolone:

| Kolona | Napomena |
|---|---|
| `title` | Slobodan tekst. `ensureDemoExam` ga koristi za prepoznavanje duplikata. |
| `subject_id` | Obavezno za nove ispite. Stari redovi mogu biti `NULL`. |
| `status` | `draft`, `scheduled`, `active`, `completed`, `archived`. |
| `exam_mode` | `real` ili `practice`. |
| `duration_minutes`, `pass_threshold`, `max_points` | Standardna podešavanja. |
| `allow_review`, `shuffle_questions`, `shuffle_answers`, `partial_scoring` | Prekidači. |
| `self_service`, `is_public` | Vidljivost vežbe. Vežba podrazumeva oba `true`. |
| `negative_points_enabled/value/threshold` | Podešavanja penala. |
| `uses_question_bank` | Ako je `true`, pitanja stižu iz banke kroz `otisak_exam_tag_rules`. |
| `parent_exam_id` | Koristi se za vežba primerke. |
| `exam_started_at` | `NULL` dok asistent ne klikne **Pokreni tajmer**. |
| `extra_seconds` | Izmene vremena uživo. |

Indeksi: `status`, `subject_id`, `parent_exam_id`.

Zabrana prelaska `completed`/`archived` u `active` živi u `updateOtisakExamStatus` u DB sloju, ne kao ograničenje u bazi.

### `otisak_questions`

Pitanja vezana za sam ispit.

| Kolona | Napomena |
|---|---|
| `exam_id` | Lančano brisanje. |
| `type` | `text`, `code`, `image`, `open_text`, `ordering`, `matching`, `fill_blank`. |
| `text` | Najviše 8000 znakova. |
| `content` | Sadržaj zavisan od tipa. `code`: JSON `{ snippet, language }`. `image`: URL ili data URL. |
| `points` | Broj. CHECK `>= 0`. |
| `position` | Redosled unutar ispita. |
| `multi_answer` | Merodavna oznaka. Ne izvodi se iz drugih polja. |
| `bank_question_id` | Postavljen ako je pitanje kopija iz banke. |

Ograničenja dužine polja se proveravaju i u `createOtisakQuestion`.

### `otisak_answers`

| Kolona | Napomena |
|---|---|
| `question_id` | Lančano brisanje. |
| `text`, `is_correct`, `position` | Standardno. Više `is_correct=true` je dozvoljeno. |

Za `open_text`: nema redova. Za `ordering`: redosled je u `position`, `is_correct` je uvek `true`.

## Banka pitanja

`otisak_question_bank` je istog oblika kao `otisak_questions`, ali je vezana za predmet i ima niz `tags TEXT[]` (indeksiran GIN-om). `otisak_question_bank_answers` prati `otisak_answers`. `otisak_exam_tag_rules` povezuje ispit iz banke sa bankom kroz pravila po oznakama.

Kad student krene vežbu ispita iz banke, server pravi dete-ispit u `otisak_exams` (sa popunjenim `parent_exam_id`) i kopira N pitanja iz banke u `otisak_questions`.

## Pokušaji

### `otisak_attempts`

| Kolona | Napomena |
|---|---|
| `exam_id`, `user_id` | Lančano brisanje. |
| `started_at`, `finished_at` | Vremenske oznake. |
| `submitted` | `true` posle predaje ili `finish-all`. |
| `total_points`, `max_points` | Računaju se pri predaji. |
| `time_spent_seconds` | Iz dnevnika aktivnosti. |
| `ai_grading_status` | `pending`, `grading`, `graded`, `partial`. |
| `is_practice` | `true` za vežba dete-ispite. |
| `shuffle_seed` | Po pokušaju. Stabilno pri osvežavanju strane. |

Nema jedinstvenog para `(exam_id, user_id)`. Više pokušaja vežba ispita je očekivano (svako dete ima svoj red).

Indeksi: `exam_id`, `user_id`, `(exam_id, started_at DESC)`.

### `otisak_attempt_answers`

Jedinstven par `(attempt_id, question_id)`. Snimanje je upsert.

| Kolona | Napomena |
|---|---|
| `selected_answer_id` | Tipovi sa jednim odgovorom. |
| `selected_answer_ids` | `UUID[]`. Tipovi sa više odgovora. |
| `text_answer` | Otvoreni tekst. |
| `points_awarded` | Posle ocenjivanja. |
| `ai_grading_status`, `ai_feedback`, `ai_graded_at` | Za AI-ocenjena pitanja. |

## Tokom ispita

### `exam_lockdowns`

`is_active=true` dok je pauzirano. Zbir `ended_at - started_at` po zatvorenim redovima plus `now - started_at` za otvoren red daje ukupnu pauzu. Pauza se dodaje na svaki studentov rok.

### `exam_requests`

Red zahteva studenata koji čekaju asistenta. Danas se koristi samo `late_join`. `type` i `payload` su uopšteni. Delimičan jedinstven indeks: jedan zahtev na čekanju datog tipa po paru `(exam, user)`.

### `otisak_exam_events`, `exam_activity_log`

- `otisak_exam_events`. Krupni događaji: ispit krenuo, student ušao, zabrana rada se promenila.
- `exam_activity_log`. Sitni događaji po pokušaju: pitanje pregledano, odgovor promenjen, snimanje pokrenuto. Iz ovoga se pravi izveštaj po studentu.

## Podešavanja i meta

- `app_settings`. Parovi ključ–vrednost. Danas se koristi samo `practice_mode_enabled`. Vidi [`../admin/settings.md`](../admin/settings.md).
- `migrations`. Jedan red po primenjenoj migraciji. Informativno.

## Lančana brisanja

- Brisanje korisnika: lančano brisanje upisa, pokušaja, AI ključeva.
- Brisanje predmeta: lančano brisanje ispita, pitanja iz banke, dodela.
- Brisanje ispita: lančano brisanje pitanja, pokušaja, zabrana rada, zahteva, aktivnosti.

Tvrdo brisanje sa lančanim je namerno. Mekano brisanje bi naduvalo tabele.

Za istoriju obrisanog ispita: pre brisanja izvezi ZIP rezultata.
