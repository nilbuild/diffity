import type { ComponentProps } from 'react';
import { cn } from '@/lib/cn';
import { Spinner } from './Spinner';

export type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends ComponentProps<'button'> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
}

const variants: Record<ButtonVariant, string> = {
  primary: 'border-transparent bg-accent-solid text-accent-fg hover:bg-accent-solid/88',
  secondary: 'border-border bg-transparent text-fg hover:border-border-strong hover:bg-hover',
  outline: 'border-accent/70 bg-transparent text-accent hover:border-accent hover:bg-accent/8',
  ghost: 'border-transparent text-fg-muted hover:bg-hover hover:text-fg',
  danger: 'border-transparent bg-danger text-white hover:bg-danger/90',
};

const sizes: Record<ButtonSize, string> = {
  sm: 'h-6 gap-1 px-2.5 text-xs',
  md: 'h-7 gap-1.5 px-3 text-xs',
  lg: 'h-8 gap-1.5 px-3.5 text-sm',
};

export function Button(props: ButtonProps) {
  const { variant = 'secondary', size = 'md', loading, className, type = 'button', disabled, children, ...rest } = props;
  return (
    <button
      type={type}
      disabled={disabled || loading}
      className={cn(
        'inline-flex shrink-0 cursor-default items-center justify-center rounded-full border font-medium whitespace-nowrap transition-colors disabled:pointer-events-none disabled:opacity-50',
        variants[variant],
        sizes[size],
        className,
      )}
      {...rest}
    >
      {loading && <Spinner size={size === 'sm' ? 12 : 14} />}
      {children}
    </button>
  );
}
