import { useEffect, useRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { cn } from '@/lib/cn';

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
type ButtonSize = 'xs' | 'sm' | 'md';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
}

const variantClass: Record<ButtonVariant, string> = {
  primary: 'bg-accent text-accent-fg hover:bg-accent-hover border-transparent',
  secondary: 'bg-bg-elevated text-fg border-border hover:bg-bg-muted',
  ghost: 'bg-transparent text-fg-muted border-transparent hover:bg-bg-muted hover:text-fg',
  danger: 'bg-danger text-white border-transparent hover:opacity-90',
};

const sizeClass: Record<ButtonSize, string> = {
  xs: 'h-6 px-2 text-[11px] gap-1',
  sm: 'h-7 px-2.5 text-xs gap-1.5',
  md: 'h-8 px-3 text-[13px] gap-2',
};

export function Button(props: ButtonProps) {
  const { variant = 'secondary', size = 'sm', loading, className, children, disabled, type, ...rest } = props;
  return (
    <button
      type={type ?? 'button'}
      disabled={disabled || loading}
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-md border font-medium whitespace-nowrap transition-colors',
        'focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50',
        variantClass[variant],
        sizeClass[size],
        className,
      )}
      {...rest}
    >
      {loading && <Spinner size={12} />}
      {children}
    </button>
  );
}

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  active?: boolean;
}

export function IconButton(props: IconButtonProps) {
  const { label, active, className, children, type, ...rest } = props;
  return (
    <button
      type={type ?? 'button'}
      title={label}
      aria-label={label}
      className={cn(
        'inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-fg-muted transition-colors',
        'hover:bg-bg-muted hover:text-fg focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
        'disabled:cursor-not-allowed disabled:opacity-40',
        active && 'bg-bg-muted text-fg',
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}

export function Spinner(props: { size?: number; className?: string }) {
  const { size = 14, className } = props;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      className={cn('shrink-0 animate-spin', className)}
      aria-hidden
    >
      <circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" strokeOpacity="0.25" strokeWidth="2" />
      <path d="M14 8a6 6 0 0 0-6-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

type BadgeTone = 'neutral' | 'accent' | 'success' | 'warning' | 'danger';

const toneClass: Record<BadgeTone, string> = {
  neutral: 'bg-bg-muted text-fg-muted',
  accent: 'bg-accent-subtle text-accent',
  success: 'bg-success/15 text-success',
  warning: 'bg-warning/15 text-warning',
  danger: 'bg-danger/15 text-danger',
};

export function Badge(props: { tone?: BadgeTone; className?: string; children: ReactNode; title?: string }) {
  const { tone = 'neutral', className, children, title } = props;
  return (
    <span
      title={title}
      className={cn(
        'inline-flex items-center gap-1 rounded px-1.5 py-px text-[11px] font-medium whitespace-nowrap',
        toneClass[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function Kbd(props: { children: ReactNode }) {
  return (
    <kbd className="rounded border border-border bg-bg-muted px-1 font-mono text-[10px] text-fg-subtle">
      {props.children}
    </kbd>
  );
}

export interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
}

export function Dialog(props: DialogProps) {
  const { open, onOpenChange, title, description, children, footer, className } = props;

  useEffect(() => {
    if (!open) {
      return;
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') {
        return;
      }
      event.stopPropagation();
      onOpenChange(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onOpenChange]);

  if (!open) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-6"
      onMouseDown={() => onOpenChange(false)}
    >
      <div
        role="dialog"
        aria-modal="true"
        className={cn(
          'flex max-h-full w-[520px] max-w-full flex-col overflow-hidden rounded-xl border border-border bg-bg-elevated shadow-2xl',
          className,
        )}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="flex items-start gap-3 border-b border-border px-5 py-3.5">
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-semibold">{title}</h2>
            {description && <p className="mt-0.5 text-xs text-fg-muted">{description}</p>}
          </div>
          <IconButton label="Close" onClick={() => onOpenChange(false)}>
            <svg width="14" height="14" viewBox="0 0 16 16" stroke="currentColor" strokeWidth="1.5" aria-hidden>
              <path d="M4 4l8 8M12 4l-8 8" />
            </svg>
          </IconButton>
        </div>
        <div className="min-h-0 flex-1 overflow-auto">{children}</div>
        {footer && <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-3">{footer}</div>}
      </div>
    </div>
  );
}

export interface PopoverProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  trigger: ReactNode;
  children: ReactNode;
  align?: 'start' | 'end';
  side?: 'bottom' | 'top';
  className?: string;
}

export function Popover(props: PopoverProps) {
  const { open, onOpenChange, trigger, children, align = 'start', side = 'bottom', className } = props;
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) {
      return;
    }
    const onDown = (event: MouseEvent) => {
      if (rootRef.current?.contains(event.target as Node)) {
        return;
      }
      onOpenChange(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onOpenChange(false);
      }
    };
    window.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [open, onOpenChange]);

  return (
    <div ref={rootRef} className="relative">
      {trigger}
      {open && (
        <div
          className={cn(
            'absolute z-40 min-w-[180px] overflow-hidden rounded-lg border border-border bg-bg-elevated p-1 shadow-xl',
            align === 'end' ? 'right-0' : 'left-0',
            side === 'bottom' ? 'top-full mt-1' : 'bottom-full mb-1',
            className,
          )}
        >
          {children}
        </div>
      )}
    </div>
  );
}

export interface MenuItemProps {
  onSelect: () => void;
  disabled?: boolean;
  active?: boolean;
  children: ReactNode;
  hint?: ReactNode;
  className?: string;
}

export function MenuItem(props: MenuItemProps) {
  const { onSelect, disabled, active, children, hint, className } = props;
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onSelect}
      className={cn(
        'flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left text-xs',
        'hover:bg-bg-muted disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent',
        active && 'bg-accent-subtle text-accent',
        className,
      )}
    >
      <span className="min-w-0 flex-1">
        {children}
        {hint && <span className="mt-0.5 block text-[11px] text-fg-subtle">{hint}</span>}
      </span>
    </button>
  );
}

export function SegmentedControl<T extends string>(props: {
  value: T;
  options: { value: T; label: ReactNode; title?: string }[];
  onChange: (value: T) => void;
  className?: string;
}) {
  const { value, options, onChange, className } = props;
  return (
    <div className={cn('inline-flex rounded-md border border-border bg-bg-muted p-0.5', className)}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          title={option.title}
          onClick={() => onChange(option.value)}
          className={cn(
            'rounded px-2 py-0.5 text-[11px] font-medium transition-colors',
            option.value === value ? 'bg-bg-elevated text-fg shadow-sm' : 'text-fg-muted hover:text-fg',
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
