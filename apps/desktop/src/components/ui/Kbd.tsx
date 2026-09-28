import type { HTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

export function Kbd(props: HTMLAttributes<HTMLElement>) {
  const { className, ...rest } = props;
  return (
    <kbd
      className={cn(
        'inline-flex h-[18px] min-w-[18px] items-center justify-center rounded border border-border bg-bg-subtle px-1 font-sans text-[11px] text-fg-muted',
        className,
      )}
      {...rest}
    />
  );
}
