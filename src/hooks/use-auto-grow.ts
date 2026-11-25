import { useLayoutEffect, type RefObject } from 'react';

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
