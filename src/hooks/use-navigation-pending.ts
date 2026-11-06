import { useSyncExternalStore } from 'react';
import { useLocation } from 'react-router';

const listeners = new Set<() => void>();
let patched = false;

function notify() {
  for (const listener of listeners) {
    listener();
  }
}

/**
 * The router renders a navigation in a transition and keeps the current screen up until the next one is ready, so
 * the URL changes before the rendered location does. History methods are wrapped to hear about the URL at once.
 */
function watchHistory() {
  if (patched) {
    return;
  }
  patched = true;
  for (const method of ['pushState', 'replaceState'] as const) {
    const original = window.history[method].bind(window.history);
    window.history[method] = (...args: Parameters<History['pushState']>) => {
      original(...args);
      notify();
    };
  }
  window.addEventListener('popstate', notify);
  window.addEventListener('hashchange', notify);
}

function subscribe(listener: () => void) {
  watchHistory();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function normalized(path: string): string {
  try {
    return decodeURIComponent(path);
  } catch {
    return path;
  }
}

function urlLocation() {
  return normalized(window.location.hash.slice(1) || '/');
}

/** A navigation has started (the URL moved on) but the screen still shows the previous location. */
export function useNavigationPending(): boolean {
  const location = useLocation();
  const url = useSyncExternalStore(subscribe, urlLocation);
  return url !== normalized(`${location.pathname}${location.search}${location.hash}`);
}
