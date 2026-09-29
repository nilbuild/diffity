import type { SVGProps } from 'react';

export function StopIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <rect x="4" y="4" width="8" height="8" rx="1.5" fill="currentColor" stroke="none" />
    </svg>
  );
}
