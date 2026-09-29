import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';

const LINE_HEIGHT = 22;
/** Slices within this distance of the viewport stay mounted, so a fast scroll rarely shows a blank band. */
const MARGIN = 1600;

const listeners = new Set<() => void>();
let frame = 0;

function flush() {
  frame = 0;
  for (const listener of listeners) {
    listener();
  }
}

function schedule() {
  if (frame) {
    return;
  }
  frame = requestAnimationFrame(flush);
}

function subscribe(listener: () => void) {
  if (listeners.size === 0) {
    document.addEventListener('scroll', schedule, { capture: true, passive: true });
    window.addEventListener('resize', schedule);
  }
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      document.removeEventListener('scroll', schedule, { capture: true });
      window.removeEventListener('resize', schedule);
    }
  };
}

interface LazySliceProps {
  rows: number;
  /** Keep mounted (a thread or the composer lives here, so find-in-page and scroll-to-thread can reach it). */
  pinned?: boolean;
  children: ReactNode;
}

/**
 * Renders a run of table rows only while it is near the viewport; otherwise one spacer row of the height it last
 * measured (or an estimate), so scrolling never jumps. Two empty tbody markers bracket the slice for measuring.
 */
export function LazySlice(props: LazySliceProps) {
  const { rows, pinned = false, children } = props;
  const startRef = useRef<HTMLTableSectionElement>(null);
  const endRef = useRef<HTMLTableSectionElement>(null);
  const heightRef = useRef<number | null>(null);
  const [near, setNear] = useState(false);

  useLayoutEffect(() => {
    const check = () => {
      const start = startRef.current;
      const end = endRef.current;
      if (!start || !end) {
        return;
      }
      const top = start.getBoundingClientRect().top;
      const bottom = end.getBoundingClientRect().top;
      const visible = bottom > -MARGIN && top < window.innerHeight + MARGIN;
      setNear((current) => {
        if (current) {
          heightRef.current = bottom - top;
        }
        return visible;
      });
    };
    check();
    return subscribe(check);
  }, []);

  const mounted = near || pinned;
  const height = heightRef.current ?? rows * LINE_HEIGHT;

  return (
    <>
      <tbody ref={startRef} />
      {mounted ? (
        children
      ) : (
        <tbody aria-hidden>
          <tr style={{ height }}>
            <td colSpan={4} className="p-0" />
          </tr>
        </tbody>
      )}
      <tbody ref={endRef} />
    </>
  );
}
