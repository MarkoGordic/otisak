// Wall-clock time for everything a person reads off a report or a filename.
// The container runs in UTC, so formatting without an explicit zone would put
// every time an hour or two off from what the students saw on the clock.
export const REPORT_TIME_ZONE = process.env.OTISAK_TIME_ZONE || 'Europe/Belgrade';

function parts(date: Date | string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const p of new Intl.DateTimeFormat('en-GB', {
    timeZone: REPORT_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(date))) {
    out[p.type] = p.value;
  }
  return out;
}

// Filename-safe stamp, e.g. 2026-05-12_14-32.
export function fileStamp(date: Date | string): string {
  const p = parts(date);
  return `${p.year}-${p.month}-${p.day}_${p.hour}-${p.minute}`;
}
