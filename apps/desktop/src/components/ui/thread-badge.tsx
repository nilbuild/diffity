import { cn } from '../../lib/cn';

type ThreadBadgeVariant = 'resolved' | 'dismissed' | 'outdated' | 'pending';

interface ThreadBadgeProps {
  variant: ThreadBadgeVariant;
  children?: React.ReactNode;
  size?: 'sm' | 'default';
}

const variantStyles: Record<ThreadBadgeVariant, string> = {
  resolved: 'bg-added/12 text-added',
  dismissed: 'bg-fill text-text-muted line-through',
  outdated: 'bg-fill text-text-secondary',
  pending: 'bg-fill text-text-secondary',
};

const defaultLabels: Record<ThreadBadgeVariant, string> = {
  resolved: 'Resolved',
  dismissed: 'Dismissed',
  outdated: 'Outdated',
  pending: 'Draft',
};

export function ThreadBadge(props: ThreadBadgeProps) {
  const { variant, children, size = 'default' } = props;

  return (
    <span className={cn(
      'rounded-full font-medium',
      size === 'sm' ? 'px-1 py-0.5 text-[9px]' : 'px-1.5 py-0.5 text-[10px]',
      variantStyles[variant],
    )}>
      {children ?? defaultLabels[variant]}
    </span>
  );
}
