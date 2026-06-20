import { query } from './client';
import { logger } from '../lib/logger';

// Lightweight, idempotent schema migrations executed on every server start.
// We deliberately don't pull in a full migration framework (knex, prisma-migrate,
// ...): the project ships db/schema.sql for fresh installs, and the only DB changes
// after the initial cut are additive columns + backfills + new indexes.
//
// Add new steps at the bottom of the `steps` array. Each step must be:
//   - Idempotent (re-running it doesn't break anything)
//   - Safe on a fresh DB created from db/schema.sql (no-op if schema already matches)
//   - Fast enough to run on every startup (use IF NOT EXISTS, gate backfills
//     with a WHERE clause that excludes already-migrated rows)
//
// The `migrations` table is informational: every successful step is recorded
// on first run with a timestamp, so ops can see "when did this index land?".
// We do NOT gate execution on the table — steps are already idempotent and
// gating would silently skip a step on a DB where the row was hand-removed.
type Step = readonly [id: string, fn: () => Promise<void>];

const steps: readonly Step[] = [
  ['001_multi_answer_column', async () => {
    // The column was added retroactively. Existing rows infer their value from
    // the count of is_correct=true answers via step 002.
    await query(`
      ALTER TABLE otisak_questions
      ADD COLUMN IF NOT EXISTS multi_answer BOOLEAN NOT NULL DEFAULT FALSE
    `);
  }],
  ['002_multi_answer_backfill', async () => {
    // Any question that currently has 2+ correct answers but multi_answer = FALSE
    // was misclassified by old imports. The WHERE NOT multi_answer guard makes
    // this a no-op on every subsequent boot.
    await query(`
      UPDATE otisak_questions q
         SET multi_answer = TRUE
       WHERE NOT q.multi_answer
         AND (
           SELECT COUNT(*) FROM otisak_answers a
            WHERE a.question_id = q.id AND a.is_correct
         ) > 1
    `);
  }],
  ['003_idx_attempts_exam_started', async () => {
    // Many admin queries fetch attempts for an exam in chronological order
    // (live stats, results page, report exports). Composite index lets the
    // planner skip a sort and avoid the table scan for completed exams.
    await query(`
      CREATE INDEX IF NOT EXISTS idx_otisak_attempts_exam_started
        ON otisak_attempts (exam_id, started_at DESC)
    `);
  }],
  ['004_idx_exam_tag_rules_exam', async () => {
    // otisak_exam_tag_rules had no index at all on exam_id; question bank
    // generation joins on it once per exam.
    await query(`
      CREATE INDEX IF NOT EXISTS idx_otisak_exam_tag_rules_exam
        ON otisak_exam_tag_rules (exam_id)
    `);
  }],
  ['005_check_negative_points_value', async () => {
    // NOT VALID lets us add the constraint to future writes without forcing a
    // full-table re-validation of existing rows. If any historic row violates
    // (extremely unlikely — there's no UI path to a negative value), the
    // constraint still rejects new violations.
    await query(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_negative_points_value') THEN
          ALTER TABLE otisak_exams
            ADD CONSTRAINT chk_negative_points_value
            CHECK (negative_points_value >= 0) NOT VALID;
        END IF;
      END $$
    `);
  }],
  ['006_check_negative_points_threshold', async () => {
    await query(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_negative_points_threshold') THEN
          ALTER TABLE otisak_exams
            ADD CONSTRAINT chk_negative_points_threshold
            CHECK (negative_points_threshold >= 0) NOT VALID;
        END IF;
      END $$
    `);
  }],
  ['007_check_question_points_nonneg', async () => {
    await query(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_question_points_nonneg') THEN
          ALTER TABLE otisak_questions
            ADD CONSTRAINT chk_question_points_nonneg
            CHECK (points >= 0) NOT VALID;
        END IF;
      END $$
    `);
  }],
  ['008_exam_tags_column', async () => {
    // Free-form tags on exams. Mirrors otisak_question_bank.tags so the same
    // GIN-indexed array-overlap pattern can be reused for the manage-page
    // filter. Existing rows backfill to '{}' via DEFAULT.
    await query(`
      ALTER TABLE otisak_exams
      ADD COLUMN IF NOT EXISTS tags TEXT[] NOT NULL DEFAULT '{}'
    `);
  }],
  ['009_idx_exam_tags', async () => {
    await query(`
      CREATE INDEX IF NOT EXISTS idx_otisak_exams_tags
        ON otisak_exams USING GIN (tags)
    `);
  }],
  ['010_exam_has_pass_threshold', async () => {
    // Opt-in pass/fail verdict. Default TRUE so every existing exam keeps
    // the historical "Položeno / Nije položeno" rendering — admins flip it
    // off per exam to make results show score-only.
    await query(`
      ALTER TABLE otisak_exams
      ADD COLUMN IF NOT EXISTS has_pass_threshold BOOLEAN NOT NULL DEFAULT TRUE
    `);
  }],
  ['011_app_error_log', async () => {
    // Persistent error store for the observability layer. Server 5xx, job/ws
    // failures, and client-reported errors land here and are surfaced in the
    // admin error viewer. Kept in the same DB so there is no extra infra and no
    // data leaves the server.
    await query(`
      CREATE TABLE IF NOT EXISTS app_error_log (
        id          UUID PRIMARY KEY,
        request_id  TEXT,
        source      TEXT NOT NULL,
        status_code INT,
        code        TEXT,
        name        TEXT,
        message     TEXT,
        stack       TEXT,
        route       TEXT,
        user_id     UUID,
        context     JSONB NOT NULL DEFAULT '{}',
        created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await query(`
      CREATE INDEX IF NOT EXISTS idx_app_error_log_created
        ON app_error_log (created_at DESC)
    `);
    await query(`
      CREATE INDEX IF NOT EXISTS idx_app_error_log_request
        ON app_error_log (request_id)
    `);
  }],
];

export async function runMigrations(): Promise<void> {
  await query(`
    CREATE TABLE IF NOT EXISTS migrations (
      id TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  for (const [id, fn] of steps) {
    await fn();
    // Record the migration as applied. ON CONFLICT DO NOTHING preserves the
    // original applied_at timestamp on subsequent boots (the step itself is a
    // no-op the second time around, so this matches what actually happened).
    await query(
      `INSERT INTO migrations (id) VALUES ($1) ON CONFLICT (id) DO NOTHING`,
      [id]
    );
  }

  logger.info('migrations: schema up to date');
}
