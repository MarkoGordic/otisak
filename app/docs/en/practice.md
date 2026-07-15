# Practice exams

Screen: `/practice`, **Manage Practice** in the sidebar.

A practice exam is one students start themselves, whenever they want, as many times as they want. There is no room, no roster and no proctoring. Real exams live on their own screen at `/manage`.

## Real or practice

| | Real exam (`/manage`) | Practice exam (`/practice`) |
|---|---|---|
| Who starts it | You do, from the room | The student does, any time |
| Enrolment | Required | Not required |
| Lobby and timer | Students wait, you start the timer | Starts immediately on click |
| Proctoring room | Yes | No |
| Attempts | One | Unlimited |
| Results | Exported per cohort | Immediate, for the student |

**Mode is fixed when the exam is created and cannot be changed afterwards.** The page you create or import on decides it. That is deliberate: an exam cannot drift between the two screens, and the editor shows mode as a read-only badge rather than a dropdown.

## Creating

**By hand.** `/practice`, **New Practice Exam**. Title, subject and duration. Saves as a draft.

A **subject is required** here, unlike on `/manage`. A practice exam with no subject can be created but a student clicking Start on it gets an error, so the form blocks it up front.

**From JSON.** `/practice`, **Import JSON**. Pick a file and a subject. The exam is always created as a practice exam, whatever the file says. See [Exam JSON format](json-format.md).

If your file was exported from an older version and still has an `exam_mode` field, the import works and the app tells you the field was ignored.

## What the page sets for you

Creating or importing on `/practice` marks the exam as self-service and public. You do not set those by hand: they follow from the mode.

That means a practice exam is visible to **all** students, not only enrolled ones. Nothing is exposed the moment you import, though: an imported exam is a draft, and students only see it once you publish.

## Publishing

Tabs on `/practice`:

- **Published**: students can see and start these right now.
- **Drafts**: still being written. Invisible to students.
- **Archive**: put away, and anything finished.

**Publish** on a draft makes it live. **Archive** takes it back out. There is no Unpublish: archive it instead.

Each row shows a visibility badge:

| Badge | Meaning |
|---|---|
| **Public** | Every student can see it. |
| **Enrolled only** | Only students enrolled on the subject can see it. |
| **Hidden from students** | Something is wrong, see below. |

### Hidden from students

A red **Hidden from students** badge means the exam is not marked self-service, so it never reaches the student practice list even when published.

Practice exams imported by older versions of the app have this problem: the import did not mark them self-service, so they were quietly invisible. Click **Republish** on the row to fix it.

New imports do not have this problem.

## Taking practice yourself

Staff take practice exams through the student screen: **My Practice** in the sidebar. That is a different item from **Manage Practice**, which is this page.

Admins see every self-service practice exam. Assistants see the public ones plus those on their assigned subjects. Real exams stay student-only.

## The global practice toggle

`/admin/settings` has **practice_mode_enabled**, and it is **off by default**.

When it is off, students still see **public** practice exams, so the dashboard is never empty and the built-in demo keeps working. Practice exams limited to enrolled students stay hidden until you turn it on. Staff are unaffected.

## The demo exam

A fresh install seeds one public practice exam so there is always something to try. It is pinned: it cannot be finished, archived or deleted, and it cannot be renamed or moved to another subject. Everything else about it (duration, threshold, questions) is editable.

## Things this page does not do

- **No room and no live stats.** A template has no roster. Each student's practice run creates its own hidden copy behind the scenes.
- **No statistics or results export.** Attempts belong to those per-student copies, not the template, so both would always be empty here.
- **No question-bank generation.** The server supports randomised bank-backed practice, but there is no UI for it. See [Managing exams](exams.md).
