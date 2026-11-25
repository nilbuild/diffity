import { useLayoutEffect, type RefObject } from 'react';

/** Sizes a textarea to its text, from its minimum height up to `max` pixels, then scrolls; no drag handle needed. */
export function useAutoGrow(ref: RefObject<HTMLTextAreaElement | null>, value: string, max: number | undefined) {
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !max) {
      return;
    }
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight + el.offsetHeight - el.clientHeight, max)}px`;
    el.style.overflowY = el.scrollHeight > el.clientHeight ? 'auto' : 'hidden';
  }, [ref, value, max]);
}
