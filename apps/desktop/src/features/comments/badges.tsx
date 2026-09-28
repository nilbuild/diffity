import { Badge } from '@/components/ui/Badge';
import { GithubIcon, SparklesIcon } from '@/components/ui/icon';
import type { AuthorType, Severity, ThreadStatus } from '@/lib/types';

export const SEVERITIES: Severity[] = ['must-fix', 'suggestion', 'nit', 'question'];

const severityTone = {
  'must-fix': 'danger',
  suggestion: 'accent',
  nit: 'neutral',
  question: 'warning',
} as const;

export function SeverityBadge(props: { severity: Severity }) {
  return <Badge tone={severityTone[props.severity]}>{props.severity}</Badge>;
}

export function StatusBadge(props: { status: ThreadStatus }) {
  const { status } = props;
  if (status === 'open') {
    return null;
  }
  return <Badge tone={status === 'resolved' ? 'success' : 'neutral'}>{status}</Badge>;
}

export function AuthorBadge(props: { authorType: AuthorType; authorName: string }) {
  const { authorType, authorName } = props;
  if (authorType === 'agent') {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-semibold text-accent">
        <SparklesIcon size={12} />
        {authorName}
      </span>
    );
  }
  if (authorType === 'github') {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-semibold text-fg">
        <GithubIcon size={12} />
        {authorName}
      </span>
    );
  }
  return <span className="text-xs font-semibold text-fg">You</span>;
}
