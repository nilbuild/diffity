import { WebviewWindow } from '@tauri-apps/api/webviewWindow';
import { hashString } from './hash';

export function repoRoute(path: string, extra?: Record<string, string>) {
  const params = new URLSearchParams({ path, ...extra });
  return `/repo?${params.toString()}`;
}

export async function openRepoInNewWindow(path: string, extra?: Record<string, string>) {
  const label = `repo-${hashString(path).slice(0, 12)}`;
  const existing = await WebviewWindow.getByLabel(label).catch(() => null);
  if (existing) {
    await existing.setFocus();
    return;
  }
  const name = path.split('/').filter(Boolean).pop() ?? 'Diffity';
  new WebviewWindow(label, {
    url: `index.html#${repoRoute(path, extra)}`,
    title: name,
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    titleBarStyle: 'overlay',
    hiddenTitle: true,
  });
}
