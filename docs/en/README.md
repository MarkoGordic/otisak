# OTISAK Documentation

Pick the role you're acting in and start there.

| Role | Where to go | What's covered |
|---|---|---|
| Admin | [`admin/`](admin/) | Users, subjects, assistant assignments, settings, demo exam |
| Assistant | [`assistant/`](assistant/) | Build and run exams on subjects you're assigned to |
| Student | [`student/`](student/) | Joining an exam, the exam screen, results, practice |
| Engineer | [`architecture/`](architecture/) | Stack, request flow, schema, deploy |

## Conventions

One folder per audience. Don't mix admin and student instructions in the same file.

Each topic is its own short page linked from the folder's README. No 1000-line monoliths.

Screenshots go under `docs/_assets/`. Reference them with relative paths.

When a feature changes, update its page in the same PR. Stale docs are worse than no docs.
