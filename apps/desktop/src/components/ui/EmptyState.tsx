import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

export interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  tone?: 'neutral' | 'danger';
  className?: string;
}

export function EmptyState(props: EmptyStateProps) {
  const { icon, title, description, action, tone = 'neutral', className } = props;
  return (
    <div className={cn('flex h-full flex-col items-center justify-center gap-1 p-8 text-center', className)}>
      {icon && (
        <div
          className={cn(
            'mb-3 flex size-11 items-center justify-center rounded-full border-[1.5px] border-fg-muted/40',
            tone === 'danger' ? 'text-danger' : 'text-fg-muted',
          )}
        >
          {icon}
        </div>
      )}
      <div className="font-serif text-xl font-semibold text-fg">{title}</div>
      {description && <div className="max-w-sm text-sm text-fg-muted">{description}</div>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}
