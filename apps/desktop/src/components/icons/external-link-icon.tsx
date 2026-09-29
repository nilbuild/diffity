import type { SVGProps } from 'react';

export function ExternalLinkIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M6 3h7v7" />
      <path d="M13 3L6 10" />
    </svg>
  );
}
