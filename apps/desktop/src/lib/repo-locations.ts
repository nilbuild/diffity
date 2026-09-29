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

/**
 * Query keys are not repository-scoped, so switching repositories swaps the whole cache: the outgoing
 * repository's successful queries are parked and the incoming one's are restored (then refetched as stale),
 * which makes switching back instant.
 */
export function swapRepoCache(client: QueryClient, from: string | null, to: string) {
  if (from) {
    caches.set(from, dehydrate(client, { shouldDehydrateQuery: (query) => query.state.status === 'success' }));
  }
  client.clear();
  const saved = caches.get(to);
  if (saved) {
    hydrate(client, saved);
  }
}
