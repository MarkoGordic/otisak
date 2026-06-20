// OTISAK Database Operations
// ========================================

import { query } from './client';
import type {
  OtisakExamTagRule,
  CreateOtisakExamTagRuleInput,
} from './otisak-types';

// ========================================
// TAG RULES
// ========================================

export async function getExamTagRules(examId: string): Promise<OtisakExamTagRule[]> {
  const result = await query<OtisakExamTagRule>(
    'SELECT * FROM otisak_exam_tag_rules WHERE exam_id = $1 ORDER BY position ASC',
    [examId]
  );
  return result.rows;
}

export async function setExamTagRules(
  examId: string,
  rules: CreateOtisakExamTagRuleInput[]
): Promise<OtisakExamTagRule[]> {
  await query('DELETE FROM otisak_exam_tag_rules WHERE exam_id = $1', [examId]);
  const results: OtisakExamTagRule[] = [];
  for (let i = 0; i < rules.length; i++) {
    const rule = rules[i];
    const result = await query<OtisakExamTagRule>(
      `INSERT INTO otisak_exam_tag_rules (exam_id, tag, question_count, points_per_question, position)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [examId, rule.tag, rule.question_count, rule.points_per_question ?? 2, i]
    );
    results.push(result.rows[0]);
  }
  return results;
}
