import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/cn';

export type BadgeTone = 'neutral' | 'accent' | 'success' | 'warning' | 'danger' | 'info';

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone;
}

const tones: Record<BadgeTone, string> = {
  neutral: 'bg-fg-subtle/15 text-fg-muted',
  accent: 'bg-accent/15 text-accent',
  success: 'bg-success/15 text-success',
  warning: 'bg-warning/15 text-warning',
  danger: 'bg-danger/15 text-danger',
  info: 'bg-info/15 text-info',
};

export function Badge(props: BadgeProps) {
  const { tone = 'neutral', className, ...rest } = props;
  return (
    <span
      className={cn(
        'inline-flex h-[18px] shrink-0 items-center gap-1 rounded-full px-1.5 text-2xs leading-none font-medium whitespace-nowrap',
        tones[tone],
        className,
      )}
      {...rest}
    />
  );
}

export interface CountBadgeProps {
  count: number;
  tone?: BadgeTone;
  icon?: ReactNode;
  className?: string;
  title?: string;
}

export function CountBadge(props: CountBadgeProps) {
  const { count, tone = 'accent', icon, className, title } = props;
  return (
    <span
      title={title}
      className={cn(
        'inline-flex h-4 min-w-4 shrink-0 items-center justify-center gap-0.5 rounded-full px-1.5 text-2xs leading-none font-semibold tabular-nums',
        tones[tone],
        className,
      )}
    >
      {icon}
      {count}
    </span>
  );
}
