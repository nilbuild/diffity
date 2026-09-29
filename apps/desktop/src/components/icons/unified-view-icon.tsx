import type { SVGProps } from 'react';

export function UnifiedViewIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <rect x="1.5" y="1.5" width="13" height="13" rx="2" />
      <line x1="4.5" y1="5.5" x2="11.5" y2="5.5" />
      <line x1="4.5" y1="8" x2="11.5" y2="8" />
      <line x1="4.5" y1="10.5" x2="11.5" y2="10.5" />
    </svg>
  );
}
