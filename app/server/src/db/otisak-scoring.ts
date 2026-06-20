// Pure, DB-free scoring helpers shared by submitAttemptAnswers (live submit)
// and rescoreExam (replay). Extracted verbatim from the original inline logic
// so both call sites use one source of truth and behavior stays identical.
// Each returns the points awarded for a single answer.

// ordering: strict all-or-nothing. `requireNonEmpty` reproduces a real
// divergence between the two original call sites: submit awarded full points
// when both the correct order and the student order were empty arrays; rescore
// additionally required a non-empty correct order. Pass false from submit,
// true from rescore, to preserve each behavior exactly.
export function scoreOrdering(
  content: string,
  textAnswer: string | null | undefined,
  points: number,
  requireNonEmpty: boolean,
): number {
  try {
    const correctData = JSON.parse(content);
    const correctOrder: string[] = correctData.items || [];
    const studentOrder: string[] = JSON.parse(textAnswer || '[]');
    const matches = JSON.stringify(studentOrder) === JSON.stringify(correctOrder);
    if (requireNonEmpty) {
      if (correctOrder.length > 0 && matches) return points;
    } else if (matches) {
      return points;
    }
  } catch {
    /* invalid JSON -> 0 */
  }
  return 0;
}

// matching: strict all-or-nothing. Every left item must map to its paired right
// item; any mismatch -> 0. Empty pair set -> 0.
export function scoreMatching(
  content: string,
  textAnswer: string | null | undefined,
  points: number,
): number {
  try {
    const correctData = JSON.parse(content);
    const leftArr: string[] = correctData.left || [];
    const rightArr: string[] = correctData.right || [];
    const studentMatches: Record<string, string> = JSON.parse(textAnswer || '{}');
    const totalPairs = leftArr.length;
    let correctCount = 0;
    for (let i = 0; i < leftArr.length; i++) {
      if (studentMatches[leftArr[i]] === rightArr[i]) correctCount++;
    }
    if (totalPairs > 0 && correctCount === totalPairs) return points;
  } catch {
    /* invalid JSON -> 0 */
  }
  return 0;
}

// fill_blank: strict all-or-nothing, case-insensitive and trimmed per blank.
// Any blank wrong or empty -> 0. No blanks -> 0.
export function scoreFillBlank(
  content: string,
  textAnswer: string | null | undefined,
  points: number,
): number {
  try {
    const correctData = JSON.parse(content);
    const blanks: Array<{ id: string; correct: string }> = correctData.blanks || [];
    const studentFills: Record<string, string> = JSON.parse(textAnswer || '{}');
    const totalBlanks = blanks.length;
    let correctCount = 0;
    for (const blank of blanks) {
      const studentVal = (studentFills[blank.id] || '').trim().toLowerCase();
      const correctVal = (blank.correct || '').trim().toLowerCase();
      if (studentVal === correctVal) correctCount++;
    }
    if (totalBlanks > 0 && correctCount === totalBlanks) return points;
  } catch {
    /* invalid JSON -> 0 */
  }
  return 0;
}

export interface MultiChoiceAnswer {
  id: string;
  is_correct: boolean;
}

// single-/multi-choice. Single-correct (totalCorrect <= 1): exactly one pick,
// matching the correct id. Multi-correct: any wrong pick -> 0; all correct ->
// full; a strict correct-only subset -> proportional credit IFF partialScoring.
export function scoreMultiChoice(
  selectedIds: string[],
  allAnswers: MultiChoiceAnswer[],
  points: number,
  partialScoring: boolean,
): number {
  if (selectedIds.length === 0 || allAnswers.length === 0) return 0;
  const correctIds = new Set(allAnswers.filter((a) => a.is_correct).map((a) => a.id));
  const totalCorrect = correctIds.size;
  const selectedSet = new Set(selectedIds);

  if (totalCorrect <= 1) {
    if (selectedIds.length === 1 && correctIds.has(selectedIds[0])) return points;
    return 0;
  }

  const correctSelected = [...selectedSet].filter((id) => correctIds.has(id)).length;
  const wrongSelected = [...selectedSet].filter((id) => !correctIds.has(id)).length;
  if (wrongSelected === 0) {
    if (correctSelected === totalCorrect) return points;
    if (partialScoring && correctSelected > 0) {
      return Math.round((correctSelected / totalCorrect) * points * 100) / 100;
    }
  }
  return 0;
}
