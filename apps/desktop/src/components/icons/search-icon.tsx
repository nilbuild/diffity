import type { SVGProps } from 'react';

export function SearchIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <circle cx="7" cy="7" r="4.5" />
      <line x1="10.2" y1="10.2" x2="14" y2="14" />
    </svg>
  );
}
