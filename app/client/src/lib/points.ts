// Question points are NUMERIC in the database, so 0.5 or 1.25 are valid.
// Accept a decimal comma (Serbian keyboards type "1,5") and keep 0; only an
// empty or unparseable value falls back.
export function parsePoints(value: string, fallback: number): number {
  const n = Number(value.trim().replace(',', '.'));
  return value.trim() !== '' && Number.isFinite(n) && n >= 0 ? n : fallback;
}
