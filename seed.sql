-- OTISAK seed file.
--
-- Replaces every non-admin user with a fresh demo cohort: one assistant and a
-- small set of students with @example.com emails and generic names. Use it to
-- reset the demo environment without touching the bootstrap admin, the demo
-- exam, or any subjects you created in the UI.
--
-- Apply with: deploy.sh --seed  (or psql -f seed.sql on the running DB)
--
-- The password hash below is bcrypt(10) of "changeme". Tell users to change
-- it on first login.

BEGIN;

-- Cascades through enrollments, attempts, attempt_answers, exam_requests,
-- exam_activity_log, ai_credit_*, student_groups, subject_assignments. Keeps
-- admins so the operator running the seed doesn't lock themselves out, and
-- keeps subjects/exams (their `created_by` flips to NULL via SET NULL).
DELETE FROM users WHERE role <> 'admin';

-- Assistant account. No index_number — assistants don't need one.
INSERT INTO users (email, password_hash, name, role, index_number) VALUES
  ('asistent@example.com', '$2a$10$jvQhLNKsNlkI12H/fXTf6OAJQ/Rj.k01gfZ1Sg5SATO/Pa3BUpOnC', 'Tara Tarić', 'assistant', NULL);

-- Student cohort. Index format kept generic (letters + digits + year) so the
-- UI's "Pristupi po indeksu" flow still validates. Emails are synthetic and
-- collision-free across the cohort.
INSERT INTO users (email, password_hash, name, role, index_number) VALUES
  ('ra1-2025@example.com',  '$2a$10$jvQhLNKsNlkI12H/fXTf6OAJQ/Rj.k01gfZ1Sg5SATO/Pa3BUpOnC', 'Marko Marković',     'student', 'ra1-2025'),
  ('ra2-2025@example.com',  '$2a$10$jvQhLNKsNlkI12H/fXTf6OAJQ/Rj.k01gfZ1Sg5SATO/Pa3BUpOnC', 'Ana Anić',           'student', 'ra2-2025'),
  ('ra3-2025@example.com',  '$2a$10$jvQhLNKsNlkI12H/fXTf6OAJQ/Rj.k01gfZ1Sg5SATO/Pa3BUpOnC', 'Petar Petrović',     'student', 'ra3-2025'),
  ('ra4-2025@example.com',  '$2a$10$jvQhLNKsNlkI12H/fXTf6OAJQ/Rj.k01gfZ1Sg5SATO/Pa3BUpOnC', 'Jelena Jović',       'student', 'ra4-2025'),
  ('ra5-2025@example.com',  '$2a$10$jvQhLNKsNlkI12H/fXTf6OAJQ/Rj.k01gfZ1Sg5SATO/Pa3BUpOnC', 'Stefan Stefanović',  'student', 'ra5-2025'),
  ('ra6-2025@example.com',  '$2a$10$jvQhLNKsNlkI12H/fXTf6OAJQ/Rj.k01gfZ1Sg5SATO/Pa3BUpOnC', 'Milica Milić',       'student', 'ra6-2025'),
  ('ra7-2025@example.com',  '$2a$10$jvQhLNKsNlkI12H/fXTf6OAJQ/Rj.k01gfZ1Sg5SATO/Pa3BUpOnC', 'Nikola Nikolić',     'student', 'ra7-2025'),
  ('ra8-2025@example.com',  '$2a$10$jvQhLNKsNlkI12H/fXTf6OAJQ/Rj.k01gfZ1Sg5SATO/Pa3BUpOnC', 'Sara Sarić',         'student', 'ra8-2025'),
  ('ra9-2025@example.com',  '$2a$10$jvQhLNKsNlkI12H/fXTf6OAJQ/Rj.k01gfZ1Sg5SATO/Pa3BUpOnC', 'Aleksa Aleksić',     'student', 'ra9-2025'),
  ('ra10-2025@example.com', '$2a$10$jvQhLNKsNlkI12H/fXTf6OAJQ/Rj.k01gfZ1Sg5SATO/Pa3BUpOnC', 'Jovana Jovanović',   'student', 'ra10-2025'),
  ('ra11-2025@example.com', '$2a$10$jvQhLNKsNlkI12H/fXTf6OAJQ/Rj.k01gfZ1Sg5SATO/Pa3BUpOnC', 'Filip Filipović',    'student', 'ra11-2025'),
  ('ra12-2025@example.com', '$2a$10$jvQhLNKsNlkI12H/fXTf6OAJQ/Rj.k01gfZ1Sg5SATO/Pa3BUpOnC', 'Tamara Tomić',       'student', 'ra12-2025'),
  ('ra13-2025@example.com', '$2a$10$jvQhLNKsNlkI12H/fXTf6OAJQ/Rj.k01gfZ1Sg5SATO/Pa3BUpOnC', 'Dušan Dušanović',    'student', 'ra13-2025'),
  ('ra14-2025@example.com', '$2a$10$jvQhLNKsNlkI12H/fXTf6OAJQ/Rj.k01gfZ1Sg5SATO/Pa3BUpOnC', 'Maja Majić',         'student', 'ra14-2025'),
  ('ra15-2025@example.com', '$2a$10$jvQhLNKsNlkI12H/fXTf6OAJQ/Rj.k01gfZ1Sg5SATO/Pa3BUpOnC', 'Lazar Lazarević',    'student', 'ra15-2025'),
  ('ra16-2025@example.com', '$2a$10$jvQhLNKsNlkI12H/fXTf6OAJQ/Rj.k01gfZ1Sg5SATO/Pa3BUpOnC', 'Iva Ivić',           'student', 'ra16-2025'),
  ('ra17-2025@example.com', '$2a$10$jvQhLNKsNlkI12H/fXTf6OAJQ/Rj.k01gfZ1Sg5SATO/Pa3BUpOnC', 'Vuk Vuković',        'student', 'ra17-2025'),
  ('ra18-2025@example.com', '$2a$10$jvQhLNKsNlkI12H/fXTf6OAJQ/Rj.k01gfZ1Sg5SATO/Pa3BUpOnC', 'Mila Milinković',    'student', 'ra18-2025'),
  ('ra19-2025@example.com', '$2a$10$jvQhLNKsNlkI12H/fXTf6OAJQ/Rj.k01gfZ1Sg5SATO/Pa3BUpOnC', 'Đorđe Đorđević',     'student', 'ra19-2025'),
  ('ra20-2025@example.com', '$2a$10$jvQhLNKsNlkI12H/fXTf6OAJQ/Rj.k01gfZ1Sg5SATO/Pa3BUpOnC', 'Helena Hrustić',     'student', 'ra20-2025');

COMMIT;

SELECT 'OTISAK seed: ' || COUNT(*) || ' users present (incl. admin).' AS info FROM users;
