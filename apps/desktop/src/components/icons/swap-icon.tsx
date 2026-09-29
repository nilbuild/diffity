import type { SVGProps } from 'react';

export function SwapIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M5 2.5v11" />
      <path d="M2.5 11 5 13.5 7.5 11" />
      <path d="M11 13.5v-11" />
      <path d="M8.5 5 11 2.5 13.5 5" />
    </svg>
  );
}
