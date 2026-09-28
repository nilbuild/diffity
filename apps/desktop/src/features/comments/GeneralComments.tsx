import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { CommentIcon } from '@/components/ui/icon';
import { GENERAL_FILE_PATH, type Thread } from '@/lib/types';
import { CommentForm } from './CommentForm';
import { ThreadCard } from './ThreadCard';
import type { CommentActions } from './use-threads';

export interface GeneralCommentsProps {
  threads: Thread[];
  actions: CommentActions;
}

export function GeneralComments(props: GeneralCommentsProps) {
  const { threads, actions } = props;
  const [adding, setAdding] = useState(false);

  return (
    <section className="mb-1 flex flex-col gap-2 font-sans">
      {threads.map((thread) => (
        <ThreadCard key={thread.id} thread={thread} actions={actions} />
      ))}
      {adding ? (
        <div className="rounded-lg border border-border bg-raised p-3">
          <CommentForm
            withSeverity
            placeholder="Leave a general comment on these changes…"
            onSubmit={(body, severity) =>
              actions.create
                .mutateAsync({ filePath: GENERAL_FILE_PATH, side: 'new', startLine: 0, endLine: 0, body, severity })
                .then(() => setAdding(false))
            }
            onCancel={() => setAdding(false)}
          />
        </div>
      ) : (
        <div>
          <Button variant="ghost" onClick={() => setAdding(true)}>
            <CommentIcon size={14} />
            Add general comment
          </Button>
        </div>
      )}
    </section>
  );
}
