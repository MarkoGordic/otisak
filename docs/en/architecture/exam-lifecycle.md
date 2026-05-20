# Exam lifecycle

From "student joins" to "results visible". Code references are to `server/src/`.

## Joining

Two paths. Both end with a row in `otisak_attempts`.

### Enrolled join

The student is enrolled (added by admin or imported into a group).

1. `POST /exams/:examId/attempt`.
2. Server checks: enrolled, exam `active`, no existing open attempt.
3. INSERT `otisak_attempts` with `started_at = now`, generates `shuffle_seed`, returns attempt id and questions.

### Lookup by index

For public real exams. Student types index number and exam ID on the join page.

1. `POST /exams/:examId/lookup-by-index`.
2. Server looks up user by `index_number` (case-insensitive). Missing: `404`.
3. Creates a session, then follows the enrolled-join path.

If the timer already started and the student wasn't enrolled, response is `LATE_JOIN_REQUIRED`. The UI shows **Zahtev za naknadan ulazak**.

## During the exam

`/exam/:examId` runs three things in parallel.

### Auto-save

Every answer change schedules a save. Hard timer at 30 seconds. Endpoint: `POST /exams/:examId/answers`. Upsert on `(attempt_id, question_id)`. Concurrent saves serialize on the unique constraint. Client buffers and dedupes; five quick clicks fire one request.

### Activity logging

Client batches small events every 5 seconds. Endpoint: `POST /exams/:examId/events`. Server caps batches at 500 events and verifies the attempt belongs to the user. Powers the per-student report.

### Live updates

WebSocket to `/ws/exam/:examId`:

| Event | Effect |
|---|---|
| `exam.started` | Transition from "waiting" to exam screen. |
| `lockdown.changed` | Pause or unpause. |
| `exam.finished` | Server-initiated close. Go to results, or home if `redirect_students=true`. |

REST fallback: `/lockdown` polled every 2s.

## Timer

Display is client-side. Deadline is server-authoritative.

```
deadline = exam_started_at
         + duration_minutes
         + extra_seconds
         + paused_seconds (sum of all lockdown durations)
```

Every API response with the exam includes the deadline. Client trusts it.

If the deadline passes during the attempt, the next save call is rejected and the attempt auto-finishes.

## Submit

`POST /exams/:examId/submit` runs `finishAttempt(attempt)`:

1. In a transaction:
   - Mark `submitted=true`, `finished_at=now`.
   - Compute `points_awarded` per question from saved answers.
   - Apply negative-points penalty if enabled.
   - Set `total_points`.
2. If any open-text questions and exam AI mode is `inline`: grade inline.
3. Otherwise mark `ai_grading_status=pending`.

The transaction makes submit idempotent. Retried requests see `submitted=true` and just return the existing score.

## Auto-finish

Two paths without student click:

### Deadline expiry

On any save or `/lockdown` poll, the server checks the deadline. If past:

1. `autoFinishIfExpired(attempt)`.
2. Calls `finishAttempt` with whatever is saved.
3. Next client response carries the finished status. Client transitions to results.

### Finish-all

Assistant clicks **Završi**. Server runs `finishExamForEveryone(examId, { redirectStudents })`:

1. Load unsubmitted attempts.
2. `finishAttempt` per attempt (loop, not parallel: predictable DB load).
3. Set exam status `completed`.
4. End any active lockdown.
5. Broadcast `exam.finished`.

Clients flip to results or home based on the flag.

## Practice attempts

Practice exams behave differently.

`createPracticeInstance` runs when the student clicks **Pokreni** on a practice exam:

1. Load the template exam.
2. INSERT a child row in `otisak_exams` with `parent_exam_id = template.id`, `status = active`, `is_practice = true`.
3. If bank-backed: materialize N questions from the bank into the child. Otherwise: copy template's inline questions.
4. INSERT attempt for the user on the child.
5. Return child exam id. Client navigates to `/exam/<childId>`.

Each practice attempt is self-contained. Template is never modified.

Submit closes only the child. Template stays `active`. Results visible immediately (practice defaults `allow_review=true`).

## Results

Real exams: visible only when exam is `completed`. Dashboard polls and surfaces a "Rezultati" link once status flips.

Practice exams: child transitions to `completed` on submit; student sees the score immediately.

`/exam/:examId/results` loads:

- Attempt with `total_points` and `max_points`.
- All questions with student's selected answers.
- If `allow_review = true`: also correct answers and per-question feedback.
- AI feedback for AI-graded answers if available.
