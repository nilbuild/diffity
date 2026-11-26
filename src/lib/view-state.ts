import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type Dispatch, type RefObject, type SetStateAction } from 'react';
import { getRepoPathOrNull } from './api';

/**
 * In-memory UI state per repository (filters, expanded folders, open composers, scroll offsets, expanded context).
 * Views unmount when you switch between Home, Files and Changes or between projects; reading this back in the
 * first render restores them before the first paint.
 */
const MAX_ENTRIES = 5000;
const memory = new Map<string, unknown>();

function scoped(key: string) {
  return `${getRepoPathOrNull() ?? ''}\u0000${key}`;
}

function readScoped<T>(full: string, fallback: T): T {
  if (!memory.has(full)) {
    return fallback;
  }
  return memory.get(full) as T;
}

function writeScoped(full: string, value: unknown) {
  memory.delete(full);
  if (value === undefined) {
    return;
  }
  memory.set(full, value);
  if (memory.size > MAX_ENTRIES) {
    const oldest = memory.keys().next().value;
    if (oldest !== undefined) {
      memory.delete(oldest);
    }
  }
}

export function readViewState<T>(key: string, fallback: T): T {
  return readScoped(scoped(key), fallback);
}

export function writeViewState(key: string, value: unknown) {
  writeScoped(scoped(key), value);
}

/** One entry bound to the repository current at render, so an unmount cleanup after a project switch writes to the right one. */
export function useViewStateSlot<T>(key: string) {
  const full = scoped(key);
  return useMemo(() => ({
    read: (fallback: T) => readScoped<T>(full, fallback),
    write: (value: T | undefined) => writeScoped(full, value),
  }), [full]);
}

/** `useState` whose value is remembered per repository under `key` and restored when the component mounts again. */
export function useViewState<T>(key: string, initial: T | (() => T)): [T, Dispatch<SetStateAction<T>>] {
  const full = scoped(key);
  const resolveInitial = () => (typeof initial === 'function' ? (initial as () => T)() : initial);
  const [state, setState] = useState(() => ({ full, value: readScoped<T | undefined>(full, undefined) ?? resolveInitial() }));
  let current = state;
  if (state.full !== full) {
    current = { full, value: readScoped<T | undefined>(full, undefined) ?? resolveInitial() };
    setState(current);
  }

  const set = useCallback<Dispatch<SetStateAction<T>>>((next) => {
    setState((prev) => {
      if (prev.full !== full) {
        return prev;
      }
      const value = typeof next === 'function' ? (next as (value: T) => T)(prev.value) : next;
      writeScoped(full, value);
      // Scrolling sets the active file on every frame; returning prev lets React skip the re-render.
      return Object.is(value, prev.value) ? prev : { full, value };
    });
  }, [full]);

  return [current.value, set];
}

function storageKey(key: string): string {
  return `diffity-view:${getRepoPathOrNull() ?? ''}:${key}`;
}

function readStored<T>(stored: string): T | undefined {
  try {
    const raw = localStorage.getItem(stored);
    return raw === null ? undefined : (JSON.parse(raw) as T);
  } catch {
    return undefined;
  }
}

function writeStored(stored: string, value: unknown) {
  try {
    localStorage.setItem(stored, JSON.stringify(value));
  } catch {
    // Still remembered for this session.
  }
}

/** `useViewState` that also survives a restart, per repository. Only for small preferences (JSON in localStorage). */
export function usePersistedViewState<T>(key: string, initial: T): [T, Dispatch<SetStateAction<T>>] {
  const full = scoped(key);
  const stored = storageKey(key);
  if (!memory.has(full)) {
    const saved = readStored<T>(stored);
    if (saved !== undefined) {
      writeScoped(full, saved);
    }
  }
  const [value, setValue] = useViewState<T>(key, initial);
  const set = useCallback<Dispatch<SetStateAction<T>>>((next) => {
    setValue((prev) => {
      const resolved = typeof next === 'function' ? (next as (value: T) => T)(prev) : next;
      writeStored(stored, resolved);
      return resolved;
    });
  }, [setValue, stored]);

  return [value, set];
}

/**
 * Keeps a scroll container's offset under `key`: restored before the first paint, and again while content that
 * loads late (images, diagrams, a skeleton being replaced) grows the container, until the user scrolls.
 */
export function useRestoredScroll(ref: RefObject<HTMLElement | null>, key: string) {
  const full = scoped(key);
  const restoring = useRef(false);

  useLayoutEffect(() => {
    const el = ref.current;
    const target = readScoped<number>(full, 0);
    if (!el) {
      return;
    }
    el.scrollTop = target;
    if (Math.abs(el.scrollTop - target) < 1) {
      return;
    }
    restoring.current = true;
    const stop = () => {
      restoring.current = false;
      observer.disconnect();
      window.clearTimeout(timer);
      el.removeEventListener('wheel', stop);
      el.removeEventListener('keydown', stop);
      el.removeEventListener('pointerdown', stop);
    };
    const observer = new ResizeObserver(() => {
      el.scrollTop = target;
      if (Math.abs(el.scrollTop - target) < 1) {
        stop();
      }
    });
    for (const child of Array.from(el.children)) {
      observer.observe(child);
    }
    const timer = window.setTimeout(stop, 3000);
    el.addEventListener('wheel', stop, { passive: true });
    el.addEventListener('keydown', stop);
    el.addEventListener('pointerdown', stop);
    return stop;
  }, [ref, full]);

  useEffect(() => {
    const el = ref.current;
    if (!el) {
      return;
    }
    const save = () => {
      if (restoring.current) {
        return;
      }
      writeScoped(full, el.scrollTop);
    };
    el.addEventListener('scroll', save, { passive: true });
    return () => el.removeEventListener('scroll', save);
  }, [ref, full]);
}
