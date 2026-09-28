import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/cn';

export type BadgeTone = 'neutral' | 'accent' | 'success' | 'warning' | 'danger' | 'info';

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone;
}

const tones: Record<BadgeTone, string> = {
  neutral: 'bg-muted text-fg-muted',
  accent: 'bg-accent-soft text-accent',
  success: 'bg-success/12 text-success',
  warning: 'bg-warning/12 text-warning',
  danger: 'bg-danger/12 text-danger',
  info: 'bg-info/12 text-info',
};

export function Badge(props: BadgeProps) {
  const { tone = 'neutral', className, ...rest } = props;
  return (
    <span
      className={cn(
        'inline-flex h-[18px] shrink-0 items-center gap-1 rounded-sm px-1.5 text-2xs leading-none font-medium whitespace-nowrap',
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
