import type { ReactNode } from 'react';

export interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
}

export function EmptyState(props: EmptyStateProps) {
  const { icon, title, description, action } = props;
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 p-8 text-center">
      {icon && <div className="mb-1 text-fg-subtle">{icon}</div>}
      <div className="text-sm font-medium text-fg">{title}</div>
      {description && <div className="max-w-sm text-xs text-fg-muted">{description}</div>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
