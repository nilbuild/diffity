import { Badge } from '@/components/ui/Badge';
import { CheckCircleIcon, DismissIcon, SparklesIcon } from '@/components/ui/icon';
import { cn } from '@/lib/cn';
import type { AuthorType, Severity, ThreadStatus } from '@/lib/types';

export const SEVERITIES: Severity[] = ['must-fix', 'suggestion', 'nit', 'question'];

export const SEVERITY_LABEL: Record<Severity, string> = {
  'must-fix': 'Must fix',
  suggestion: 'Suggestion',
  nit: 'Nit',
  question: 'Question',
};

export const severityTone = {
  'must-fix': 'danger',
  suggestion: 'accent',
  nit: 'neutral',
  question: 'warning',
} as const;

export function SeverityBadge(props: { severity: Severity }) {
  return <Badge tone={severityTone[props.severity]}>{SEVERITY_LABEL[props.severity]}</Badge>;
}

export function StatusBadge(props: { status: ThreadStatus }) {
  const { status } = props;
  if (status === 'open') {
    return null;
  }
  if (status === 'resolved') {
    return (
      <Badge tone="success">
        <CheckCircleIcon size={12} />
        Resolved
      </Badge>
    );
  }
  return (
    <Badge tone="neutral">
      <DismissIcon size={12} />
      Dismissed
    </Badge>
  );
}

export function PendingBadge(props: { className?: string }) {
  return (
    <Badge tone="warning" className={cn('border border-dashed border-warning/50 bg-transparent', props.className)}>
      Pending
    </Badge>
  );
}

export function Avatar(props: { authorType: AuthorType; authorName: string; size?: 'sm' | 'md' }) {
  const { authorType, authorName, size = 'md' } = props;
  const box = size === 'sm' ? 'size-5 text-2xs' : 'size-6 text-xs';
  if (authorType === 'agent') {
    return (
      <span title={authorName} className={cn('inline-flex shrink-0 items-center justify-center rounded-full bg-accent-solid text-accent-fg', box)}>
        <SparklesIcon size={12} />
      </span>
    );
  }
  const initial = (authorType === 'user' ? 'You' : authorName).trim().charAt(0).toUpperCase() || '?';
  return (
    <span
      title={authorName}
      className={cn('inline-flex shrink-0 items-center justify-center rounded-full bg-fg-subtle font-medium text-canvas', box)}
    >
      {initial}
    </span>
  );
}

export function authorLabel(authorType: AuthorType, authorName: string): string {
  if (authorType === 'user') {
    return authorName && authorName !== 'user' ? authorName : 'You';
  }
  return authorName;
}
