// Small inline SVG flags for the language picker. Inline (not emoji) so they
// render identically across platforms - emoji flags fall back to letters on
// Windows. Simplified but recognizable at ~18px. viewBox is 24x16 (3:2).

export type FlagCode = 'us' | 'rs' | 'ba';

const US_STRIPES = Array.from({ length: 13 }, (_, i) => i).filter((i) => i % 2 === 0);
const US_STARS: Array<[number, number]> = [];
for (let r = 0; r < 3; r++) {
  for (let c = 0; c < 4; c++) {
    US_STARS.push([1.2 + c * 2.4, 1.1 + r * 2.4]);
  }
}
// Bosnia stars: along the diagonal between the blue field and the yellow triangle.
const BA_STARS: Array<[number, number]> = [
  [5.2, 2.0],
  [3.6, 5.2],
  [2.2, 8.4],
  [3.6, 11.6],
  [5.2, 14.0],
];

export function Flag({ code, size = 18, className = '' }: { code: FlagCode; size?: number; className?: string }) {
  const w = Math.round((size * 3) / 2);
  const common = {
    width: w,
    height: size,
    viewBox: '0 0 24 16',
    className: `inline-block rounded-[2px] ring-1 ring-black/10 shrink-0 ${className}`,
    role: 'img' as const,
  };

  if (code === 'us') {
    return (
      <svg {...common} aria-label="USA">
        <rect width="24" height="16" fill="#fff" />
        {US_STRIPES.map((i) => (
          <rect key={i} y={(i * 16) / 13} width="24" height={16 / 13} fill="#B22234" />
        ))}
        <rect width="10.2" height={(16 / 13) * 7} fill="#3C3B6E" />
        {US_STARS.map(([cx, cy], i) => (
          <circle key={i} cx={cx} cy={cy} r="0.5" fill="#fff" />
        ))}
      </svg>
    );
  }

  if (code === 'rs') {
    // Serbian civil tricolor: red over blue over white (distinct from Russia).
    return (
      <svg {...common} aria-label="Serbia">
        <rect width="24" height="16" fill="#fff" />
        <rect width="24" height="5.33" fill="#C6363C" />
        <rect y="5.33" width="24" height="5.34" fill="#0C4076" />
      </svg>
    );
  }

  // Bosnia and Herzegovina: blue field, yellow triangle, white stars on the diagonal.
  return (
    <svg {...common} aria-label="Bosnia and Herzegovina">
      <rect width="24" height="16" fill="#002395" />
      <polygon points="6,0 24,0 24,16" fill="#FECB00" />
      {BA_STARS.map(([cx, cy], i) => (
        <circle key={i} cx={cx} cy={cy} r="0.9" fill="#fff" />
      ))}
    </svg>
  );
}
