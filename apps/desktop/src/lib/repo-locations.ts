import { dehydrate, hydrate, type DehydratedState, type QueryClient } from '@tanstack/react-query';
import { repoBase } from '../hooks/use-repo';

const LOCATIONS_KEY = 'diffity-repo-locations';
const VIEW_LOCATIONS_KEY = 'diffity-view-locations';
const TRANSIENT_PARAMS = ['thread', 'file', 'pr'];
const caches = new Map<string, DehydratedState>();

function readLocations(): Record<string, string> {
  try {
    const parsed = JSON.parse(localStorage.getItem(LOCATIONS_KEY) ?? '{}');
    return typeof parsed === 'object' && parsed ? (parsed as Record<string, string>) : {};
  } catch {
    return {};
  }
}

/** Remembers the view (page + ref) last shown for a repository, so switching back restores it. */
export function rememberLocation(repoPath: string, location: string) {
  if (!location.startsWith(repoBase(repoPath))) {
    return;
  }
  try {
    const all = readLocations();
    all[repoPath] = location;
    localStorage.setItem(LOCATIONS_KEY, JSON.stringify(all));
  } catch {
    return;
  }
  rememberViewLocation(repoPath, location);
}

export function lastLocationFor(repoPath: string): string | null {
  return readLocations()[repoPath] ?? null;
}

export type RememberedView = 'diff' | 'tree';

function readViewLocations(): Record<string, Partial<Record<RememberedView, string>>> {
  try {
    const parsed = JSON.parse(localStorage.getItem(VIEW_LOCATIONS_KEY) ?? '{}');
    return typeof parsed === 'object' && parsed ? (parsed as Record<string, Partial<Record<RememberedView, string>>>) : {};
  } catch {
    return {};
  }
}

function viewOf(repoPath: string, location: string): RememberedView | null {
  const rest = location.slice(repoBase(repoPath).length);
  if (rest.startsWith('/diff')) {
    return 'diff';
  }
  if (rest.startsWith('/tree')) {
    return 'tree';
  }
  return null;
}

/** Remembers each view's last location per repository (the diff's ref, the open file), so switching views keeps them. */
function rememberViewLocation(repoPath: string, location: string) {
  const view = viewOf(repoPath, location);
  if (!view) {
    return;
  }
  const [path, query = ''] = location.split('?');
  const params = new URLSearchParams(query);
  for (const name of TRANSIENT_PARAMS) {
    params.delete(name);
  }
  const search = params.toString();
  try {
    const all = readViewLocations();
    all[repoPath] = { ...all[repoPath], [view]: search ? `${path}?${search}` : path };
    localStorage.setItem(VIEW_LOCATIONS_KEY, JSON.stringify(all));
  } catch {
    return;
  }
}

export function lastViewLocationFor(repoPath: string, view: RememberedView): string | null {
  return readViewLocations()[repoPath]?.[view] ?? null;
}

let cacheOwner: string | null = null;

/** Queries that are not about one repository; they survive switching (the rail and palettes read them). */
const GLOBAL_KEYS = new Set(['recent-repos', 'setting', 'github-auth', 'agents', 'quick-open-roots', 'dir-suggestions']);

/**
 * Query keys are not repository-scoped, so the cache belongs to one repository at a time. Switching parks the
 * owner's successful queries and restores the incoming repository's (then refetched as stale), which makes
 * switching back instant. The owner is tracked here rather than via the API's current path, because the
 * welcome screen resets that path while the cache still holds the previous repository's data.
 */
export function activateRepoCache(client: QueryClient, repoPath: string) {
  if (cacheOwner === repoPath) {
    return;
  }
  if (cacheOwner) {
    caches.set(cacheOwner, dehydrate(client, { shouldDehydrateQuery: (query) => query.state.status === 'success' && !GLOBAL_KEYS.has(String(query.queryKey[0])) }));
  }
  const cache = client.getQueryCache();
  for (const query of cache.getAll()) {
    if (GLOBAL_KEYS.has(String(query.queryKey[0]))) {
      continue;
    }
    void client.cancelQueries({ queryKey: query.queryKey, exact: true });
    cache.remove(query);
  }
  const saved = caches.get(repoPath);
  if (saved) {
    hydrate(client, saved);
  }
  cacheOwner = repoPath;
}
