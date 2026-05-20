# Assistant guide

Assistants run exams for the subjects they've been assigned to. An assistant with zero assignments sees an empty `/manage` page — ask an admin to assign you to your subject(s) before doing anything else.

## Tasks

- [Building an exam](building-an-exam.md) — settings, question types, the question bank, JSON import.
- [Running the live room](running-the-room.md) — the per-exam admin view: live progress, timer adjustments, lockdown, late-join requests.
- [After the exam](after-the-exam.md) — closing the exam, exporting results, AI grading for open-text questions.

## Lifecycle of an exam

```
draft  ──▶  scheduled  ──▶  active  ──▶  completed  ──▶  archived
```

- **draft** — editable. Add questions, tweak settings.
- **scheduled** — optionally pinned to a date; students with an enrollment can see it on their dashboard.
- **active** — students can join. From this point, edits should be avoided.
- **completed** — irreversible: cannot be flipped back to active. Results are final.
- **archived** — out of the main listing.

The `completed` → `active` transition is blocked at the DB layer specifically — no UI button or stray API call can undo a finalized exam.

## Two creation paths

1. **Build by hand** — `/manage` → `Nov ispit` → add questions one at a time via `/manage/:id/edit`.
2. **Import JSON** — `/manage` → `Uvezi JSON`. Same shape as the export endpoint. Useful for reusing last year's exam or moving between environments. The JSON's `subject_name` is matched case-insensitively against your assigned subjects.

## Question bank vs. inline questions

- An exam can hold its own inline questions (what `/manage/:id/edit` shows by default).
- Or it can be a **bank-backed** exam: it pulls N questions from the bank, filtered by tag rules, generated freshly per attempt. See [`building-an-exam.md`](building-an-exam.md) for when to choose which.
