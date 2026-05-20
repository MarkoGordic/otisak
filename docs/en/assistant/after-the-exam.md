# After the exam

What to do once the exam is `completed`.

## Where to look

`/manage/:examId` stays open after the exam closes, now read-only. From here:

- The live stats panel shows final submissions.
- Export buttons live in the header.
- Per-student report links sit on each student row.

## Exporting results

**Rezultati** in the header downloads a ZIP with:

- `results.csv`. One row per student: score, max, percentage, pass or fail, time spent, timestamps.
- `results-table.pdf`. Same data as a printable table.
- `per-student/`. One PDF per student with their answers, the correct answers, and per-question points.

The ZIP is generated on the fly. For large cohorts it can take a minute. Don't refresh.

For just the CSV: `GET /api/otisak/manage/:examId/results.csv`.

## Per-student reports

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

- **Server key**. Stored on the exam's AI settings. Server pays for grading. Set this up in `/admin/ai`.
- **Student keys**. Set `allow_student_api_keys = true` on the exam. Each student attaches their own key from their profile. They pay for grading. Use for take-home or extracurricular exams.

`max_student_credits` caps how much a single student can spend through their key in this exam.

### Writing grading instructions

Per-question field. Goes into the system prompt for that call.

Good: "Award 2 points if the answer mentions both stack and heap. 1 point for either. 0 if neither."

Bad: "Grade this fairly." "Be lenient."

The grader returns a score and a short feedback string. Both are stored on `otisak_attempt_answers`.

## Re-running the exam

The `/manage` row shows **Pokreni ponovo** on `completed` exams.

It:

1. Deletes all attempts and attempt answers for the exam.
2. Resets `exam_started_at` to null.
3. Moves status back to `draft`.

Destructive. No undo. Export the results ZIP first if you want history.
