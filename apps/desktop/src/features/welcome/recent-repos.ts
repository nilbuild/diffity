import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { NavigateFunction } from 'react-router';
import { toast } from 'sonner';
import * as tauri from '../../lib/tauri';
import { queryClient } from '../../lib/query-client';
import { openRepoInNewWindow, repoRoute } from '../../lib/window';
import { beginOpening, endOpening, setOpeningStep } from '../../lib/opening';

const HIDDEN_KEY = 'welcome.hiddenRepos';

function parseHidden(value: string | null | undefined): Record<string, string> {
  if (!value) {
    return {};
  }
  try {
    const parsed = JSON.parse(value);
    return typeof parsed === 'object' && parsed ? (parsed as Record<string, string>) : {};
  } catch {
    return {};
  }
}

export function useRecentRepos() {
  const queryClient = useQueryClient();
  const recent = useQuery({ queryKey: ['recent-repos'], queryFn: tauri.recentRepos });
  const hiddenQuery = useQuery({ queryKey: ['setting', HIDDEN_KEY], queryFn: () => tauri.getSetting(HIDDEN_KEY) });
  const hidden = parseHidden(hiddenQuery.data);
  const repos = (recent.data ?? []).filter((repo) => {
    const hiddenAt = hidden[repo.path];
    return !hiddenAt || repo.lastOpenedAt > hiddenAt;
  });

  const remove = async (path: string) => {
    const value = JSON.stringify({ ...hidden, [path]: new Date().toISOString() });
    queryClient.setQueryData(['setting', HIDDEN_KEY], value);
    try {
      await tauri.setSetting(HIDDEN_KEY, value);
    } catch (error) {
      toast.error('Could not update recent repositories', { description: tauri.errorMessage(error) });
    }
  };

  const restore = async (path: string) => {
    const next = { ...hidden };
    delete next[path];
    const value = JSON.stringify(next);
    queryClient.setQueryData(['setting', HIDDEN_KEY], value);
    await tauri.setSetting(HIDDEN_KEY, value).catch(() => undefined);
  };

  return { repos, all: recent.data ?? [], loading: recent.isLoading, remove, restore };
}


export function shortPath(path: string): string {
  const home = path.replace(/^\/Users\/[^/]+/, '~');
  if (home.startsWith('/private/tmp/') || home.startsWith('/tmp/') || home.startsWith('/var/folders/')) {
    const parts = home.split('/').filter(Boolean);
    return `…/${parts.slice(-2).join('/')}`;
  }
  return home;
}

export function parentPath(path: string): string {
  return shortPath(path).replace(/\/[^/]+\/?$/, '') || '/';
}

/** Opening a project again brings it back to the rail and the recent list if it had been removed. */
async function unhideRepo(path: string) {
  const current = parseHidden(queryClient.getQueryData<string | null>(['setting', HIDDEN_KEY]) ?? (await tauri.getSetting(HIDDEN_KEY).catch(() => null)));
  if (current[path]) {
    delete current[path];
    const value = JSON.stringify(current);
    queryClient.setQueryData(['setting', HIDDEN_KEY], value);
    await tauri.setSetting(HIDDEN_KEY, value).catch(() => undefined);
  }
  void queryClient.invalidateQueries({ queryKey: ['recent-repos'] });
}

export async function openRepoAt(path: string, navigate: NavigateFunction, options?: { newWindow?: boolean; extra?: Record<string, string> }) {
  if (!options?.newWindow) {
    beginOpening(path);
  }
  try {
    const info = await tauri.openRepo(path);
    if (!info.isGit) {
      endOpening();
      toast.error(`${info.name} is not a Git repository`, {
        description: 'Diffity reviews changes tracked by Git. Run `git init` in that folder, or pick the repository root.',
      });
      return;
    }
    if (options?.newWindow) {
      await openRepoInNewWindow(info.path, options.extra);
      return;
    }
    setOpeningStep('Reading changes');
    void unhideRepo(info.path);
    navigate(repoRoute(info.path, options?.extra), { state: { fresh: true } });
  } catch (error) {
    endOpening();
    toast.error('Could not open the folder', { description: `${tauri.errorMessage(error)}. It may have been moved or deleted.` });
  }
}
