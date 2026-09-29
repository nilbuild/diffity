import { useMemo, useState } from 'react';
import { CommentIcon } from '../../components/icons/comment-icon';
import { XIcon } from '../../components/icons/x-icon';
import { isOpenThread, useRepoThreads } from '../../hooks/use-repo-threads';
import { openComments } from '../../lib/ui-store';

interface OtherViewsBannerProps {
  sessionId: string | null;
}

const dismissedFor = new Set<string>();

export function OtherViewsBanner(props: OtherViewsBannerProps) {
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
  const where = summary.views.length === 1
    ? `in ${firstView[0]}`
    : `in ${firstView[0]} and ${summary.views.length - 1} other view${summary.views.length > 2 ? 's' : ''}`;

  return (
    <div className="flex items-center gap-2 h-8 px-3 border-b border-border bg-bg-secondary text-xs text-text-secondary">
      <CommentIcon className="w-3.5 h-3.5 text-accent shrink-0" />
      <span className="truncate">
        <span className="font-medium text-text">
          {summary.count} open comment{summary.count === 1 ? '' : 's'}
        </span>{' '}
        {where}
        {summary.claude > 0 && (
          <span className="text-text-muted"> · {summary.claude === summary.count ? 'from Claude' : `${summary.claude} from Claude`}</span>
        )}
      </span>
      <button
        onClick={openComments}
        className="shrink-0 font-medium text-accent hover:underline cursor-pointer"
      >
        Show
      </button>
      <button
        onClick={() => {
          dismissedFor.add(dismissKey);
          setDismissTick((tick) => tick + 1);
        }}
        className="ml-auto shrink-0 p-0.5 rounded text-text-muted hover:text-text hover:bg-hover cursor-pointer"
        title="Hide until something changes"
      >
        <XIcon className="w-3 h-3" />
      </button>
    </div>
  );
}
