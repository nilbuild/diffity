import type { SVGProps } from 'react';

export function TreeIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M3 2.5v9a1 1 0 0 0 1 1h2.5" />
      <path d="M3 6.5h3.5" />
      <rect x="8.5" y="4.75" width="5" height="3.5" rx="0.75" />
      <rect x="8.5" y="10.75" width="5" height="3.5" rx="0.75" />
    </svg>
  );
}
