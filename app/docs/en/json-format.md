# Exam JSON format

The exact shape accepted by **Import exam** and produced by **Export exam**, as a JSON file or as a ZIP with images. This is a reference: for the workflow, see [Managing exams](exams.md) and [Practice exams](practice.md).

JSON import is not only a convenience. `ordering`, `matching` and `fill_blank` questions **cannot be created in the exam editor at all**, so for those types this is the only authoring path.

## Envelope

```json
{
  "version": 1,
  "exam": { },
  "questions": [ ]
}
```

| Key | Required | Notes |
|---|---|---|
| `version` | no | Written by export, never read by import. Informational. |
| `exam` | **yes** | Object. Missing gives `400`. |
| `questions` | **yes** | Array. May be empty, but must be present and an array. |

## ZIP with images

Instead of a bare JSON file you can import a **ZIP**: the exam JSON and its images together. For an `image` question, `content` is then **the image's path inside the ZIP**, relative to the JSON file.

```
midterm.zip
├── exam.json
└── images/
    ├── 01.jpg
    └── 02.png
```

```json
{ "type": "image", "text": "Which topology is shown?", "points": 1, "multi_answer": false,
  "content": "images/01.jpg",
  "answers": [ { "text": "Star", "is_correct": true }, { "text": "Ring", "is_correct": false } ] }
```

- The JSON file can have any name if it is the only one in the ZIP. With several, the one named `exam.json` is imported.
- Everything may sit inside one folder (e.g. `Midterm/exam.json`, `Midterm/images/01.jpg`), which is what **Compress** on macOS or **Send to > Compressed folder** on Windows produces. `__MACOSX` and hidden files are ignored.
- Image names are matched case-insensitively (`01.JPG` and `01.jpg` are the same file).
- Images can be any size up to 25 MB each. The app scales and compresses them itself.
- **If even one image is missing or broken, the import is refused before anything is created**, with a list of the bad names.
- One image can be used by several questions and is stored once.

**Export exam** produces exactly this kind of ZIP as soon as the exam has at least one uploaded image (images go in `images/`). An exam without images exports as plain JSON.

## What the file does not decide

Two things come from the **screen you import on**, not from the file:

- **Subject.** Picked in the import dialog and mandatory. A `subject_name` in the file is ignored.
- **Real or practice.** Import on `/manage` and you get a real exam. Import on `/practice` and you get a practice exam. An `exam_mode` field in the file is ignored, and the app warns you when it finds one.

An imported exam is always created as a **draft**, whichever page you used.

## `exam` fields

Every field except `title` is optional.

| Field | Type | Default | Notes |
|---|---|---|---|
| `title` | string | | **Required.** Trimmed. Missing or empty fails the import. |
| `description` | string | `null` | Shown on the join screen. |
| `duration_minutes` | number | `60` | `0` or an invalid value becomes 60. |
| `pass_threshold` | number | `50` | Percent. `0` becomes 50. Only used when `has_pass_threshold` is on. |
| `has_pass_threshold` | boolean | `true` | `false` shows a score with no pass or fail verdict. |
| `allow_review` | boolean | `false` | Students see correct answers after the exam closes. |
| `shuffle_questions` | boolean | `false` | Random order per attempt, seeded so a refresh does not reshuffle. |
| `shuffle_answers` | boolean | `false` | Random option order within a question. |
| `partial_scoring` | boolean | `false` | Multi-answer choice questions only. See [Scoring](#scoring). |
| `negative_points_enabled` | boolean | `false` | |
| `negative_points_value` | number | `0` | Must be 0 or more. |
| `negative_points_threshold` | number | `0` | Wrong answers that are free before subtraction starts. |

Booleans are coerced loosely: `"true"` and `1` count as true, while `0`, `""` and `null` count as false.

## `questions` fields

| Field | Type | Default | Notes |
|---|---|---|---|
| `type` | string | | **Required.** One of the seven types below. |
| `text` | string | | **Required.** Max 8000 characters. |
| `content` | string | `null` | Max 16000. Meaning depends on `type`, see below. |
| `points` | number | **`0`** | Worth reading twice: a question with no `points` is worth **nothing**. |
| `position` | number | appended | Order in the exam. |
| `explanation` | string | `null` | Max 4000. Shown on the review screen. |
| `ai_grading_instructions` | string | `null` | Max 4000. The grading rubric for `open_text`. |
| `multi_answer` | boolean | derived | Radio vs checkbox. If omitted, two or more correct answers means checkboxes. |
| `answers` | array | `[]` | See below. |

`multi_answer` is authoritative when you set it: `false` shows radio buttons even if several answers are marked correct, and the student can only pick one. Leave it off and it is inferred once, at import, from how many answers are correct. Set it explicitly anyway, so the intent survives later edits to the answer list.

### `answers` entries

| Field | Type | Default | Notes |
|---|---|---|---|
| `text` | string | | **Required.** An entry without it is dropped. |
| `is_correct` | boolean | `false` | |
| `position` | number | array index | |

## Question types

| Type | `content` holds |
|---|---|
| `text` | Nothing. Use `answers`. |
| `code` | The snippet. See below. |
| `image` | An image URL. |
| `open_text` | Nothing. Free-form answer, `answers` must be empty. |
| `ordering` | The correct order, as a JSON string. |
| `matching` | The pairs, as a JSON string. |
| `fill_blank` | The blanks, as a JSON string. |

### text

```json
{
  "type": "text",
  "text": "Which of these are programming languages?",
  "points": 2,
  "multi_answer": true,
  "answers": [
    { "text": "Python", "is_correct": true, "position": 0 },
    { "text": "HTML", "is_correct": false, "position": 1 },
    { "text": "Rust", "is_correct": true, "position": 2 }
  ]
}
```

### code

`content` is a JSON string holding the snippet and its language:

```json
{
  "type": "code",
  "text": "What does this print?",
  "points": 2,
  "content": "{\"snippet\":\"print(2 ** 3)\",\"language\":\"python\"}",
  "answers": [
    { "text": "8", "is_correct": true },
    { "text": "6", "is_correct": false }
  ]
}
```

A plain snippet string also works and renders without syntax highlighting.

### image

`content` is an image path inside a ZIP (see [ZIP with images](#zip-with-images)), an uploaded image URL (`/api/otisak/images/...`), an `http(s)` URL, or a `data:` URL.

```json
{
  "type": "image",
  "text": "Which topology is shown?",
  "points": 1,
  "content": "https://example.com/topology.png",
  "answers": [
    { "text": "Star", "is_correct": true },
    { "text": "Ring", "is_correct": false }
  ]
}
```

The easiest route is a ZIP with the images. Alternatively, upload the image later with **Upload image** in the exam editor. A plain JSON with image paths imported without its ZIP still succeeds; the app warns which images are missing, and those questions wait for an upload in the editor.

A `data:` URL is turned into an uploaded image on import and the question keeps only a short URL. An external `http(s)` URL is not downloaded; it is shown straight from that server, so it disappears if that server does.

### open_text

```json
{
  "type": "open_text",
  "text": "Explain the difference between the stack and the heap.",
  "points": 3,
  "ai_grading_instructions": "Award 3 points if the answer mentions both automatic stack allocation and manual or garbage-collected heap allocation. 1 point for either alone. 0 if neither.",
  "answers": []
}
```

Graded by AI when `ai_grading_instructions` is set, otherwise graded by hand.

### ordering

`content` is a JSON string. `items` **is** the correct order.

```json
{
  "type": "ordering",
  "text": "Put the OSI layers in order, lowest first.",
  "points": 2,
  "content": "{\"items\":[\"Physical\",\"Data link\",\"Network\",\"Transport\"]}",
  "answers": []
}
```

### matching

`content` is a JSON string with two parallel arrays: `left[i]` pairs with `right[i]`.

```json
{
  "type": "matching",
  "text": "Match each component to its role.",
  "points": 2,
  "content": "{\"left\":[\"CPU\",\"RAM\",\"Disk\"],\"right\":[\"Processing\",\"Working memory\",\"Persistent storage\"]}",
  "answers": []
}
```

### fill_blank

`content` is a JSON string listing the blanks. Each blank has an `id` and its `correct` value. The `text` embeds each blank as `___ID___`, three underscores on each side.

```json
{
  "type": "fill_blank",
  "text": "Binary search runs in ___A___ time and needs a ___B___ array.",
  "points": 2,
  "content": "{\"blanks\":[{\"id\":\"A\",\"correct\":\"O(log n)\"},{\"id\":\"B\",\"correct\":\"sorted\"}]}",
  "answers": []
}
```

**Blank ids must be uppercase** (`A`, `B2`, `MY_ID`: letters A to Z, digits and underscores). A lowercase id is not recognised as a placeholder: it shows up as literal text, the student gets no box to type in, and the question scores 0.

## Scoring

| Type | Rule |
|---|---|
| `text`, `code`, `image` single-correct | Right answer scores full points. |
| `text`, `code`, `image` multi-correct | Any wrong pick scores 0. All correct scores full. A correct-only subset scores a proportional share **only if** `partial_scoring` is on, otherwise 0. |
| `ordering` | All or nothing. The order must match exactly. |
| `matching` | All or nothing. Every pair must be right. |
| `fill_blank` | All or nothing. Every blank must be right. Compared case-insensitively, ignoring surrounding spaces. |
| `open_text` | Whatever the AI grader awards, or your manual score. |

`partial_scoring` applies **only** to multi-correct choice questions. It has no effect on `ordering`, `matching` or `fill_blank`: those are always all or nothing.

## Ignored on import

These are accepted and skipped rather than rejected, so older exports keep working:

- `exam_mode`: the page you import on decides. The app warns when a file carries it.
- `subject_name`, `subject_code`: exported as context for a human reading the file.
- `version`.
- Question `tags`: only question-bank questions have tags.

## Not carried by the file at all

Export does not write these and import cannot set them, so **export then import loses them**:

`tags`, `allow_notes`, `allow_calculator`.

These are never settable by import either: `status` (always `draft`), `scheduled_at`, `auto_activate`, `uses_question_bank`, `repeat_interval_minutes`, `is_public`, `self_service`.

## Limits

**A ZIP can be up to 100 MB** (up to 300 MB unpacked, at most 25 MB per image). **A JSON file up to 40 MB**, including any embedded `data:` images.

Per field: `text` 8000 characters, `content` 16000, `explanation` 4000, `ai_grading_instructions` 4000.

## Errors

| Status | Meaning |
|---|---|
| `400` | `exam` or `questions` missing. |
| `400` | No subject picked (`SUBJECT_REQUIRED`). |
| `400` | The picked subject does not exist (admin). |
| `403` | You are an assistant and not assigned to the picked subject. |
| `400` | An image in the ZIP is missing (`MISSING_IMAGES`) or broken (`BAD_IMAGE`). Nothing was created. |
| `400` | The ZIP has no JSON file, has several and none is `exam.json`, or is not a valid ZIP. |
| `413` | The ZIP is over 100 MB (300 MB unpacked), or the JSON is over 40 MB. |
| `500` | `exam.title` is missing, an unknown question `type`, or a field over its length cap. |

Two failure modes behave differently, and it is worth knowing which is which:

- **A question missing `type` or `text` is skipped silently.** The import succeeds with fewer questions than the file had. Check the question count afterwards.
- **An unknown `type` (or an over-long field) aborts with a 500 partway through.** The import is not wrapped in a transaction, so the exam and the questions created before the bad one **stay behind** as a partial draft. Delete or fix it rather than assuming nothing happened.

## Minimal valid file

```json
{
  "exam": { "title": "Quick check" },
  "questions": [
    {
      "type": "text",
      "text": "Is the Earth round?",
      "points": 1,
      "answers": [
        { "text": "Yes", "is_correct": true },
        { "text": "No", "is_correct": false }
      ]
    }
  ]
}
```

Everything else falls back to the defaults in the tables above: 60 minutes, 50% pass threshold, no shuffling, no review.
