import { cn } from '../../lib/cn';
import { getStatusColor } from '../../lib/diff-utils';
import { Badge } from './badge';

interface StatusBadgeProps {
  status: string;
  compact?: boolean;
}

function getCompactLabel(status: string): string {
  switch (status) {
    case 'added':
      return 'A';
    case 'deleted':
      return 'D';
    case 'renamed':
      return 'R';
    case 'copied':
      return 'C';
    default:
      return 'M';
  }
}

function getFullLabel(status: string): string {
  switch (status) {
    case 'added':
      return 'Added';
    case 'deleted':
      return 'Deleted';
    case 'renamed':
      return 'Renamed';
    case 'copied':
      return 'Copied';
    default:
      return '';
  }
}

export function StatusBadge(props: StatusBadgeProps) {
  const { status, compact } = props;

  if (compact) {
    return (
      <span className={cn('shrink-0 w-[18px] h-[18px] inline-flex items-center justify-center rounded text-[11px] font-bold font-mono', getStatusColor(status))}>
        {getCompactLabel(status)}
      </span>
    );
  }

  const label = getFullLabel(status);
  if (!label) {
    return null;
  }

  return <Badge className={getStatusColor(status)}>{label}</Badge>;
}
