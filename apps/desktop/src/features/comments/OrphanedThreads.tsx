import { useState } from 'react';
import { AlertIcon, ChevronRightIcon } from '@/components/ui/icon';
import { cn } from '@/lib/cn';
import type { Thread } from '@/lib/types';
import { ThreadCard } from './ThreadCard';
import type { CommentActions } from './use-threads';

export interface OrphanedThreadsProps {
  threads: Thread[];
  actions: CommentActions;
}

export function OrphanedThreads(props: OrphanedThreadsProps) {
  const { threads, actions } = props;
  const [open, setOpen] = useState(true);
  if (threads.length === 0) {
    return null;
  }
  return (
    <section className="font-sans">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex h-7 w-full cursor-default items-center gap-1.5 rounded-md px-1 text-left text-xs hover:bg-hover"
      >
        <ChevronRightIcon size={12} className={cn('text-fg-subtle transition-transform', open && 'rotate-90')} />
        <AlertIcon size={12} className="text-warning" />
        <span className="font-medium text-fg">
          {threads.length} outdated {threads.length === 1 ? 'conversation' : 'conversations'}
        </span>
        <span className="truncate text-fg-subtle">— the commented lines are no longer in this diff</span>
      </button>
      {open && (
        <div className="mt-1 flex flex-col gap-2">
          {threads.map((thread) => (
            <div key={thread.id} className="flex flex-col overflow-hidden rounded-lg border border-border">
              {thread.anchorContent && (
                <pre className="selectable overflow-x-auto border-b border-border bg-panel px-3 py-1.5 font-mono text-xs text-fg-muted">
                  {thread.anchorContent}
                </pre>
              )}
              <div className="[&>div]:rounded-none [&>div]:border-0">
                <ThreadCard thread={thread} actions={actions} showLocation />
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
