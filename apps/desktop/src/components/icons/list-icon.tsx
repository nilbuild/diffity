import type { SVGProps } from 'react';

export function ListIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" {...props}>
      <line x1="5.5" y1="4" x2="13.5" y2="4" />
      <line x1="5.5" y1="8" x2="13.5" y2="8" />
      <line x1="5.5" y1="12" x2="13.5" y2="12" />
      <circle cx="2.75" cy="4" r="0.5" fill="currentColor" />
      <circle cx="2.75" cy="8" r="0.5" fill="currentColor" />
      <circle cx="2.75" cy="12" r="0.5" fill="currentColor" />
    </svg>
  );
}
