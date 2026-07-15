# Managing exams

Screen: `/manage`. Lists **real exams** for the subjects you're assigned to (assistant) or every exam (admin).

Practice exams are not here: they have their own screen at `/practice`. See [Practice exams](practice.md). An exam's mode is decided by the screen you create it on and cannot be changed afterwards.

## Lifecycle

```
draft  →  scheduled  →  active  →  completed  →  archived
```

- **draft** - editable: questions, settings, title.
- **scheduled** - optionally pinned to a date. Enrolled students see it on the dashboard.
- **active** - students can join. Avoid edits from this point on.
- **completed** - final. The DB blocks any move back to `active`.
- **archived** - hidden from the main list.

The `completed → active` transition is blocked at the DB layer. No UI button or stray API call can undo a finished exam.

## Creating

Two paths:

1. **By hand.** `/manage`, **Nov ispit**. Fields:
   - **Title** - visible to students.
   - **Subject** - dropdown shows your assigned subjects (admins see all).
   - **Duration** - minutes, default 60.

   Saves as `draft`, as a real exam. To create a practice exam, use `/practice` instead.

2. **JSON import.** `/manage`, **Uvezi JSON**. See [JSON import](#json-import).

## Settings panel

`/manage/:id/edit` opens the editor. Settings are at the top.

| Setting | Effect |
|---|---|
| Title | Editable while not active. |
| Description | Shown on the join screen. |
| Duration (minutes) | Timer length. |
| Pass threshold (%) | Labels pass or fail. Doesn't block submission. |
| Allow review | Students see correct answers on the results screen after the exam closes. |
| Shuffle questions | Random order per attempt. Seeded so refresh doesn't reshuffle. |
| Shuffle answers | Random option order within each question. Same seeding. |
| Partial scoring | Multi-correct questions award proportional points instead of all-or-nothing. |
| Negative points | See below. |

**Sačuvaj podešavanja** commits the change.

### Negative points

Off by default. When on, after `negative_points_threshold` wrong answers each additional wrong answer subtracts `negative_points_value`. Total never goes below zero.

Example: threshold 1, value 0.5. First wrong is free. Each one after costs 0.5.

## Question types

Seven types. First three are common:

| Type | Use |
|---|---|
| `text` | Multiple choice. Toggle `multi_answer` for checkboxes. |
| `code` | Multiple choice with a syntax-highlighted snippet. Pick the language. |
| `image` | Multiple choice with an image (file or URL). |
| `open_text` | Free-form. AI-graded if you write grading instructions; otherwise manual. |
| `ordering` | Student drags items into the right order. |
| `matching` | Pair items from left with right. |
| `fill_blank` | Question text with `___A___` placeholders. Student types each. |

**The last three cannot be created in the editor.** The type dropdown only offers `text`, `code`, `image` and `open_text`. To author an `ordering`, `matching` or `fill_blank` question, import it from JSON: see [Exam JSON format](json-format.md). They render and score correctly once imported, so test the attempt flow before assigning.

### `multi_answer` is authoritative

The `multi_answer` flag on a question controls radio vs checkbox. It's not derived from "how many correct". Toggle it on for checkboxes. Leaving it off with multiple correct answers makes the UI show radios; the student can only pick one.

## Inline vs bank-backed

**Inline (default).** Questions live on the exam. The list in `/manage/:id/edit` is what students see. Use for small exams (< ~30 questions), reusable templates, full control.

**Bank-backed.** Set `uses_question_bank = true`. Add tag rules: each says "pick N questions tagged `<tag>` worth M points each". The pool is regenerated per attempt. Use for large banks per topic and different samples per student.

## JSON import

`/manage`, **Uvezi JSON**:

1. Pick a `.json` file.
2. Pick a **subject**. Required, and it wins over anything in the file. Assistants only see their assigned subjects; picking one that isn't yours returns `403`.
3. Import. The exam is created as a `draft` **real exam**, because you are on `/manage`. To import a practice exam, do the same on `/practice`.

**Export JSON** on any row produces a file in the same shape, so you can move an exam between environments or keep a backup.

For every field, every default and every question type, see [Exam JSON format](json-format.md).

## Lifecycle moves

From the `/manage` row:

- **Aktiviraj** - `draft` or `scheduled` to `active`. Students can join. Timer starts when you click **Pokreni tajmer** in the room.
- **Završi** - `active` to `completed`. Final. Cannot reopen.
- **Arhiviraj** - hides from the main listing.

Once `completed`, results become visible to students if `allow_review` is on.

## Results

**Rezultati** in the room header (`/manage/:examId`) downloads a ZIP with:

- `results.csv` - one row per student: score, max, percentage, pass or fail, time spent, timestamps.
- `results-table.pdf` - same data as a printable table.
- `per-student/` - one PDF per student with their answers, the correct answers, and per-question points.

The ZIP is generated on the fly. For large cohorts it can take a minute. Don't refresh.

For just the CSV: `GET /api/otisak/manage/:examId/results.csv`.

### Per-student reports

Click a student row in the live stats panel to open `/manage/:examId/report/:userId`:

- Each question with student answer vs correct answer.
- Per-question points awarded.
- Time spent per question (from the activity log).
- AI grader feedback if grading ran.

Use this when a student contests their score.

## AI grading

Open-text answers can be graded by Claude or OpenAI. Two modes:

### Inline

Exam AI settings: `grading_mode = inline`. Grading runs as part of submit. Final score is immediate. Submit latency grows by a few seconds per open-text question.

### Deferred (default)

Submit returns immediately with `ai_grading_status = pending` per answer. Attempt status is `partial` until you trigger the grader.

Trigger from the room: **Pokreni AI ocenjivanje** in the header. The server queues each answer, calls the provider, parses out a score and feedback, updates the attempt total.

Per-answer grading: ~3-5s. Progress is live.

### Provider config

Two ways to provide an API key:

- **Server key** - stored on the exam's AI settings (`otisak_exam_ai_settings`). Server pays for grading. There is no admin screen for this yet: it is set through the API.
- **Student keys** - set `allow_student_api_keys = true` on the exam. Each student attaches their own key from their profile. They pay for grading. Use for take-home or extracurricular exams.

`max_student_credits` caps how much a single student can spend through their key on this exam.

### Writing grading instructions

Per-question field. Goes into the system prompt for that call.

Good: "Award 2 points if the answer mentions both stack and heap. 1 point for either. 0 if neither."

Bad: "Grade this fairly." "Be lenient."

The grader returns a score and a short feedback string. Both are stored on `otisak_attempt_answers`.

## Re-running an exam

There is no way to re-run an exam. A `completed` exam is final: the DB refuses to move it back to `active`, and the `/manage` row offers no re-run action.

To assess the same material again, create a new exam and import the same JSON file into it. See [Exam JSON format](json-format.md).
