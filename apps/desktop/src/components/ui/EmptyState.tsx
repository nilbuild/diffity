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
            'mb-2 flex size-10 items-center justify-center rounded-lg border border-border bg-panel',
            tone === 'danger' ? 'text-danger' : 'text-fg-muted',
          )}
        >
          {icon}
        </div>
      )}
      <div className="text-sm font-medium text-fg">{title}</div>
      {description && <div className="max-w-sm text-xs text-fg-muted">{description}</div>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}
