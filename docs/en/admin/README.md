# Admin guide

Admin is the highest-privileged role. Admins can do everything: manage users, subjects, all exams, and global settings. The first admin is bootstrapped automatically on initial deploy (see [`architecture/bootstrap.md`](../architecture/bootstrap.md)).

## Tasks

- [Managing users](users.md) — create, edit, change role, reset password, bulk-import via CSV.
- [Subjects and assistant assignments](subjects.md) — create subjects, assign assistants so they can manage exams on that subject.
- [Global settings](settings.md) — practice mode toggle, future settings.
- [The built-in demo exam](demo-exam.md) — what it is, how to remove or replace it.

## First-run checklist

1. Pull the bootstrap admin password out of the container logs (`docker compose logs app | grep -A2 'admin account bootstrapped'`).
2. Log in, **change your own password** from the user edit screen.
3. Create at least one subject (`/subjects`).
4. Assign assistants to that subject (`Asistenti` button on the subject row). Assistants without an assignment see nothing on the `/manage` page.
5. Create the real users via CSV import (`/admin/users` → `Uvezi CSV`).

## What admins can do that assistants can't

| Action | Admin | Assistant |
|---|---|---|
| Create / edit / delete users | ✅ | ❌ |
| Reset any user's password | ✅ | ❌ |
| Create / edit / delete subjects | ✅ | ❌ |
| Assign assistants to subjects | ✅ | ❌ |
| Edit global settings | ✅ | ❌ |
| Manage exams on any subject | ✅ | only assigned |
| Manage question bank for any subject | ✅ | only assigned |

All these gates are enforced at the route level, not just in the UI — see [`architecture/authz.md`](../architecture/authz.md).
