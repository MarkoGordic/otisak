# Authorization

Two layers, both enforced on the server:

1. **Authentication**. Is there a valid session?
2. **Authorization**. Does this user have permission for this action?

The client UI hides controls based on role, but the server is the source of truth.

## Sessions

HMAC-signed cookie. Payload: `{ user_id, expires_at }`. Signing key: `SESSION_SECRET` env.

Files:

- `server/src/session.ts`. Cookie create and parse.
- `server/src/crypto.ts`. HMAC helpers.
- `server/src/session-tracker.ts`. In-memory map of `user_id` to active session. Invalidates other sessions on login from a new device.

Defaults: TTL 7 days, HttpOnly, SameSite=lax, Secure in production.

Login (`POST /api/auth/login`):

1. Rate limit: 10 attempts per 15 minutes per IP.
2. Look up user by email or index number.
3. Bcrypt compare against `password_hash`.
4. On success: generate session, set cookie, update `last_login_at`.

Logout (`POST /api/auth/logout`): clears cookie and tracker.

## requireAuth

`server/src/middleware.ts:requireAuth` runs on every authenticated route:

1. Parse cookie. Missing or bad signature: `401`.
2. Look up the user. `is_active = false`: `401`.
3. Attach to `req.user`.

## requireRole

`requireRole(roles)` gates by role. Usage: `router.use(requireAuth, requireRole(['admin']))`. Returns `403` if role not in the list.

## Subject-scoped authorization

The gate that scopes assistants to their assigned subjects.

### Data

`subject_assignments`: `(user_id, subject_id, role)` with unique `(user_id, subject_id)`. CRUD at `/api/admin/subjects/:subjectId/assignments`.

### Helpers (`server/src/db/auth-helpers.ts`)

| Helper | What |
|---|---|
| `isSubjectManageableByUser(userId, subjectId, isAdmin)` | True if admin or has a row in `subject_assignments` for that subject. |
| `getAssignedSubjectIds(userId)` | Array of subject IDs the user is assigned to. |
| `canUserManageExam(userId, examId, isAdmin)` | Loads `exam.subject_id` then calls `isSubjectManageableByUser`. False if exam has no subject and user is not admin. |

### Where each runs

| Route | Helper |
|---|---|
| `GET /api/otisak/exams` | `getAssignedSubjectIds` (filters listing) |
| `POST /api/otisak/exams` | `isSubjectManageableByUser(body.subject_id)` |
| `PATCH /api/otisak/exams` | `canUserManageExam(body.id)`. If moving subject, also check the new one. |
| `DELETE /api/otisak/exams` | `canUserManageExam` |
| `POST /api/otisak/exams/import-json` | `isSubjectManageableByUser(resolved subject)` |
| All shared writes in `exam.ts` (enroll, questions, start, finish-all, lockdown, requests/decide, adjust-timer) | `assertCanManageExam` (sends `403` on failure) |
| `POST /api/otisak/questions` | `isSubjectManageableByUser(body.subject_id)` |
| `DELETE /api/otisak/questions` | Look up `subject_id` server-side, then `isSubjectManageableByUser` |

The server-side lookup matters. The client can lie about `subject_id`; the server re-derives.

### Admin shortcut

Each helper short-circuits on `isAdmin = true`. Admins see and mutate everything.

### Why not `created_by`?

"Only the creator can edit" breaks multi-assistant subjects. Subject-scoped assignments are the right shape: edit rights belong to the subject, not the individual exam.

## UI hiding

Client hides actions the user can't do. Purely UX. Every gated action also runs the server check. A direct API call against a hidden action gets `403`.

Example: `SubjectsPage.tsx` only renders **Asistenti** for admins. Posting directly to the endpoint as a non-admin still fails via `requireRole(['admin'])`.
