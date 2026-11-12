import { getCurrentWindow } from '@tauri-apps/api/window';
import { WebviewWindow } from '@tauri-apps/api/webviewWindow';
import { emitTo } from '@tauri-apps/api/event';
import { hashString } from './hash';
import { isLinux, isTauri } from './platform';

/** Asks a repository's window to show a route (a link with a PR, ref or file, opened while that window was already open). */
export const NAVIGATE_EVENT = 'navigate-to';

export type RepoPage = 'diff' | 'tree' | 'overview';

export function repoRoute(path: string, extra?: Record<string, string>, page: RepoPage = 'diff') {
  const params = new URLSearchParams(extra);
  const query = params.toString();
  return `/r/${encodeURIComponent(path)}/${page}${query ? `?${query}` : ''}`;
}

export async function openRepoInNewWindow(path: string, extra?: Record<string, string>, page: RepoPage = 'diff') {
  const label = `repo-${hashString(path).slice(0, 12)}`;
  const existing = await WebviewWindow.getByLabel(label).catch(() => null);
  if (existing) {
    if (extra && Object.keys(extra).length > 0) {
      await emitTo(label, NAVIGATE_EVENT, repoRoute(path, extra, page)).catch(() => undefined);
    }
    await existing.setFocus();
    return;
  }
  const name = path.split('/').filter(Boolean).pop() ?? 'Diffity';
  new WebviewWindow(label, {
    url: `index.html#${repoRoute(path, extra, page)}`,
    title: name,
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    titleBarStyle: 'overlay',
    hiddenTitle: true,
    decorations: !isLinux,
    backgroundColor: currentBackground(),
  });
}

const WINDOW_BACKGROUNDS = {
  light: '#ffffff',
  dark: '#171717',
} as const;

function currentBackground() {
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  return isDark ? WINDOW_BACKGROUNDS.dark : WINDOW_BACKGROUNDS.light;
}

export function syncWindowBackground(theme: keyof typeof WINDOW_BACKGROUNDS) {
  if (!isTauri) {
    return;
  }
  getCurrentWindow()
    .setBackgroundColor(WINDOW_BACKGROUNDS[theme])
    .catch(() => {});
}
