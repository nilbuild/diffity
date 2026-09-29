import { getRepoPathOrNull } from './api';

const PREFIX = 'diffity-view:';

function key(ref: string, name: string) {
  return `${PREFIX}${getRepoPathOrNull() ?? ''}:${ref}:${name}`;
}

/** Per repository + view state (open composer, scroll anchor, collapsed files) that must survive refreshes and reloads. */
export function readViewMemory<T>(ref: string, name: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key(ref, name));
    return raw === null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

export function writeViewMemory(ref: string, name: string, value: unknown) {
  try {
    if (value === null || value === undefined) {
      localStorage.removeItem(key(ref, name));
      return;
    }
    localStorage.setItem(key(ref, name), JSON.stringify(value));
  } catch {
    return;
  }
}
