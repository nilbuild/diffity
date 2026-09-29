import type { SVGProps } from 'react';

export function UploadIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M8 10V3" />
      <path d="M5 5.5L8 2.5L11 5.5" />
      <path d="M3 10v2.5a1 1 0 001 1h8a1 1 0 001-1V10" />
    </svg>
  );
}
