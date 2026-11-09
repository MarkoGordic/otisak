// Question points are NUMERIC in the database, so 0.5 or 1.25 are valid.
// Accept a decimal comma (Serbian keyboards type "1,5") and keep 0; only an
// empty or unparseable value falls back.
export function parsePoints(value: string, fallback: number): number {
  const n = Number(value.trim().replace(',', '.'));
  return value.trim() !== '' && Number.isFinite(n) && n >= 0 ? n : fallback;
}

// Negative points: negative_points_threshold is how many wrong answers it
// takes for the penalty to apply (0 behaves like 1). Once reached, every wrong
// answer is penalized, the earlier ones included. Mirrors the server scoring.
export function penaltyFrom(exam: { negative_points_threshold?: number | string | null }): number {
  return Math.max(1, Math.round(Number(exam.negative_points_threshold) || 0));
}
