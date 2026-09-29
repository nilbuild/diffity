import type { SVGProps } from 'react';

export function GitBranchIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <line x1="5" y1="3.5" x2="5" y2="12.5" />
      <circle cx="5" cy="3.5" r="1.5" />
      <circle cx="5" cy="12.5" r="1.5" />
      <circle cx="11" cy="5.5" r="1.5" />
      <path d="M11 7c0 2-2 3.5-6 4" />
    </svg>
  );
}
