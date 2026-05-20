# Subjects and assistant assignments

Screen: `/subjects`. Subjects group exams and bank questions. Each exam and bank question belongs to one subject. Assistants are scoped per subject.

## Create

**Dodaj predmet**. Fields: name (required), code (short id on exam cards), description.

## Edit and delete

- Pencil icon: inline edit.
- Trash icon: delete. Cascades: all exams and bank questions for the subject are deleted too. Admin only.

## Assistants

**Asistenti** button (admin only) opens the assignments panel.

- Top half: current assignments. **Ukloni** removes.
- Bottom half: searchable picker. **Dodeli** adds. Only users with role `assistant` or `admin` show up.

Each click hits the server immediately. No save button.

## What an assignment unlocks

Assigned assistants can, for that subject:

- See and list exams.
- Create, edit, delete, activate, complete exams.
- Add and delete inline and bank questions.
- Run the live room: lockdown, timer, finish-all, approve late-join requests.

They cannot move an exam to an unassigned subject (`403`). Unassigned subjects don't appear in their `/manage`.

## API

| Endpoint | Body / Use |
|---|---|
| `GET /api/admin/subjects/:subjectId/assignments` | List. |
| `POST /api/admin/subjects/:subjectId/assignments` | `{ user_id, role? }`. Default `assistant`. |
| `DELETE /api/admin/subjects/:subjectId/assignments/:userId` | Remove. |
