-- OTISAK seed file.
--
-- Intentionally empty: the bootstrap admin is created by the server on first
-- start (see server/src/bootstrap.ts), students are imported through the
-- admin "Import CSV" button, and subjects / question banks / exams are
-- authored interactively from the UI or via JSON import on the manage page.
--
-- This file exists so deploy.sh --seed remains a no-op friendly hook for
-- future reseeding needs without crashing on missing file.

SELECT 'OTISAK seed.sql is intentionally empty. Nothing to seed.' AS info;
