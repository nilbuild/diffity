import { dehydrate, hydrate, type DehydratedState, type QueryClient } from '@tanstack/react-query';
import { repoBase } from '../hooks/use-repo';

const LOCATIONS_KEY = 'diffity-repo-locations';
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
}

export function lastLocationFor(repoPath: string): string | null {
  return readLocations()[repoPath] ?? null;
}

let cacheOwner: string | null = null;

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
    caches.set(cacheOwner, dehydrate(client, { shouldDehydrateQuery: (query) => query.state.status === 'success' }));
  }
  void client.cancelQueries();
  client.clear();
  const saved = caches.get(repoPath);
  if (saved) {
    hydrate(client, saved);
  }
  cacheOwner = repoPath;
}
