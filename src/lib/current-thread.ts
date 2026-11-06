import { create } from 'zustand';

/**
 * The thread the review keys act on: the last one stepped to with ] / [ (or opened from a link, which flashes it the
 * same way), or the last one clicked.
 */
export const useCurrentThread = create<{ id: string | null }>(() => ({ id: null }));

export function setCurrentThread(id: string | null) {
  if (useCurrentThread.getState().id === id) {
    return;
  }
  useCurrentThread.setState({ id });
}

let tracking = 0;
let untrack: (() => void) | null = null;

function threadIdOf(target: EventTarget | null): string | null {
  const element = target instanceof Element ? target.closest('[data-thread-id]') : null;
  return element?.getAttribute('data-thread-id') ?? null;
}

/** Follows focus moves (the `diffity:focus-thread` flash) and clicks inside threads while any caller needs it. */
export function trackCurrentThread(): () => void {
  tracking += 1;
  if (tracking === 1) {
    const onFocus = (event: Event) => {
      const id = threadIdOf(event.target);
      if (id) {
        setCurrentThread(id);
      }
    };
    const onPointer = (event: PointerEvent) => {
      const id = threadIdOf(event.target);
      if (id) {
        setCurrentThread(id);
      }
    };
    // Capture: the focus event doesn't bubble.
    window.addEventListener('diffity:focus-thread', onFocus, true);
    window.addEventListener('pointerdown', onPointer, true);
    untrack = () => {
      window.removeEventListener('diffity:focus-thread', onFocus, true);
      window.removeEventListener('pointerdown', onPointer, true);
    };
  }
  return () => {
    tracking -= 1;
    if (tracking === 0) {
      untrack?.();
      untrack = null;
    }
  };
}

/**
 * The index to step to among `count` open threads. `found` is the current thread's index (-1 when it is not among
 * them); `last` is where it was, so after it is resolved the next step lands on the thread that took its place.
 */
export function stepIndex(count: number, found: number, last: number, direction: 1 | -1): number {
  if (count === 0) {
    return -1;
  }
  if (found >= 0) {
    return (found + direction + count) % count;
  }
  if (last < 0) {
    return direction > 0 ? 0 : count - 1;
  }
  const slot = direction > 0 ? last : last - 1;
  return ((slot % count) + count) % count;
}
