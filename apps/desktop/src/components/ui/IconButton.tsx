import type { ComponentProps, ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { useTooltip } from './Tooltip';

export interface IconButtonProps extends ComponentProps<'button'> {
  /** Accessible name, also shown as the tooltip. */
  label: string;
  /** Optional shortcut shown after the label in the tooltip, e.g. "⌘L". */
  shortcut?: string;
  active?: boolean;
  size?: 'sm' | 'md';
  /** `circle`: glyph inside a thin round outline (title-bar actions). */
  variant?: 'ghost' | 'primary' | 'circle';
  tooltipSide?: 'top' | 'bottom';
  children: ReactNode;
}

export function IconButton(props: IconButtonProps) {
  const {
    label,
    shortcut,
    active,
    size = 'md',
    variant = 'ghost',
    tooltipSide,
    className,
    type = 'button',
    children,
    onMouseEnter,
    onMouseLeave,
    ...rest
  } = props;
  const { anchorProps, tooltip } = useTooltip(
    shortcut ? (
      <span className="flex items-center gap-1.5">
        {label}
        <span className="text-fg-subtle">{shortcut}</span>
      </span>
    ) : (
      label
    ),
    tooltipSide,
  );

  return (
    <>
      <button
        type={type}
        aria-label={label}
        aria-pressed={active}
        className={cn(
          'inline-flex shrink-0 cursor-default items-center justify-center transition-colors disabled:pointer-events-none disabled:opacity-40',
          size === 'sm' ? 'size-6' : 'size-7',
          variant === 'circle' ? 'rounded-full' : 'rounded-lg',
          variant === 'primary' && 'bg-accent-solid text-accent-fg hover:bg-accent-solid/88',
          variant === 'ghost' &&
            cn('text-fg-muted hover:bg-hover hover:text-fg', active && 'bg-muted text-fg hover:bg-muted hover:text-fg'),
          variant === 'circle' &&
            cn(
              'border-[1.5px] border-fg-muted/55 text-fg-muted hover:border-fg-muted hover:bg-hover hover:text-fg',
              active && 'border-fg bg-muted text-fg',
            ),
          className,
        )}
        {...rest}
        onMouseEnter={(event) => {
          anchorProps.onMouseEnter(event);
          onMouseEnter?.(event);
        }}
        onMouseLeave={(event) => {
          anchorProps.onMouseLeave();
          onMouseLeave?.(event);
        }}
        onFocus={anchorProps.onFocus}
        onBlur={anchorProps.onBlur}
        onMouseDown={anchorProps.onMouseDown}
      >
        {children}
      </button>
      {tooltip}
    </>
  );
}
