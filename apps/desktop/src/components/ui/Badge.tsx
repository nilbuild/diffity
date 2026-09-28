import type { HTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

type Tone = 'neutral' | 'accent' | 'success' | 'warning' | 'danger';

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: Tone;
}

const tones: Record<Tone, string> = {
  neutral: 'bg-bg-muted text-fg-muted',
  accent: 'bg-accent-subtle text-accent',
  success: 'bg-success/15 text-success',
  warning: 'bg-warning/15 text-warning',
  danger: 'bg-danger/15 text-danger',
};

export function Badge(props: BadgeProps) {
  const { tone = 'neutral', className, ...rest } = props;
  return (
    <span
      className={cn(
        'inline-flex h-[18px] shrink-0 items-center rounded px-1.5 text-[11px] leading-none font-medium whitespace-nowrap',
        tones[tone],
        className,
      )}
      {...rest}
    />
  );
}
