import type { SVGProps } from 'react';

export function GitPullRequestIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <circle cx="4.5" cy="3.5" r="1.5" />
      <circle cx="4.5" cy="12.5" r="1.5" />
      <circle cx="11.5" cy="12.5" r="1.5" />
      <line x1="4.5" y1="5" x2="4.5" y2="11" />
      <path d="M11.5 11V6.5a2 2 0 0 0-2-2H7" />
      <path d="M8.5 3 7 4.5 8.5 6" />
    </svg>
  );
}
