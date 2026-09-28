import type { Thread } from '@/lib/types';
import type { CommentAnnotation } from './annotation-types';
import { DraftForm } from './DraftForm';
import { ThreadCard } from './ThreadCard';
import type { CommentActions } from './use-threads';

export interface AnnotationStackProps {
  data: CommentAnnotation[];
  threadsById: Map<string, Thread>;
  actions: CommentActions;
}

export function AnnotationStack(props: AnnotationStackProps) {
  const { data, threadsById, actions } = props;
  return (
    <div className="flex max-w-[860px] flex-col gap-2 px-3 py-2 whitespace-normal">
      {data.map((entry) => {
        if (entry.kind === 'draft') {
          return <DraftForm key="draft" actions={actions} />;
        }
        const thread = threadsById.get(entry.threadId);
        if (!thread) {
          return null;
        }
        return <ThreadCard key={thread.id} thread={thread} actions={actions} />;
      })}
    </div>
  );
}
