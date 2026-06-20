import { US, RS, BA } from 'country-flag-icons/react/3x2';

// Accurate country flags for the language picker (US, Serbia, Bosnia and
// Herzegovina). Uses country-flag-icons SVG components so the flags are
// correct and crisp at any size, and render identically across platforms.

export type FlagCode = 'us' | 'rs' | 'ba';

const FLAGS = { us: US, rs: RS, ba: BA } as const;

export function Flag({
  code,
  size = 18,
  className = '',
}: {
  code: FlagCode;
  size?: number;
  className?: string;
}) {
  const FlagSvg = FLAGS[code];
  const width = Math.round((size * 3) / 2);
  return (
    <FlagSvg
      title=""
      style={{ width, height: size }}
      className={`inline-block rounded-[2px] object-cover ring-1 ring-black/10 shrink-0 ${className}`}
    />
  );
}
