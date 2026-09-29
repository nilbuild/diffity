import type { SVGProps } from 'react';

export function FolderOpenIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M1.75 12.5V3.75a1 1 0 011-1h3l1.5 1.5h5a1 1 0 011 1v1.5" />
      <path d="M1.75 12.5l1.6-5.1a1 1 0 01.95-.7h9.45a.75.75 0 01.72.97l-1.45 4.55a1 1 0 01-.95.7H2.75a1 1 0 01-1-1z" />
    </svg>
  );
}
