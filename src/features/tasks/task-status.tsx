import { cn } from '../../lib/cn';
import { Spinner } from '../../components/icons/spinner';
import { CheckCircleIcon, GitMergeIcon, GitPullRequestIcon } from '../../components/ui/icon';
import { STATUS_LABEL, type TaskStatus } from './tasks';

function Dot(props: { className: string; label: string }) {
  const { className, label } = props;

  return <span role="img" aria-label={label} className={cn('inline-block w-2 h-2 rounded-full shrink-0', className)} />;
}

export function TaskStatusIcon(props: { status: TaskStatus; className?: string }) {
  const { status, className } = props;
  const label = STATUS_LABEL[status];

  if (status === 'working') {
    return <Spinner label={label} className={cn('text-claude', className)} />;
  }
  if (status === 'needsYou') {
    return <Dot label={label} className={cn('bg-modified', className)} />;
  }
  if (status === 'ready') {
    return <Dot label={label} className={cn('bg-primary', className)} />;
  }
  if (status === 'failed') {
    return <Dot label={label} className={cn('bg-deleted', className)} />;
  }
  if (status === 'missing') {
    return <Dot label={label} className={cn('border border-deleted', className)} />;
  }
  if (status === 'settingUp') {
    return <Spinner label={label} className={className} />;
  }
  if (status === 'shipped') {
    return <GitPullRequestIcon size="xs" title={label} className={cn('text-added', className)} />;
  }
  if (status === 'merged') {
    return <GitMergeIcon size="xs" title={label} className={cn('text-text-muted', className)} />;
  }
  if (status === 'queued') {
    return <Dot label={label} className={cn('border border-text-muted', className)} />;
  }
  return <CheckCircleIcon size="xs" title={label} className={cn('text-text-muted', className)} />;
}
