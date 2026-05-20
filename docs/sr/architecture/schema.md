# Šema baze

Sve tabele su definisane u `init.sql`. Migracije u `server/src/db/migrations.ts` `ALTER`-uju preko toga.

## Identitet

### `users`

| Kolona | Napomena |
|---|---|
| `id` | UUID PK. |
| `email` | UNIQUE NOT NULL. |
| `password_hash` | Bcrypt. Rundi 10 (CSV) ili 12 (ručno). |
| `name`, `index_number` | Nullable. |
| `role` | `admin`, `assistant`, `student`. |
| `is_active` | Soft delete. `requireAuth` odbija neaktivne. |
| `last_login_at` | Ažurira se pri loginu. |

Indeksi: `email`, `role`.

### `subject_assignments`

Povezuje asistente sa predmetima. Unique `(user_id, subject_id)`.

| Kolona | Napomena |
|---|---|
| `user_id` | FK users. |
| `subject_id` | FK otisak_subjects. |
| `role` | `professor` ili `assistant`. UI danas vodi samo `assistant`. |
| `assigned_by` | FK users. Audit. |

## Sadržaj ispita

### `otisak_subjects`

Polja: `name`, `code` (kratki id na karticama ispita), `description`.

### `otisak_exams`

Velika tabela. Glavne kolone:

| Kolona | Napomena |
|---|---|
| `title` | Slobodan tekst. Koristi se kao dedupe ključ od `ensureDemoExam`. |
| `subject_id` | Obavezno za nove ispite. Stari redovi mogu biti null. |
| `status` | `draft`, `scheduled`, `active`, `completed`, `archived`. |
| `exam_mode` | `real` ili `practice`. |
| `duration_minutes`, `pass_threshold`, `max_points` | Standardno. |
| `allow_review`, `shuffle_questions`, `shuffle_answers`, `partial_scoring` | Toggleri. |
| `self_service`, `is_public` | Vidljivost vežbe. Practice default oba true. |
| `negative_points_enabled/value/threshold` | Penalty config. |
| `uses_question_bank` | Ako true, pitanja dolaze iz banke kroz `otisak_exam_tag_rules`. |
| `parent_exam_id` | Koristi se za vežbe instance. |
| `exam_started_at` | Null dok se ne klikne **Pokreni tajmer**. |
| `extra_seconds` | Promene tajmera uživo. |

Indeksi: `status`, `subject_id`, `parent_exam_id`.

Blokada `completed`/`archived` u `active` živi u `updateOtisakExamStatus` u DB funkciji, ne kao constraint.

### `otisak_questions`

Inline pitanja.

| Kolona | Napomena |
|---|---|
| `exam_id` | Cascade. |
| `type` | `text`, `code`, `image`, `open_text`, `ordering`, `matching`, `fill_blank`. |
| `text` | Max 8000 karaktera. |
| `content` | Type-specific payload. `code`: JSON `{ snippet, language }`. `image`: URL ili data URL. |
| `points` | Numeric. CHECK `>= 0`. |
| `position` | Redosled unutar ispita. |
| `multi_answer` | Autoritativan flag. Ne izvodi se. |
| `bank_question_id` | Postavljen ako je kopirano iz banke. |

Field-length caps takođe enforced u `createOtisakQuestion`.

### `otisak_answers`

| Kolona | Napomena |
|---|---|
| `question_id` | Cascade. |
| `text`, `is_correct`, `position` | Standardno. Više `is_correct=true` dozvoljeno. |

Za `open_text`: nema redova. Za `ordering`: redosled u `position`, `is_correct` uvek true.

## Banka pitanja

`otisak_question_bank` ogledalo `otisak_questions` ali vezano za predmet sa `tags TEXT[]` nizom (GIN indeksiranim). `otisak_question_bank_answers` ogledalo `otisak_answers`. `otisak_exam_tag_rules` povezuje bank-backed ispit sa bankom kroz tag pravila.

Kad student krene praksu bank-backed ispita, server materijalizuje dete-ispit pod `otisak_exams` (`parent_exam_id` postavljen) i kopira N pitanja iz banke u `otisak_questions`.

## Pokušaji

### `otisak_attempts`

| Kolona | Napomena |
|---|---|
| `exam_id`, `user_id` | Cascade. |
| `started_at`, `finished_at` | Timestamps. |
| `submitted` | True posle predaje ili `finish-all`. |
| `total_points`, `max_points` | Računato pri predaji. |
| `time_spent_seconds` | Iz activity intervala. |
| `ai_grading_status` | `pending`, `grading`, `graded`, `partial`. |
| `is_practice` | True za dete-ispite vežbe. |
| `shuffle_seed` | Per-attempt. Stabilan preko refresh-a. |

Nema unique `(exam_id, user_id)`. Više pokušaja na vežba ispitu je normalno (svako dete ima svoj red).

Indeksi: `exam_id`, `user_id`, `(exam_id, started_at DESC)`.

### `otisak_attempt_answers`

Unique `(attempt_id, question_id)`. Snimanje je upsert.

| Kolona | Napomena |
|---|---|
| `selected_answer_id` | Single-answer tipovi. |
| `selected_answer_ids` | UUID[]. Multi-answer. |
| `text_answer` | Open-text. |
| `points_awarded` | Posle ocenjivanja. |
| `ai_grading_status`, `ai_feedback`, `ai_graded_at` | AI-ocenjeni odgovori. |

## Uživo ispit

### `exam_lockdowns`

`is_active=true` kad je pauzirano. Suma `ended_at - started_at` preko zatvorenih redova plus `now - started_at` za bilo koji otvoren = ukupna pauza. Pauza se dodaje nazad na svaki studentov deadline.

### `exam_requests`

Red zahteva studenata koji čekaju asistenta. Danas samo `late_join`. `type` i `payload` su generic. Unique partial indeks: jedan pending zahtev tog tipa po `(exam, user)`.

### `otisak_exam_events`, `exam_activity_log`

- `otisak_exam_events`. Grubo: ispit krenuo, student ušao, lockdown se menja.
- `exam_activity_log`. Fino per-attempt: pitanje viđeno, odgovor promenjen, save trigerovan. Koristi se za per-student izveštaj.

## Podešavanja i meta

- `app_settings`. Key-value. Danas samo `practice_mode_enabled`. Vidi [`../admin/settings.md`](../admin/settings.md).
- `migrations`. Jedan red po primenjenoj migraciji. Informativan.

## Kaskade

- Brisanje korisnika: kaskada na enrollments, attempts, AI ključeve.
- Brisanje predmeta: kaskada na ispite, banka pitanja, dodele.
- Brisanje ispita: kaskada na pitanja, pokušaje, lockdown, zahteve, aktivnost.

Hard-delete sa kaskadama je namerno. Soft-delete bi naduvao tabele.

Za istoriju obrisanog ispita: eksportuj ZIP rezultata prvo.
