# Autorizacija

Dva sloja, oba se izvršavaju na serveru:

1. **Autentifikacija**. Postoji li validna sesija?
2. **Autorizacija**. Da li korisnik ima dozvolu za ovu akciju?

Client UI sakriva kontrole na osnovu uloge, ali server je izvor istine.

## Sesije

HMAC-signed cookie. Payload: `{ user_id, expires_at }`. Signing key: `SESSION_SECRET` env.

Fajlovi:

- `server/src/session.ts`. Kreiranje i parsiranje cookie-a.
- `server/src/crypto.ts`. HMAC helperi.
- `server/src/session-tracker.ts`. In-memory mapa `user_id` na aktivnu sesiju. Invalidira druge sesije pri loginu sa novog uređaja.

Default-i: TTL 7 dana, HttpOnly, SameSite=lax, Secure u produkciji.

Login (`POST /api/auth/login`):

1. Rate limit: 10 pokušaja u 15 minuta po IP-u.
2. Pronalazak korisnika po email-u ili broju indeksa.
3. Bcrypt compare na `password_hash`.
4. Po uspehu: sesija, cookie, ažuriraj `last_login_at`.

Logout (`POST /api/auth/logout`): briše cookie i tracker.

## requireAuth

`server/src/middleware.ts:requireAuth` na svakoj autentifikovanoj ruti:

1. Parsuje cookie. Nema ili loš potpis: `401`.
2. Učita korisnika. `is_active = false`: `401`.
3. Prikači na `req.user`.

## requireRole

`requireRole(roles)` proverava ulogu. Upotreba: `router.use(requireAuth, requireRole(['admin']))`. Vraća `403` ako uloga nije u listi.

## Subject-scoped autorizacija

Gate koji scope-uje asistente na njihove dodeljene predmete.

### Podaci

`subject_assignments`: `(user_id, subject_id, role)` sa unique `(user_id, subject_id)`. CRUD na `/api/admin/subjects/:subjectId/assignments`.

### Helperi (`server/src/db/auth-helpers.ts`)

| Helper | Šta |
|---|---|
| `isSubjectManageableByUser(userId, subjectId, isAdmin)` | True ako je admin ili ima red u `subject_assignments` za predmet. |
| `getAssignedSubjectIds(userId)` | Niz subject ID-jeva. |
| `canUserManageExam(userId, examId, isAdmin)` | Učita `exam.subject_id` pa zove `isSubjectManageableByUser`. False ako ispit nema subject a korisnik nije admin. |

### Gde se svaki izvršava

| Ruta | Helper |
|---|---|
| `GET /api/otisak/exams` | `getAssignedSubjectIds` (filtrira listu) |
| `POST /api/otisak/exams` | `isSubjectManageableByUser(body.subject_id)` |
| `PATCH /api/otisak/exams` | `canUserManageExam(body.id)`. Ako se menja subject, i njega proveri. |
| `DELETE /api/otisak/exams` | `canUserManageExam` |
| `POST /api/otisak/exams/import-json` | `isSubjectManageableByUser(resolved subject)` |
| Svi shared writes u `exam.ts` (enroll, questions, start, finish-all, lockdown, requests/decide, adjust-timer) | `assertCanManageExam` (`403` na neuspeh) |
| `POST /api/otisak/questions` | `isSubjectManageableByUser(body.subject_id)` |
| `DELETE /api/otisak/questions` | Lookup `subject_id` server-side, pa `isSubjectManageableByUser` |

Server-side lookup je važan. Klijent može da slaže za `subject_id`; server uvek re-derivuje.

### Admin shortcut

Svaki helper short-circuit-uje na `isAdmin = true`. Admin vidi i menja sve.

### Zašto ne samo `created_by`?

"Samo kreator može da menja" lomi multi-asistentske predmete. Subject-scoped dodele su pravi oblik: editorska prava pripadaju predmetu, ne pojedinačnom ispitu.

## Skrivanje u UI-ju

Klijent sakriva akcije koje korisnik ne sme. Čisto UX. Svaka gatovana akcija takođe pokreće server proveru. Direktni API poziv ka skrivenoj akciji dobija `403`.

Primer: `SubjectsPage.tsx` prikazuje **Asistenti** samo za admina. Direktan POST kao non-admin svejedno pada na `requireRole(['admin'])`.
