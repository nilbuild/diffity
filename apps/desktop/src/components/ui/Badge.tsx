import type { ReactNode } from 'react';
import { cn } from '../../lib/cn';

interface BadgeProps {
  children: ReactNode;
  className?: string;
}

export function Badge(props: BadgeProps) {
  const { children, className } = props;

  return (
    <span className={cn('text-xs px-1.5 py-px rounded font-semibold shrink-0', className)}>
      {children}
    </span>
  );
}
