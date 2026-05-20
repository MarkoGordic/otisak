# Database schema

All tables defined in `init.sql`. Migrations in `server/src/db/migrations.ts` `ALTER` on top.

## Identity

### `users`

| Column | Notes |
|---|---|
| `id` | UUID PK. |
| `email` | UNIQUE NOT NULL. |
| `password_hash` | Bcrypt. Rounds 10 (CSV import) or 12 (manual). |
| `name`, `index_number` | Nullable. |
| `role` | `admin`, `assistant`, `student`. |
| `is_active` | Soft delete. `requireAuth` rejects inactive. |
| `last_login_at` | Updated on login. |

Indexes: `email`, `role`.

### `subject_assignments`

Links assistants to subjects. Unique `(user_id, subject_id)`.

| Column | Notes |
|---|---|
| `user_id` | FK users. |
| `subject_id` | FK otisak_subjects. |
| `role` | `professor` or `assistant`. Only `assistant` is wired in UI today. |
| `assigned_by` | FK users. Audit. |

## Exam content

### `otisak_subjects`

Fields: `name`, `code` (short id on exam cards), `description`.

### `otisak_exams`

The big table. Key columns:

| Column | Notes |
|---|---|
| `title` | Free text. Used as dedupe key by `ensureDemoExam`. |
| `subject_id` | Required for new exams. Historical rows may be null. |
| `status` | `draft`, `scheduled`, `active`, `completed`, `archived`. |
| `exam_mode` | `real` or `practice`. |
| `duration_minutes`, `pass_threshold`, `max_points` | Standard config. |
| `allow_review`, `shuffle_questions`, `shuffle_answers`, `partial_scoring` | Toggles. |
| `self_service`, `is_public` | Practice visibility. Practice defaults both true. |
| `negative_points_enabled/value/threshold` | Penalty config. |
| `uses_question_bank` | If true, questions come from the bank via `otisak_exam_tag_rules`. |
| `parent_exam_id` | Used for practice instances. |
| `exam_started_at` | Null until **Pokreni tajmer**. |
| `extra_seconds` | Live timer adjustments. |

Indexes: `status`, `subject_id`, `parent_exam_id`.

The `completed`/`archived` to `active` block lives in `updateOtisakExamStatus` in the DB function layer, not as a DB constraint.

### `otisak_questions`

Inline questions.

| Column | Notes |
|---|---|
| `exam_id` | Cascade. |
| `type` | `text`, `code`, `image`, `open_text`, `ordering`, `matching`, `fill_blank`. |
| `text` | Max 8000 chars. |
| `content` | Type-specific payload. `code`: JSON `{ snippet, language }`. `image`: URL or data URL. |
| `points` | Numeric. CHECK `>= 0`. |
| `position` | Order within exam. |
| `multi_answer` | Authoritative flag. Not derived. |
| `bank_question_id` | Set if copied from the bank. |

Field-length caps also enforced in `createOtisakQuestion`.

### `otisak_answers`

| Column | Notes |
|---|---|
| `question_id` | Cascade. |
| `text`, `is_correct`, `position` | Standard. Multiple `is_correct=true` allowed. |

For `open_text`: no rows. For `ordering`: order in `position`, `is_correct` always true.

## Question bank

`otisak_question_bank` mirrors `otisak_questions` but bound to a subject with a `tags TEXT[]` array (GIN indexed). `otisak_question_bank_answers` mirrors `otisak_answers`. `otisak_exam_tag_rules` joins a bank-backed exam to the bank with per-tag rules.

When a student starts a practice attempt of a bank-backed exam, the server materializes a child exam under `otisak_exams` (`parent_exam_id` set) and copies N questions from the bank into `otisak_questions`.

## Attempts

### `otisak_attempts`

| Column | Notes |
|---|---|
| `exam_id`, `user_id` | Cascade. |
| `started_at`, `finished_at` | Timestamps. |
| `submitted` | True after submit or `finish-all`. |
| `total_points`, `max_points` | Computed at submit. |
| `time_spent_seconds` | From activity intervals. |
| `ai_grading_status` | `pending`, `grading`, `graded`, `partial`. |
| `is_practice` | True for child practice exams. |
| `shuffle_seed` | Per-attempt. Stable across refreshes. |

No unique `(exam_id, user_id)`. Multiple attempts on a practice exam are normal (each child is its own row).

Indexes: `exam_id`, `user_id`, `(exam_id, started_at DESC)`.

### `otisak_attempt_answers`

Unique `(attempt_id, question_id)`. Saves are upserts.

| Column | Notes |
|---|---|
| `selected_answer_id` | Single-answer types. |
| `selected_answer_ids` | UUID[]. Multi-answer types. |
| `text_answer` | Open-text. |
| `points_awarded` | After grading. |
| `ai_grading_status`, `ai_feedback`, `ai_graded_at` | AI-graded answers. |

## Live exam

### `exam_lockdowns`

`is_active=true` when paused. Sum of `ended_at - started_at` across closed rows plus `now - started_at` for any open row = total pause. Pause is added back to each student's deadline.

### `exam_requests`

Queue of student requests waiting on the assistant. Today only `late_join` is wired. `type` and `payload` are generic. Unique partial index: one pending request of a given type per `(exam, user)`.

### `otisak_exam_events`, `exam_activity_log`

- `otisak_exam_events`. Coarse: exam started, student joined, lockdown changed.
- `exam_activity_log`. Fine per-attempt actions: question viewed, answer changed, save fired. Used for per-student report.

## Settings and meta

- `app_settings`. Key-value store. Currently only `practice_mode_enabled`. See [`../admin/settings.md`](../admin/settings.md).
- `migrations`. One row per applied migration. Informational only.

## Cascades

- Delete a user: cascades enrollments, attempts, AI keys.
- Delete a subject: cascades exams, bank questions, assignments.
- Delete an exam: cascades questions, attempts, lockdowns, requests, activity.

Hard-delete with cascades is deliberate. Soft-delete would balloon the tables.

For history of a deleted exam: export the results ZIP first.
