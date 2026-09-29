import type { SVGProps } from 'react';

export function DownloadIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M8 2.5v7.5" />
      <path d="M5 7.5L8 10.5L11 7.5" />
      <path d="M3 10v2.5a1 1 0 001 1h8a1 1 0 001-1V10" />
    </svg>
  );
}
