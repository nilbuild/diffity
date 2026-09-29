import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import type { PullRequest } from '../../lib/types';
import { cn } from '../../lib/cn';
import { GitPullRequestIcon } from '../../components/icons/git-pull-request-icon';
import { CheckIcon } from '../../components/icons/check-icon';
import { XIcon } from '../../components/icons/x-icon';

dayjs.extend(relativeTime);

export function relative(date: string): string {
  if (!date) {
    return '';
  }
  return dayjs(date).fromNow();
}

export function headLabel(pr: PullRequest): string {
  if (!pr.isCrossRepository || !pr.headRepo) {
    return pr.headRef;
  }
  return `${pr.headRepo.split('/')[0]}:${pr.headRef}`;
}

export function PrStateIcon(props: { pr: PullRequest; className?: string }) {
  const { pr, className } = props;
  const tone = (() => {
    if (pr.state === 'MERGED') {
      return 'text-[#8250df]';
    }
    if (pr.state === 'CLOSED') {
      return 'text-deleted';
    }
    if (pr.isDraft) {
      return 'text-text-muted';
    }
    return 'text-added';
  })();

  return <GitPullRequestIcon className={cn('shrink-0', tone, className)} />;
}

export function PrStateBadge(props: { pr: PullRequest }) {
  const { pr } = props;
  const [label, tone] = (() => {
    if (pr.state === 'MERGED') {
      return ['Merged', 'bg-[#8250df]/12 text-[#8250df]'];
    }
    if (pr.state === 'CLOSED') {
      return ['Closed', 'bg-deleted/12 text-deleted'];
    }
    if (pr.isDraft) {
      return ['Draft', 'bg-fill text-text-secondary'];
    }
    return ['Open', 'bg-added/12 text-added'];
  })();

  return (
    <span className={cn('inline-flex h-5 shrink-0 items-center gap-1 rounded-full px-2 text-[11px] font-medium', tone)}>
      <GitPullRequestIcon className="h-3 w-3" />
      {label}
    </span>
  );
}

export function ReviewDecision(props: { decision: string | null }) {
  const { decision } = props;

  if (decision === 'APPROVED') {
    return <span className="shrink-0 text-added">Approved</span>;
  }
  if (decision === 'CHANGES_REQUESTED') {
    return <span className="shrink-0 text-deleted">Changes requested</span>;
  }
  if (decision === 'REVIEW_REQUIRED') {
    return <span className="shrink-0 text-modified">Review required</span>;
  }
  return null;
}

export function ChecksStatus(props: { checks: string | null; withLabel?: boolean }) {
  const { checks, withLabel } = props;

  if (!checks) {
    return null;
  }
  if (checks === 'SUCCESS') {
    return (
      <span className="inline-flex shrink-0 items-center gap-1 text-added" title="Checks passed">
        <CheckIcon className="h-3 w-3" />
        {withLabel && 'Checks passed'}
      </span>
    );
  }
  if (checks === 'FAILURE' || checks === 'ERROR') {
    return (
      <span className="inline-flex shrink-0 items-center gap-1 text-deleted" title="Checks failing">
        <XIcon className="h-3 w-3" />
        {withLabel && 'Checks failing'}
      </span>
    );
  }
  return (
    <span className="inline-flex shrink-0 items-center gap-1 text-modified" title="Checks running">
      <span className="size-1.5 rounded-full bg-modified" />
      {withLabel && 'Checks running'}
    </span>
  );
}
