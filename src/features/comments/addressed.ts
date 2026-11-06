import { queryClient } from '../../lib/query-client';
import { openComments } from '../../lib/ui-store';
import { goToThread } from '../../lib/thread-location';
import { setCurrentThread } from '../../lib/current-thread';
import type { RepoThread, Thread } from '../../lib/types';

/** Threads among `ids` that an agent addressed and that wait for you to check and resolve. */
export function addressedThreadIds(threads: Pick<Thread, 'id' | 'status' | 'addressedBy'>[], ids: Iterable<string>): string[] {
  const wanted = new Set(ids);
  return threads.filter((thread) => wanted.has(thread.id) && thread.status === 'open' && !!thread.addressedBy).map((thread) => thread.id);
}

export function reviewFixesLabel(count: number): string {
  return count === 1 ? 'Review the fix' : `Review ${count} fixes`;
}

/**
 * Opens the first addressed thread still on the diff; `]` and `[` step on through the open comments from there.
 * When none is on the diff, the Comments panel lists them.
 */
export function reviewAddressed(repoPath: string, ref: string, threadIds: string[]) {
  const repoThreads = queryClient.getQueryData<RepoThread[]>(['repo-threads', repoPath]) ?? [];
  const first = threadIds.find((id) => (repoThreads.find((thread) => thread.id === id)?.anchor ?? 'current') === 'current');
  if (!first) {
    openComments();
    goToThread(repoPath, { ref, threadId: null });
    return;
  }
  setCurrentThread(first);
  goToThread(repoPath, { ref, threadId: first });
}
