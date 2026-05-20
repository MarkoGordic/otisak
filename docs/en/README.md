# OTISAK — Documentation

Documentation is organized by audience. Pick the role you're operating in:

| Role | Where to start | What's covered |
|---|---|---|
| Admin | [`admin/`](admin/) | Users, subjects, assistant assignments, settings, demo seed |
| Assistant | [`assistant/`](assistant/) | Creating and running exams on assigned subjects |
| Student | [`student/`](student/) | Joining an exam, the in-exam UI, results, practice mode |
| Engineer | [`architecture/`](architecture/) | Stack, request flow, schema, deploy |

For an existing topic that doesn't fit a role:

- [QUESTIONS.md](QUESTIONS.md) — design notes on question-type modelling.

## Conventions

- One audience per folder. Don't mix admin and student instructions in the same file.
- Each subsection is a separate Markdown file linked from that folder's `README.md`, not a 1000-line monolith.
- Screenshots go under `docs/_assets/`. Reference them with relative paths.
- When a feature changes, update its doc page in the **same PR** as the code. Stale documentation is worse than no documentation.
