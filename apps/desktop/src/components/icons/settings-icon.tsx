import type { SVGProps } from 'react';

export function SettingsIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <circle cx="8" cy="8" r="2" />
      <path d="M8 1.5v1.5M8 13v1.5M1.5 8H3M13 8h1.5M3.4 3.4l1.06 1.06M11.54 11.54l1.06 1.06M3.4 12.6l1.06-1.06M11.54 4.46l1.06-1.06" />
      <circle cx="8" cy="8" r="4.5" />
    </svg>
  );
}
