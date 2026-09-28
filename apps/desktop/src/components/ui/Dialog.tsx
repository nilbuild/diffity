import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/cn';
import { XIcon } from './icon';
import { IconButton } from './IconButton';

export interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  /** Set false when the body manages its own padding/layout (e.g. a sidebar + content split). */
  padded?: boolean;
  className?: string;
}

export function Dialog(props: DialogProps) {
  const { open, onOpenChange, title, description, children, footer, padded = true, className } = props;

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
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [open, onOpenChange]);

  if (!open) {
    return null;
  }

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-backdrop px-4 pt-[12vh]" onMouseDown={() => onOpenChange(false)}>
      <div
        role="dialog"
        aria-modal="true"
        className={cn(
          'flex max-h-[76vh] w-[440px] max-w-full flex-col overflow-hidden rounded-lg border border-border-strong bg-raised',
          className,
        )}
        onMouseDown={(event) => event.stopPropagation()}
      >
        {title && (
          <div className="flex shrink-0 items-start gap-3 border-b border-border py-2.5 pr-2.5 pl-4">
            <div className="min-w-0 flex-1 py-0.5">
              <h2 className="truncate text-sm font-semibold text-fg">{title}</h2>
              {description && <p className="mt-0.5 truncate text-xs text-fg-muted">{description}</p>}
            </div>
            <IconButton size="sm" label="Close" onClick={() => onOpenChange(false)}>
              <XIcon size={14} />
            </IconButton>
          </div>
        )}
        <div className={cn('min-h-0 flex-1 overflow-auto', padded && 'p-4')}>{children}</div>
        {footer && (
          <div className="flex shrink-0 items-center justify-end gap-2 border-t border-border bg-panel px-4 py-2.5">{footer}</div>
        )}
      </div>
    </div>,
    document.body,
  );
}
