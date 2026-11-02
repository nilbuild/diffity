import { open } from '@tauri-apps/plugin-dialog';
import { toast } from 'sonner';
import * as api from '@/lib/api';
import * as tauri from '@/lib/tauri';

export async function pickFolder(title = 'Open repository'): Promise<string | null> {
  try {
    const selected = await open({ directory: true, multiple: false, title });
    return typeof selected === 'string' ? selected : null;
  } catch (error) {
    toast.error(api.errorMessage(error));
    return null;
  }
}

export function parsePrUrl(input: string): { owner: string; repo: string; number: number } | null {
  const match = /github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)/.exec(input.trim());
  if (!match) {
    return null;
  }
  return { owner: match[1], repo: match[2].replace(/\.git$/, ''), number: Number(match[3]) };
}

export function remoteMatches(remoteUrl: string | null, owner: string, repo: string): boolean {
  if (!remoteUrl) {
    return false;
  }
  const normalized = remoteUrl.toLowerCase().replace(/\.git$/, '');
  return normalized.endsWith(`/${owner}/${repo}`.toLowerCase()) || normalized.endsWith(`:${owner}/${repo}`.toLowerCase());
}

export async function isCloneOf(path: string, pr: { owner: string; repo: string }): Promise<boolean> {
  const remotes = await tauri.repoRemoteUrls(path).catch(() => []);
  return remotes.some((remote) => remoteMatches(remote, pr.owner, pr.repo));
}

/** The first of `paths` with a remote on the pull request's repository (`upstream` counts, for forks). */
export async function findLocalClone(paths: string[], pr: { owner: string; repo: string }): Promise<string | null> {
  for (const path of paths) {
    if (await isCloneOf(path, pr)) {
      return path;
    }
  }
  return null;
}
