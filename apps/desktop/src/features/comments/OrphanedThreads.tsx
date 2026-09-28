import { AlertIcon } from '@/components/ui/icon';
import type { Thread } from '@/lib/types';
import { ThreadCard } from './ThreadCard';
import type { CommentActions } from './use-threads';

export interface OrphanedThreadsProps {
  threads: Thread[];
  actions: CommentActions;
}

export function OrphanedThreads(props: OrphanedThreadsProps) {
  const { threads, actions } = props;
  if (threads.length === 0) {
    return null;
  }
  return (
    <section className="mb-1 rounded-lg border border-warning/40 bg-warning/6 p-3 font-sans">
      <div className="mb-2 flex items-center gap-1.5 text-xs font-medium text-warning">
        <AlertIcon size={14} />
        {threads.length} outdated {threads.length === 1 ? 'thread' : 'threads'} — the commented lines are no longer in this diff
      </div>
      <div className="flex flex-col gap-2">
        {threads.map((thread) => (
          <div key={thread.id} className="flex flex-col gap-1">
            <div className="text-xs text-fg-muted">
              {thread.filePath}:{thread.startLine === thread.endLine ? thread.startLine : `${thread.startLine}-${thread.endLine}`}
            </div>
            {thread.anchorContent && (
              <pre className="selectable overflow-x-auto rounded-md border border-border bg-canvas px-3 py-2 font-mono text-xs text-fg-muted">
                {thread.anchorContent}
              </pre>
            )}
            <ThreadCard thread={thread} actions={actions} />
          </div>
        ))}
      </div>
    </section>
  );
}
