# Managing users

Screen: `/admin/users`. Admin only.

## Roles

| Role | What |
|---|---|
| `student` | Takes exams. |
| `assistant` | Manages exams on assigned subjects. See [Subjects](subjects.md). |
| `admin` | Full access. |

Change role from the dropdown on a row.

## Add one user

**Dodaj korisnika** opens a form: email, password, name, index number, role. Email and password are required. Calls `POST /api/auth/register`. Bcrypt rounds 12.

## CSV bulk import

**Uvezi CSV** picks a file. Header-less, four columns:

```
id,ime,prezime,indeks
1,Marko,Petrović,ra1-2025
```

Per row:

1. Index lowercased, whitespace stripped.
2. Email = `<surname>.<smer><N>.<year>@example.edu` if index matches `xxNNN-YYYY`, otherwise `<index>@example.edu`.
3. Existing users (by index or email) are skipped, not overwritten.
4. Default password: `changeme`. Bcrypt rounds 10.

Runs in chunks of 25. Summary at end shows created, skipped, and reasons.

## Edit

Pencil icon. Modal lets you change name, email, index, role, `is_active`.

Email is unique-checked. Duplicate returns `409` with toast `users.emailExists`.

`is_active = false` blocks login but keeps data.

## Password reset

Key icon. Minimum 6 chars. Bcrypt rounds 10. Tell the user out-of-band.

## Search and filter

- Search box: matches name, email, index (case-insensitive).
- Role dropdown: filter to one role.
- Pagination: 50 rows per page.

## What admins can do that assistants can't

| Action | Admin | Assistant |
|---|---|---|
| Create, edit, delete users | yes | no |
| Reset any user's password | yes | no |
| Create, edit, delete subjects | yes | no |
| Assign assistants to subjects | yes | no |
| Change global settings | yes | no |
| Manage exams on any subject | yes | only assigned |
| Manage bank questions on any subject | yes | only assigned |

All gates run on the server, not just in the UI.

## API

| Endpoint | Body / Use |
|---|---|
| `GET /api/admin/users` | List. Hashes stripped. |
| `PATCH /api/admin/users` | `{ id, name?, email?, role?, index_number?, is_active? }` |
| `PATCH /api/admin/users/password` | `{ id, password }` |
| `POST /api/admin/users/import-csv` | `{ csv: "..." }` |
