/**
 * Which queued agent runs may start. Runs that may change code edit the checked-out code, so they don't overlap each
 * other or a review or guide reading that code (it would read half-made edits and comment on lines that move). Reviews
 * and guides of code that isn't checked out (another branch or pull request) read it from git, so they never wait. Runs
 * in task folders also share the parallel task limit.
 */

export type Lane = 'read' | 'edit';

export function laneOf(actionKind: string): Lane {
  return actionKind === 'review' || actionKind === 'guide' ? 'read' : 'edit';
}

export interface QueueEntry {
  id: string;
  state: 'queued' | 'running';
  repoPath: string;
  lane: Lane;
  /** Works on the checked-out code: always for edits; for reads, when the view is checked out. */
  onCheckout: boolean;
  inTask: boolean;
}

/** Two runs that mustn't overlap: in the same checkout, and one of them may change it. */
export function conflicts(a: QueueEntry, b: QueueEntry): boolean {
  return a.repoPath === b.repoPath && a.onCheckout && b.onCheckout && (a.lane === 'edit' || b.lane === 'edit');
}

/** In queue order. */
export function startable(entries: QueueEntry[], taskLimit: number): string[] {
  const going = entries.filter((entry) => entry.state === 'running');
  let taskSlots = taskLimit - going.filter((entry) => entry.inTask).length;
  // Projects with an edit waiting: later reviews of the checkout wait behind it, so a stream of reviews can't starve it.
  const held = new Set<string>();
  const ids: string[] = [];
  for (const entry of entries) {
    if (entry.state !== 'queued') {
      continue;
    }
    if (entry.inTask && taskSlots <= 0) {
      continue;
    }
    const blocked = going.some((other) => conflicts(entry, other)) || (entry.onCheckout && held.has(entry.repoPath));
    if (blocked) {
      if (entry.lane === 'edit') {
        held.add(entry.repoPath);
      }
      continue;
    }
    if (entry.inTask) {
      taskSlots -= 1;
    }
    going.push(entry);
    ids.push(entry.id);
  }
  return ids;
}
