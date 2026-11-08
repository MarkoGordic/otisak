// Question points are NUMERIC in the database, so 0.5 or 1.25 are valid.
// Accept a decimal comma (Serbian keyboards type "1,5") and keep 0; only an
// empty or unparseable value falls back.
export function parsePoints(value: string, fallback: number): number {
  const n = Number(value.trim().replace(',', '.'));
  return value.trim() !== '' && Number.isFinite(n) && n >= 0 ? n : fallback;
}

// Negative points: negative_points_threshold is the number of the first wrong
// answer that is penalized (0 behaves like 1), so threshold - 1 wrong answers
// are free. This is what the server's scoring does; show the free count.
export function freeWrong(exam: { negative_points_threshold?: number | string | null }): number {
  return Math.max(0, Math.round(Number(exam.negative_points_threshold) || 0) - 1);
}
