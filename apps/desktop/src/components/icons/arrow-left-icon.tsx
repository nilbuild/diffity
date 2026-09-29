import type { SVGProps } from 'react';

export function ArrowLeftIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M13 8H3" />
      <path d="M7 4 3 8l4 4" />
    </svg>
  );
}
