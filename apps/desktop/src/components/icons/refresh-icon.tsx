import type { SVGProps } from 'react';

export function RefreshIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M13.25 8a5.25 5.25 0 01-9.2 3.46" />
      <path d="M2.75 8a5.25 5.25 0 019.2-3.46" />
      <path d="M12.5 1.75v2.75H9.75" />
      <path d="M3.5 14.25V11.5h2.75" />
    </svg>
  );
}
