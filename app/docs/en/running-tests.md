# Running and conducting tests

The room is `/manage/:examId`. Available for any exam in `active` status. This is your control panel during the exam.

## Layout

Three areas:

1. **Header** — exam title, status, timer, big action buttons.
2. **Live stats panel** — per-student progress.
3. **Requests queue** — late-join requests and other student requests waiting on you.

Data refreshes via WebSocket on every event (`exam.started`, `student.joined`, `student.submitted`, `request.created`, `lockdown.changed`). REST polling at 5s falls back if the socket drops.

## Starting the timer

When the exam is `active` but not started, the room shows **Pokreni tajmer**.

Clicking sets `exam_started_at = now`, computes the deadline as `exam_started_at + duration_minutes`, and broadcasts `exam.started`. Students flip from "waiting" to the exam screen.

Once started, the deadline is locked.

## Adjusting the timer

**Podesi tajmer** adds or subtracts seconds. Server updates `extra_seconds` on the exam. Every client receives the new deadline immediately.

Positive values are typical (network outage, fire alarm). Negative is supported but rarely useful.

## Lockdown

**Zabrani rad** puts the exam on hold:

- Students see a full-screen red message.
- Their timers pause.
- Answer input is blocked.

A message field is optional, shown to all students.

**Otpusti** clears the lockdown.

Behind the scenes: a row in `exam_lockdowns`. Pause time is summed and added back to each student's deadline.

Use for: contested objection, flaky network, fire alarm, anything that needs to stop the clock for everyone.

## Late-join requests

If a student tries to join after the timer started, they get a button that creates a request. It lands in your queue with name, index, and timestamp.

- **Odobri** — server creates an attempt, sets the deadline to the exam's current deadline (so the student gets the remaining time), lets them in.
- **Odbij** — student is notified.

Requests stay pending until you decide or the exam closes.

## Removing a student

Each row in the live stats panel has a **Remove from exam** icon. Clicking it:

1. Submits the student's attempt with whatever they answered so far.
2. Frees their session (they can log in from another device on another exam).
3. Broadcasts `student.kicked` over WebSocket; their screen drops back to home immediately.
4. They cannot re-enter **this** exam; the server reports it as already submitted.

Use it when a student violates rules, uses a prohibited tool, or needs to leave the room.

## Per-student visibility

The live stats panel shows each student's status:

| Status | Meaning |
|---|---|
| Nije pristupio | Not joined. |
| U toku | Joined and answering. Progress bar = answered / total. |
| Predao | Submitted. Final score shown. |

Click a row for per-question progress and start time.

## Closing the exam

Two options, both at the bottom of the room page:

- **Završi** — server marks the exam `completed`, submits unfinished attempts (scored with whatever is saved), broadcasts `exam.finished`. Students transition out of the exam screen.
- **Završi sve i preusmeri** — same plus a `redirect: true` flag that sends students to home instead of the results screen.

Both are final. The DB blocks `completed` to `active`.

## After it closes

Read-only, but you can still:

- Open per-student reports from the live stats panel.
- Export CSV and per-student PDFs — see [Results](exams.md#results).
- Trigger AI grading for open-text answers if you didn't grade inline — see [AI grading](exams.md#ai-grading).
