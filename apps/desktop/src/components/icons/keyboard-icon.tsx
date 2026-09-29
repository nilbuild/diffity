import type { SVGProps } from 'react';

export function KeyboardIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <rect x="1" y="3.5" width="14" height="9" rx="2" />
      <line x1="4" y1="6.5" x2="5" y2="6.5" />
      <line x1="7.5" y1="6.5" x2="8.5" y2="6.5" />
      <line x1="11" y1="6.5" x2="12" y2="6.5" />
      <line x1="5" y1="9.5" x2="11" y2="9.5" />
    </svg>
  );
}
