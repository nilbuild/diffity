import type { SVGProps } from 'react';

export function KeyIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <circle cx="5.5" cy="10.5" r="3" />
      <path d="M7.7 8.3l6.05-6.05M11.5 4.5l1.75 1.75M9.75 6.25l1.25 1.25" />
    </svg>
  );
}
