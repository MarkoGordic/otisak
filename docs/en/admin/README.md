# Admin guide

Admin is the highest role. Admins can do everything: manage users, subjects, all exams, all questions, and global settings. The first admin gets created automatically on the first boot (see [`../architecture/bootstrap.md`](../architecture/bootstrap.md)).

## Pages

- [Managing users](users.md). Create, edit, change role, reset password, bulk import from CSV.
- [Subjects and assistant assignments](subjects.md). Create subjects. Assign assistants so they can run exams on that subject.
- [Global settings](settings.md). The practice mode toggle and any future settings.
- [The built-in demo exam](demo-exam.md). What it is, how to remove or replace it.

## First-run checklist

1. Grab the bootstrap admin password from the container logs: `docker compose logs app | grep -A2 'admin account bootstrapped'`.
2. Log in. Change your own password from the user edit screen.
3. Create at least one subject at `/subjects`.
4. Assign assistants to that subject using the **Asistenti** button on the subject row. Assistants with no assignment see an empty `/manage` page.
5. Import students via CSV at `/admin/users` using the **Uvezi CSV** button.

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

These gates run on the server, not just in the UI. See [`../architecture/authz.md`](../architecture/authz.md).
