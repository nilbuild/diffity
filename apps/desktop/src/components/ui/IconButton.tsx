import type { ComponentProps } from 'react';
import { cn } from '@/lib/cn';

export interface IconButtonProps extends ComponentProps<'button'> {
  label: string;
  active?: boolean;
  size?: 'sm' | 'md';
}

export function IconButton(props: IconButtonProps) {
  const { label, active, size = 'md', className, type = 'button', children, ...rest } = props;
  return (
    <button
      type={type}
      aria-label={label}
      title={label}
      aria-pressed={active}
      className={cn(
        'inline-flex shrink-0 cursor-default items-center justify-center rounded-md text-fg-muted transition-colors outline-none hover:bg-bg-muted hover:text-fg focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-40',
        size === 'sm' ? 'size-6' : 'size-7',
        active && 'bg-bg-muted text-fg',
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}
