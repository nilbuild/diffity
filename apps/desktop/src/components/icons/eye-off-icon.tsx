import type { SVGProps } from 'react';

export function EyeOffIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M2 2l12 12" />
      <path d="M6.5 6.5a2 2 0 0 0 2.83 2.83" />
      <path d="M4.2 4.2C2.7 5.3 1.5 8 1.5 8s2.5 4.5 6.5 4.5c1.3 0 2.5-.4 3.5-1" />
      <path d="M12.5 10.5c1-1.1 2-2.5 2-2.5s-2.5-4.5-6.5-4.5c-.5 0-1 .05-1.5.15" />
    </svg>
  );
}
