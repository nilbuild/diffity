import type { SVGProps } from 'react';

export function SidebarIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <rect x="1.5" y="2.5" width="13" height="11" rx="2" />
      <line x1="5.5" y1="2.5" x2="5.5" y2="13.5" />
    </svg>
  );
}
