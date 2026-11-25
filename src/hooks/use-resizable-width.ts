import { useCallback, useEffect, useRef, useState } from 'react';
import { create } from 'zustand';

export interface ResizableWidth {
  /** Where the width is remembered; panels that take turns in one spot share a key. */
  storageKey: string;
  defaultWidth: number;
  minWidth: number;
  /** The widest it gets, as a share of the window. */
  maxFraction: number;
  /** The edge you drag: a left sidebar's right edge, a right panel's left edge. */
  edge: 'left' | 'right';
}

/** Current widths by storage key, so things beside a panel (toasts) can follow it as it's dragged. */
export const usePanelWidths = create<Record<string, number>>(() => ({}));

function readStored(key: string): number | null {
  try {
    const stored = Number(localStorage.getItem(key));
    return stored > 0 ? stored : null;
  } catch {
    return null;
  }
}

function store(key: string, width: number | null) {
  try {
    if (width === null) {
      localStorage.removeItem(key);
      return;
    }
    localStorage.setItem(key, String(width));
  } catch {
    return;
  }
}

/** A width you drag with a handle on one edge; double-click resets it. Remembered per `storageKey`. */
export function useResizableWidth(options: ResizableWidth) {
  const { storageKey, defaultWidth, minWidth, maxFraction, edge } = options;
  const clamp = useCallback(
    (width: number) => Math.min(Math.max(minWidth, Math.floor(window.innerWidth * maxFraction)), Math.max(minWidth, Math.round(width))),
    [minWidth, maxFraction],
  );
  const live = usePanelWidths((state) => state[storageKey]);
  const width = live ?? clamp(readStored(storageKey) ?? defaultWidth);
  const [dragging, setDragging] = useState(false);
  const drag = useRef<{ startX: number; startWidth: number } | null>(null);

  const setWidth = useCallback((next: number) => usePanelWidths.setState({ [storageKey]: next }), [storageKey]);

  useEffect(() => {
    if (live === undefined) {
      setWidth(width);
    }
  }, [live, width, setWidth]);

  useEffect(() => {
    const onResize = () => {
      const current = usePanelWidths.getState()[storageKey];
      if (current !== undefined) {
        setWidth(clamp(current));
      }
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [storageKey, clamp, setWidth]);

  const onPointerDown = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) {
      return;
    }
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { startX: event.clientX, startWidth: width };
    setDragging(true);
  }, [width]);

  const onPointerMove = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (!drag.current) {
      return;
    }
    const moved = event.clientX - drag.current.startX;
    setWidth(clamp(drag.current.startWidth + (edge === 'right' ? moved : -moved)));
  }, [clamp, edge, setWidth]);

  const onPointerUp = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (!drag.current) {
      return;
    }
    event.currentTarget.releasePointerCapture(event.pointerId);
    drag.current = null;
    setDragging(false);
    store(storageKey, usePanelWidths.getState()[storageKey] ?? null);
  }, [storageKey]);

  const onDoubleClick = useCallback(() => {
    store(storageKey, null);
    setWidth(clamp(defaultWidth));
  }, [storageKey, defaultWidth, clamp, setWidth]);

  return { width, dragging, handle: { onPointerDown, onPointerMove, onPointerUp, onPointerCancel: onPointerUp, onDoubleClick } };
}
