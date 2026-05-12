import { query } from './client';

// Lightweight, idempotent schema migrations executed on every server start.
// We deliberately don't pull in a full migration framework (knex, prisma-migrate,
// ...): the project ships init.sql for fresh installs, and the only DB changes
// after the initial cut are additive columns + backfills. ALTER TABLE ... ADD
// COLUMN IF NOT EXISTS is available since PostgreSQL 9.6, so every step here
// is safe to run on a fresh schema (no-op) or an existing one (apply once,
// then no-op forever after).
//
// Add new steps at the bottom. Each step should be:
//   - Idempotent (re-running it doesn't break anything)
//   - Safe on a fresh DB created from init.sql
//   - Fast enough to run on every startup (no full table rewrites on hot
//     paths — backfill UPDATE only touches rows that haven't been migrated
//     yet via a WHERE guard).
export async function runMigrations(): Promise<void> {
  // ---------------------------------------------------------------------------
  // 1. otisak_questions.multi_answer
  // ---------------------------------------------------------------------------
  // The column was added retroactively. Existing rows infer their value from
  // the count of is_correct=true answers. New rows get explicit values from
  // createOtisakQuestion / JSON import.
  await query(`
    ALTER TABLE otisak_questions
    ADD COLUMN IF NOT EXISTS multi_answer BOOLEAN NOT NULL DEFAULT FALSE
  `);

  // Backfill: any question that currently has 2+ correct answers but
  // multi_answer = FALSE was misclassified by old imports. Flip it.
  // We only touch rows that still need it (the WHERE NOT multi_answer guard),
  // so this becomes a no-op on every subsequent boot.
  await query(`
    UPDATE otisak_questions q
       SET multi_answer = TRUE
     WHERE NOT q.multi_answer
       AND (
         SELECT COUNT(*) FROM otisak_answers a
          WHERE a.question_id = q.id AND a.is_correct
       ) > 1
  `);

  console.log('Migrations: schema up to date.');
}
