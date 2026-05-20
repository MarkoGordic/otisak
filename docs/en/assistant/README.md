# Assistant guide

Assistants run exams for the subjects they're assigned to. If you have no assignments, `/manage` is empty. Ask an admin to add you to your subject before doing anything else.

## Pages

- [Building an exam](building-an-exam.md). Settings, question types, the question bank, JSON import.
- [Running the live room](running-the-room.md). Live progress, timer adjustments, lockdown, late-join requests.
- [After the exam](after-the-exam.md). Closing the exam, exporting results, AI grading for open-text answers.

## Exam lifecycle

```
draft  →  scheduled  →  active  →  completed  →  archived
```

- **draft**. Editable. Add questions, change settings.
- **scheduled**. Optionally pinned to a date. Enrolled students see it on their dashboard.
- **active**. Students can join. Avoid edits from this point on.
- **completed**. Final. The database blocks any move back to active.
- **archived**. Hidden from the main list.

The `completed` to `active` transition is blocked at the DB layer. No UI button or stray API call can undo a finished exam.

## Two ways to create an exam

1. **By hand**. `/manage`, **Nov ispit**, then add questions on `/manage/:id/edit`.
2. **JSON import**. `/manage`, **Uvezi JSON**. Same shape as the export endpoint. Good for reusing last year's exam or moving between environments. The JSON `subject_name` is matched case-insensitively against one of your assigned subjects.

## Bank questions or inline questions

Inline questions live on the exam itself. The `/manage/:id/edit` view shows them by default.

Bank-backed exams pull N questions from the bank using tag rules. The pool is generated fresh for each attempt. See [`building-an-exam.md`](building-an-exam.md) for when to choose which.
