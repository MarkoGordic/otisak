# OTISAK — Question authoring guide

This document describes the data model and JSON shape for **bank questions** and **exam questions** in OTISAK so that humans, scripts, or AI assistants can author them consistently.

There are two storage areas:

- **Question Bank** (`otisak_question_bank`) — reusable questions tagged per subject. Used to seed exams via `tag_rules` or copied directly into an exam.
- **Exam questions** (`otisak_questions`) — questions attached to a specific exam (either copied from the bank or authored inline).

The bank UI lives at `/questions`. Inline exam questions are managed under `/manage/<exam_id>/questions`.

The shapes are **almost identical** for both areas. Where they differ, this doc calls it out.

---

## Question types

| Type | Use case |
|------|----------|
| `text` | Multiple-choice (one or many correct). |
| `code` | Multiple-choice with a code snippet (syntax-highlighted). |
| `image` | Multiple-choice with an image (uploaded or external URL). |
| `open_text` | Free-text answer. Optional AI grading. |
| `ordering` | Drag-and-drop ordering of items. *(exam-only — bank UI does not yet expose)* |
| `matching` | Match left items to right items. *(exam-only)* |
| `fill_blank` | Fill-in-the-blanks with multiple positions. *(exam-only)* |

---

## Common fields (all types)

```jsonc
{
  "subject_id": "uuid",         // bank only — links to a subject
  "type": "text|code|image|open_text|ordering|matching|fill_blank",
  "text": "Question prompt shown to the student",
  "points": 2,                   // integer ≥ 0
  "tags": ["array", "of", "lowercase", "tags"],
  "answers": [ /* see per-type below */ ]
}
```

`tags` are normalised to lowercase, trimmed, deduped server-side. They are the primary way the question bank is filtered (in the UI and via `tag_rules` for exams that draw from the bank).

---

## `text` — multiple choice

```jsonc
{
  "type": "text",
  "text": "Sta od navedenog je RAM memorija?",
  "points": 2,
  "tags": ["memorija"],
  "answers": [
    { "text": "DRAM",   "is_correct": true,  "position": 0 },
    { "text": "ROM",    "is_correct": false, "position": 1 },
    { "text": "Cache",  "is_correct": true,  "position": 2 },
    { "text": "Disk",   "is_correct": false, "position": 3 }
  ]
}
```

- Multiple `is_correct: true` entries are allowed — that turns the question into a multi-select. Grading honours `partial_scoring` on the exam.
- `position` is optional; if omitted, the array order is used.

---

## `code` — multiple choice with code snippet

```jsonc
{
  "type": "code",
  "text": "Sta vraca funkcija?",
  "code_snippet": "def f(x):\n    return x * 2 + 1\nprint(f(3))",
  "code_language": "python",      // hljs identifier; empty/omitted = auto-detect
  "points": 2,
  "tags": ["jezici", "python"],
  "answers": [
    { "text": "6", "is_correct": false, "position": 0 },
    { "text": "7", "is_correct": true,  "position": 1 }
  ]
}
```

- `code_snippet` is plain text (newline-separated); the renderer applies syntax highlighting via highlight.js.
- Common `code_language` values: `python`, `javascript`, `typescript`, `java`, `csharp`, `cpp`, `c`, `sql`, `bash`, `go`, `rust`, `php`, `ruby`, `html`, `css`, `json`, `xml`, `yaml`. Pass an empty string for auto-detect.

---

## `image` — multiple choice with image

```jsonc
{
  "type": "image",
  "text": "Koja komponenta je oznacena strelicom?",
  "image_url": "https://example.com/cpu-diagram.png",
  "points": 2,
  "tags": ["arhitektura"],
  "answers": [
    { "text": "ALU",      "is_correct": true,  "position": 0 },
    { "text": "Registar", "is_correct": false, "position": 1 }
  ]
}
```

- `image_url` accepts either an absolute `http(s)://` URL **or** a base64-encoded data URL (`data:image/png;base64,…`).
- The bank UI supports drag/drop upload (≤ 4 MB) which embeds as a data URL. The server's JSON limit is 5 MB.

---

## `open_text` — free-text (AI-graded)

```jsonc
{
  "type": "open_text",
  "text": "U dve recenice objasni razliku izmedju procesa i niti.",
  "points": 4,
  "tags": ["os"],
  "answers": [],                                // must be empty
  "ai_grading_instructions": "Tacan odgovor mora obuhvatiti deobu memorije i scheduling..."
}
```

- `answers` MUST be an empty array; the question is graded by AI (or admin-corrected later).
- `ai_grading_instructions` is the rubric passed to the grader. Be specific.

---

## Exam-only types

These exist on `otisak_questions` but the bank UI does not yet expose authoring for them. Format reference:

### `ordering`

```jsonc
{
  "type": "ordering",
  "text": "Poredjajte slojeve OSI modela odozdo nagore.",
  "points": 4,
  "content": "{\"items\":[\"Fizicki\",\"Linijski\",\"Mrezni\",\"Transport\",\"Sesija\",\"Prezentacija\",\"Aplikacija\"]}",
  "answers": []
}
```

- `content` is a JSON string. The `items` array is the **correct order**.
- Student response is JSON-encoded into `text_answer` (their order of items).
- Partial credit honoured if `partial_scoring` is on (correct positions / total).

### `matching`

```jsonc
{
  "type": "matching",
  "text": "Spojite pojmove sa definicijama.",
  "points": 4,
  "content": "{\"left\":[\"CPU\",\"RAM\",\"HDD\"],\"right\":[\"obrada\",\"radna memorija\",\"trajno skladiste\"]}",
  "answers": []
}
```

- The pair `left[i]` ↔ `right[i]` is the **correct match**.
- Student response is `{"left_item": "right_item"}` JSON.

### `fill_blank`

```jsonc
{
  "type": "fill_blank",
  "text": "Algoritam ima slozenost ___A___ u prosecnom slucaju i ___B___ u najgorem.",
  "points": 4,
  "content": "{\"blanks\":[{\"id\":\"A\",\"correct\":\"O(n log n)\"},{\"id\":\"B\",\"correct\":\"O(n^2)\"}]}",
  "answers": []
}
```

- Each blank has an `id` (referenced in `text` as `___id___`) and a `correct` string.
- Comparison is case-insensitive trimmed equality.

---

## Endpoints

```http
GET    /api/otisak/questions?subject_id=<uuid>[&search=…][&type=…][&tag=…][&limit=…][&offset=…]
POST   /api/otisak/questions       Body: question shape above (bank entry)
DELETE /api/otisak/questions?id=<uuid>
```

All routes require `admin` or `assistant`. The DELETE endpoint also accepts `id` in the JSON body.

For inline exam questions:

```http
GET    /api/otisak/exams/<exam_id>          (returns exam + questions in the response payload)
POST   /api/otisak/exams/<exam_id>/questions  Body: question shape, no subject_id
DELETE /api/otisak/exams/<exam_id>/questions?id=<uuid>
```

---

## Bulk authoring with another AI

When asking another AI to produce questions, prompt with this template:

> Generate `N` `<type>` questions on `<subject>`. Output a JSON array of objects matching the OTISAK question shape (see `docs/QUESTIONS.md`). Use `tags` for sub-topics. Points should be `<P>` per question. For multi-select use multiple `is_correct: true` entries. Avoid culturally-specific or copyrighted material. Do not include any explanatory prose — just the JSON array.

Then verify each entry passes a quick sanity check:

```bash
node -e '
  const arr = JSON.parse(process.argv[1]);
  for (const q of arr) {
    if (!q.text || !q.type || !Array.isArray(q.answers)) throw new Error("bad shape: " + JSON.stringify(q));
    if (q.type !== "open_text" && !q.answers.some(a => a.is_correct)) throw new Error("no correct answer: " + q.text);
  }
  console.log("OK", arr.length);
' "$(cat questions.json)"
```

---

## Tips

- Keep `text` short and specific. Use code snippets for the technical detail.
- Tag every question. Tags are how the question bank stays useful at scale.
- Aim for distractors (wrong answers) that are *plausible*, not absurd — that's where learning happens.
- Set `partial_scoring` on the exam if you want fractional credit on multi-select / ordering / matching / fill_blank.
- Negative points (`negative_points_*` on the exam) discourage wild guessing — opt in per exam.
