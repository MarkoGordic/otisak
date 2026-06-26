import type { SVGProps } from 'react';
import { US, RS } from 'country-flag-icons/react/3x2';

// Flags for the language picker: US (English), Serbia (Serbian Latin/Cyrillic),
// and Republika Srpska (Serbian Cyrillic ijekavica). US/RS come from
// country-flag-icons; Republika Srpska is not an ISO country so it is drawn
// inline as its red/blue/white horizontal tricolor.

export type FlagCode = 'us' | 'rs' | 'srpska';

// Flag of Republika Srpska: equal horizontal stripes, red over blue over white.
// Colours match the Serbia flag used alongside it so the menu stays consistent.
function RepublikaSrpska({ title, ...props }: SVGProps<SVGSVGElement> & { title?: string }) {
  return (
    <svg viewBox="0 0 3 2" preserveAspectRatio="none" {...props}>
      {title ? <title>{title}</title> : null}
      <rect width="3" height="2" fill="#FFFFFF" />
      <rect width="3" height="0.6667" y="0" fill="#C6363C" />
      <rect width="3" height="0.6667" y="0.6667" fill="#0C4076" />
    </svg>
  );
}

const FLAGS = { us: US, rs: RS, srpska: RepublikaSrpska } as const;

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
