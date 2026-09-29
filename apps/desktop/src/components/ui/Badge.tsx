import type { ReactNode } from 'react';
import { cn } from '../../lib/cn';

interface BadgeProps {
  children: ReactNode;
  className?: string;
}

export function Badge(props: BadgeProps) {
  const { children, className } = props;

  return (
    <span className={cn('text-[11px] leading-4 px-1.5 rounded font-medium shrink-0', className)}>
      {children}
    </span>
  );
}
