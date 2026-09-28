import type { ComponentProps } from 'react';
import { cn } from '@/lib/cn';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md';

export interface ButtonProps extends ComponentProps<'button'> {
  variant?: Variant;
  size?: Size;
}

const variants: Record<Variant, string> = {
  primary: 'bg-accent text-accent-fg hover:bg-accent-hover border border-transparent',
  secondary: 'bg-bg-elevated text-fg border border-border hover:bg-bg-muted',
  ghost: 'text-fg-muted hover:text-fg hover:bg-bg-muted border border-transparent',
  danger: 'bg-danger text-white hover:opacity-90 border border-transparent',
};

const sizes: Record<Size, string> = {
  sm: 'h-6 px-2 text-xs gap-1',
  md: 'h-7 px-3 text-[13px] gap-1.5',
};

export function Button(props: ButtonProps) {
  const { variant = 'secondary', size = 'md', className, type = 'button', ...rest } = props;
  return (
    <button
      type={type}
      className={cn(
        'inline-flex shrink-0 cursor-default items-center justify-center rounded-md font-medium whitespace-nowrap transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50',
        variants[variant],
        sizes[size],
        className,
      )}
      {...rest}
    />
  );
}
