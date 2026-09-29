import { useMemo, useState } from 'react';
import { isOpenThread, useRepoThreads } from '../../hooks/use-repo-threads';
import { openComments } from '../../lib/ui-store';
import { CommentIcon, XIcon } from '../../components/ui/icon';

interface OtherViewsNoticeProps {
  sessionId: string | null;
}

const dismissedFor = new Set<string>();

function shortViewLabel(label: string): string {
  const commit = /^Commit ([0-9a-f]{7,})\b/i.exec(label);
  if (commit) {
    return `commit ${commit[1].slice(0, 7)}`;
  }
  const short = label.replace(/\b([0-9a-f]{7})[0-9a-f]{5,}\b/gi, '$1');
  return short.length > 40 ? `${short.slice(0, 40)}…` : short;
}

export function OtherViewsNotice(props: OtherViewsNoticeProps) {
  const { sessionId } = props;
  const { data } = useRepoThreads();
  const [, setDismissTick] = useState(0);

  const summary = useMemo(() => {
    const others = (data ?? []).filter((thread) => isOpenThread(thread) && thread.sessionId !== sessionId);
    const views = new Map<string, number>();
    for (const thread of others) {
      views.set(thread.refLabel, (views.get(thread.refLabel) ?? 0) + 1);
    }
    return {
      count: others.length,
      claude: others.filter((thread) => thread.authorType === 'agent').length,
      views: [...views.entries()].sort((a, b) => b[1] - a[1]),
    };
  }, [data, sessionId]);

  const dismissKey = `${sessionId}:${summary.count}`;
  if (!sessionId || summary.count === 0 || dismissedFor.has(dismissKey)) {
    return null;
  }

  const [firstView] = summary.views;
  const firstLabel = shortViewLabel(firstView[0]);
  const where = summary.views.length === 1
    ? `in ${firstLabel}`
    : `in ${firstLabel} +${summary.views.length - 1} more`;

  return (
    <span className="inline-flex items-center gap-1.5 h-5 max-w-[420px] min-w-0 pl-2 pr-1 rounded-full border border-border bg-bg text-text-secondary">
      <CommentIcon className="w-3 h-3 shrink-0 text-text-secondary" />
      <button
        onClick={openComments}
        className="min-w-0 truncate cursor-pointer hover:text-text"
        title={`${summary.count} open comment${summary.count === 1 ? '' : 's'} ${where} — show them`}
      >
        <span className="font-medium text-text">
          {summary.count} open comment{summary.count === 1 ? '' : 's'}
        </span>{' '}
        {where}
        {summary.claude > 0 && (summary.claude === summary.count ? ' · from Claude' : ` · ${summary.claude} from Claude`)}
      </button>
      <button
        onClick={() => {
          dismissedFor.add(dismissKey);
          setDismissTick((tick) => tick + 1);
        }}
        className="shrink-0 p-0.5 rounded-full text-text-muted hover:text-text hover:bg-hover cursor-pointer"
        title="Hide until something changes"
      >
        <XIcon className="w-2.5 h-2.5" />
      </button>
    </span>
  );
}
