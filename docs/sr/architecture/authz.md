# Autorizacija

Dva sloja, oba se izvršavaju na serveru:

1. **Autentifikacija**. Postoji li ispravna sesija?
2. **Autorizacija**. Da li ovaj korisnik ima dozvolu za ovu akciju?

Korisnički interfejs sakriva kontrole prema ulozi, ali server je izvor istine.

## Sesije

Kolačić potpisan HMAC-om. Sadržaj: `{ user_id, expires_at }`. Ključ za potpis: `SESSION_SECRET` iz okruženja.

Fajlovi:

- `server/src/session.ts`. Pravljenje i čitanje kolačića.
- `server/src/crypto.ts`. Pomoćne funkcije za HMAC.
- `server/src/session-tracker.ts`. Mapa u memoriji od `user_id` do aktivne sesije. Poništava druge sesije pri prijavi sa novog uređaja.

Podrazumevano: trajanje 7 dana, HttpOnly, SameSite=lax, Secure u produkciji.

Prijava (`POST /api/auth/login`):

1. Ograničenje brzine: 10 pokušaja u 15 minuta po IP adresi.
2. Traži korisnika po email-u ili broju indeksa.
3. Bcrypt poredi sa `password_hash`.
4. Posle uspeha: sesija, kolačić, ažuriraj `last_login_at`.

Odjava (`POST /api/auth/logout`): briše kolačić i upisnik.

## requireAuth

`server/src/middleware.ts:requireAuth` se izvršava na svakoj autentifikovanoj putanji:

1. Čita kolačić. Nema ga ili je potpis loš: `401`.
2. Učitava korisnika. `is_active = false`: `401`.
3. Kači ga na `req.user`.

## requireRole

`requireRole(roles)` proverava ulogu. Upotreba: `router.use(requireAuth, requireRole(['admin']))`. Vraća `403` ako uloga nije u listi.

## Ograničenje po predmetu

Sloj koji asistente ograničava na njihove dodeljene predmete.

### Podaci

`subject_assignments`: `(user_id, subject_id, role)` sa jedinstvenim parom `(user_id, subject_id)`. CRUD putanje su na `/api/admin/subjects/:subjectId/assignments`.

### Pomoćne funkcije (`server/src/db/auth-helpers.ts`)

| Funkcija | Šta radi |
|---|---|
| `isSubjectManageableByUser(userId, subjectId, isAdmin)` | True ako je admin ili postoji red u `subject_assignments` za taj predmet. |
| `getAssignedSubjectIds(userId)` | Vraća niz ID-jeva predmeta za korisnika. |
| `canUserManageExam(userId, examId, isAdmin)` | Učita `exam.subject_id` pa zove `isSubjectManageableByUser`. False ako ispit nema predmet a korisnik nije admin. |

### Gde se svaka koristi

| Putanja | Funkcija |
|---|---|
| `GET /api/otisak/exams` | `getAssignedSubjectIds` (filtrira listu) |
| `POST /api/otisak/exams` | `isSubjectManageableByUser(body.subject_id)` |
| `PATCH /api/otisak/exams` | `canUserManageExam(body.id)`. Ako se menja predmet, proveri i nov. |
| `DELETE /api/otisak/exams` | `canUserManageExam` |
| `POST /api/otisak/exams/import-json` | `isSubjectManageableByUser(prepoznat predmet)` |
| Svi deljeni upisi u `exam.ts` (enroll, questions, start, finish-all, lockdown, requests/decide, adjust-timer) | `assertCanManageExam` (vraća `403` pri odbijanju) |
| `POST /api/otisak/questions` | `isSubjectManageableByUser(body.subject_id)` |
| `DELETE /api/otisak/questions` | Pronađi `subject_id` na serveru, pa `isSubjectManageableByUser` |

Pronalaženje na serveru je važno. Klijent može da lažira `subject_id`; server uvek izvodi sam.

### Prečica za admina

Svaka pomoćna funkcija odmah propušta admina (`isAdmin = true`). Admin vidi i menja sve.

### Zašto ne samo `created_by`?

"Samo onaj ko ga je napravio može da menja" ne radi za predmete sa više asistenata. Dodela po predmetu je pravi oblik: prava izmene pripadaju predmetu, ne pojedinačnom ispitu.

## Sakrivanje u korisničkom interfejsu

Klijent sakriva akcije koje korisnik ne sme da uradi. To je čisto pitanje iskustva. Svaka takva akcija svejedno pokreće proveru na serveru. Direktan API poziv ka sakrivenoj akciji dobija `403`.

Primer: `SubjectsPage.tsx` prikazuje **Asistenti** samo za admina. Direktan POST kao neki drugi korisnik svejedno pada na `requireRole(['admin'])`.
