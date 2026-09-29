import type { SVGProps } from 'react';

export function SparkleIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M8 1.75l1.4 3.6a1.5 1.5 0 00.85.85L13.85 7.6 10.25 9a1.5 1.5 0 00-.85.85L8 13.45 6.6 9.85A1.5 1.5 0 005.75 9L2.15 7.6l3.6-1.4a1.5 1.5 0 00.85-.85z" />
      <path d="M13 11.5v3M11.5 13h3" />
    </svg>
  );
}
