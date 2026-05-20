# Building an exam

Importing from JSON? Skip to [JSON import](#json-import).

## Create

`/manage`, **Nov ispit**. Fields:

- **Title**. Visible to students.
- **Subject**. Required. Dropdown shows your assigned subjects. Admins see all.
- **Duration**. Minutes. Default 60.
- **Mode**. `real` or `practice`. Practice defaults `self_service = true` and `is_public = true`. Real defaults both off.

Saves as `draft`.

## Settings panel

`/manage/:id/edit` opens the editor. Settings are at the top.

| Setting | Effect |
|---|---|
| Title | Editable while not active. |
| Description | Shown on the join screen. |
| Duration (minutes) | Timer length. |
| Pass threshold (%) | Labels pass or fail. Doesn't block submission. |
| Mode | `real` or `practice`. Changes also flip `self_service` and `is_public` to match. |
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
| `fill_blank` | Question text with `{{1}}`, `{{2}}` placeholders. Student types each. |

The last three work but the editing UI is rougher. Test the attempt flow before assigning.

### multi_answer is authoritative

The `multi_answer` flag on a question controls radio vs checkbox. It's not derived from "how many correct". Toggle it on for checkboxes. Leaving it off with multiple correct answers makes the UI show radios; the student can only pick one.

## Inline vs bank-backed

**Inline (default)**. Questions live on the exam. The list in `/manage/:id/edit` is what students see. Use for small exams (< ~30 questions), reusable templates, full control.

**Bank-backed**. Set `uses_question_bank = true`. Add tag rules: each says "pick N questions tagged `<tag>` worth M points each". The pool is regenerated per attempt. Use for large banks per topic and different samples per student.

## JSON import

`/manage`, **Uvezi JSON**. Same shape as the export endpoint.

```json
{
  "version": 1,
  "exam": {
    "title": "string (required)",
    "description": "string",
    "duration_minutes": 60,
    "pass_threshold": 50,
    "exam_mode": "real|practice",
    "allow_review": true,
    "shuffle_questions": true,
    "shuffle_answers": true,
    "partial_scoring": false,
    "negative_points_enabled": false,
    "negative_points_value": 0,
    "negative_points_threshold": 0,
    "subject_name": "matched case-insensitively"
  },
  "questions": [
    {
      "type": "text",
      "text": "Question text",
      "points": 1,
      "position": 0,
      "multi_answer": false,
      "answers": [
        { "text": "A", "is_correct": true, "position": 0 },
        { "text": "B", "is_correct": false, "position": 1 }
      ]
    }
  ]
}
```

If you're an assistant and the matched subject isn't yours, the server returns `403`.

`multi_answer` is preserved on round-trip if present. Older fixtures without it fall back to "more than one correct means multi-answer".

## Lifecycle moves

From the `/manage` row:

- **Aktiviraj**. `draft` or `scheduled` to `active`. Students can join. Timer starts when you click **Pokreni tajmer** in the room.
- **Završi**. `active` to `completed`. Final. Cannot reopen.
- **Arhiviraj**. Hides from the main listing.

Once `completed`, results become visible to students if `allow_review` is on.
