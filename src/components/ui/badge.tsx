import type { ReactNode } from 'react';
import { cn } from '../../lib/cn';

interface BadgeProps {
  children: ReactNode;
  className?: string;
  title?: string;
}

export function Badge(props: BadgeProps) {
  const { children, className, title } = props;

  return (
    <span className={cn('text-[11px] leading-4 px-1.5 rounded font-medium shrink-0', className)} title={title}>
      {children}
    </span>
  );
}
