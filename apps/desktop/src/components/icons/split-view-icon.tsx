import type { SVGProps } from 'react';

export function SplitViewIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <rect x="1.5" y="1.5" width="13" height="13" rx="2" />
      <line x1="8" y1="1.5" x2="8" y2="14.5" />
    </svg>
  );
}
