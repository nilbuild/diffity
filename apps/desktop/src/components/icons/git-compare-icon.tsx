import type { SVGProps } from 'react';

export function GitCompareIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <circle cx="4" cy="3.5" r="1.5" />
      <circle cx="12" cy="12.5" r="1.5" />
      <path d="M4 5v4.5a2 2 0 0 0 2 2h3" />
      <path d="M7.5 10 9 11.5 7.5 13" />
      <path d="M12 11V6.5a2 2 0 0 0-2-2H7" />
      <path d="M8.5 3 7 4.5 8.5 6" />
    </svg>
  );
}
