import type { SVGProps } from 'react';

export function GitCommitIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <circle cx="8" cy="8" r="2.5" />
      <line x1="1.5" y1="8" x2="5.5" y2="8" />
      <line x1="10.5" y1="8" x2="14.5" y2="8" />
    </svg>
  );
}
