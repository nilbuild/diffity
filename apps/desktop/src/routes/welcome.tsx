import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import { getCurrentWebview } from '@tauri-apps/api/webview';
import { useHotkeys } from 'react-hotkeys-hook';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import { toast } from 'sonner';
import * as tauri from '../lib/tauri';
import { isTauri, modKey } from '../lib/platform';
import { setRepoPath } from '../lib/api';
import type { RecentRepo } from '../lib/types';
import { openRepoInNewWindow, repoRoute } from '../lib/window';
import { parsePrUrl, pickFolder, remoteMatches } from '../features/welcome/open-repo';
import { useTheme } from '../hooks/use-theme';
import { BrandLogo } from '../components/icons/brand-logo';
import { FolderOpenIcon } from '../components/icons/folder-open-icon';
import { GitHubIcon } from '../components/icons/github-icon';
import { XIcon } from '../components/icons/x-icon';
import { SunIcon } from '../components/icons/sun-icon';
import { MoonIcon } from '../components/icons/moon-icon';
import { hasOverlayTitleBar } from '../components/layout/title-bar';
import { hideStaticSplash } from '../components/layout/skeleton';
import { SettingsIcon } from '../components/icons/settings-icon';
import { openSettings } from '../lib/ui-store';
import { cn } from '../lib/cn';
import { buttonIcon, buttonOutline, buttonPrimary } from '../components/ui/button-styles';

dayjs.extend(relativeTime);

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

function useRecentRepos() {
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

  return { repos, all: recent.data ?? [], loading: recent.isLoading, remove };
}

function useFolderDrop(onDrop: (path: string) => void, setDragging: (dragging: boolean) => void) {
  useEffect(() => {
    if (!isTauri) {
      return;
    }
    let unlisten: (() => void) | null = null;
    let disposed = false;
    void getCurrentWebview()
      .onDragDropEvent((event) => {
        const payload = event.payload;
        if (payload.type === 'enter' || payload.type === 'over') {
          setDragging(true);
          return;
        }
        setDragging(false);
        if (payload.type !== 'drop' || payload.paths.length === 0) {
          return;
        }
        onDrop(payload.paths[0]);
      })
      .then((fn) => {
        if (disposed) {
          fn();
          return;
        }
        unlisten = fn;
      });
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [onDrop, setDragging]);
}

export function WelcomePage() {
  const navigate = useNavigate();
  const { theme, toggleTheme } = useTheme();
  const recent = useRecentRepos();
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    setRepoPath(null);
    document.title = 'Diffity';
    hideStaticSplash();
  }, []);

  const openRepo = async (path: string, newWindow = false, extra?: Record<string, string>) => {
    try {
      const info = await tauri.openRepo(path);
      if (!info.isGit) {
        toast.error(`${info.name} is not a Git repository`, {
          description: 'Diffity reviews changes tracked by Git. Run `git init` in that folder, or pick the repository root.',
        });
        return;
      }
      if (newWindow) {
        await openRepoInNewWindow(info.path, extra);
        return;
      }
      navigate(repoRoute(info.path, extra));
    } catch (error) {
      toast.error('Could not open the folder', { description: `${tauri.errorMessage(error)}. It may have been moved or deleted.` });
    }
  };

  const openFolder = async (newWindow = false) => {
    const path = await pickFolder();
    if (!path) {
      return;
    }
    await openRepo(path, newWindow);
  };

  useHotkeys('mod+o', (event) => {
    event.preventDefault();
    void openFolder();
  });

  useFolderDrop((path) => void openRepo(path), setDragging);

  return (
    <div className="relative flex flex-col h-screen bg-bg text-text font-sans">
      <div data-tauri-drag-region className={cn('flex items-center justify-end gap-0.5 h-11 shrink-0 px-2', hasOverlayTitleBar && 'pl-[84px]')}>
        <button onClick={openSettings} className={buttonIcon} title={`Settings (${modKey},)`}>
          <SettingsIcon className="w-4 h-4" />
        </button>
        <button onClick={toggleTheme} className={buttonIcon} title={theme === 'light' ? 'Dark mode' : 'Light mode'}>
          {theme === 'light' ? <MoonIcon className="w-4 h-4" /> : <SunIcon className="w-4 h-4" />}
        </button>
      </div>
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-[480px] mx-auto px-4 pt-[10vh] pb-10">
          <div className="flex items-center gap-3 mb-6">
            <BrandLogo className="w-8 h-8 shrink-0" />
            <div className="min-w-0">
              <h1 className="text-base font-semibold text-text leading-5">diffity</h1>
              <p className="text-xs text-text-muted truncate">Review code and hand comments to Claude</p>
            </div>
            <button onClick={() => void openFolder()} className={cn(buttonPrimary, 'ml-auto')} title="Open a Git repository (⌘-click a recent one to open it in a new window)">
              <FolderOpenIcon className="w-3.5 h-3.5" />
              Open folder
              <kbd className="font-sans text-white/70">{modKey}O</kbd>
            </button>
          </div>

          <div className="flex items-center justify-between h-7 mb-1">
            <h2 className="text-xs font-medium text-text-muted">Recent</h2>
          </div>
          <RecentList repos={recent.repos} loading={recent.loading} onOpen={openRepo} onRemove={recent.remove} />

          <div className="mt-6">
            <PrUrlForm recent={recent.all} onOpen={openRepo} />
          </div>
          <p className="mt-6 text-center text-[11px] text-text-muted">Or drop a folder anywhere on this window</p>
        </div>
      </div>
      {dragging && (
        <div className="pointer-events-none absolute inset-3 flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-accent bg-accent/5 text-sm font-medium text-accent">
          <FolderOpenIcon className="w-6 h-6" />
          Drop a folder to open it
        </div>
      )}
    </div>
  );
}

interface RecentListProps {
  repos: RecentRepo[];
  loading: boolean;
  onOpen: (path: string, newWindow?: boolean) => void;
  onRemove: (path: string) => void;
}

function RecentList(props: RecentListProps) {
  const { repos, loading, onOpen, onRemove } = props;

  if (loading) {
    return <div className="h-24" />;
  }
  if (repos.length === 0) {
    return (
      <p className="text-xs text-text-muted px-2 py-3 rounded-md border border-dashed border-border text-center">
        Repositories you open show up here
      </p>
    );
  }
  return (
    <ul className="-mx-2">
      {repos.map((repo) => (
        <RecentRow key={repo.path} repo={repo} onOpen={onOpen} onRemove={onRemove} />
      ))}
    </ul>
  );
}

function RecentRow(props: { repo: RecentRepo; onOpen: (path: string, newWindow?: boolean) => void; onRemove: (path: string) => void }) {
  const { repo, onOpen, onRemove } = props;
  const parent = repo.path.replace(/^\/Users\/[^/]+/, '~').replace(/\/[^/]+\/?$/, '');

  return (
    <li className="group relative flex items-center rounded-md hover:bg-hover transition-colors">
      <button
        onClick={(event) => onOpen(repo.path, event.metaKey || event.ctrlKey)}
        className="flex flex-1 min-w-0 items-center gap-2 h-8 px-2 text-left cursor-pointer"
        title={repo.path}
      >
        <span className="text-[13px] font-medium text-text truncate shrink-0 max-w-[60%]">{repo.name}</span>
        <span className="text-xs text-text-muted font-mono truncate min-w-0 flex-1">{parent}</span>
        <span className="text-[11px] text-text-muted shrink-0 group-hover:invisible">{dayjs(repo.lastOpenedAt).fromNow()}</span>
      </button>
      <button
        onClick={() => onRemove(repo.path)}
        className="absolute right-1 p-1 rounded text-text-muted hover:text-text hover:bg-hover invisible group-hover:visible cursor-pointer"
        title="Remove from recent"
      >
        <XIcon className="w-3.5 h-3.5" />
      </button>
    </li>
  );
}

function PrUrlForm(props: { recent: RecentRepo[]; onOpen: (path: string, newWindow?: boolean, extra?: Record<string, string>) => Promise<void> }) {
  const { recent, onOpen } = props;
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const pr = parsePrUrl(url);
    if (!pr) {
      toast.error('Enter a GitHub pull request URL, e.g. https://github.com/owner/repo/pull/123');
      return;
    }
    setBusy(true);
    try {
      for (const repo of recent) {
        const info = await tauri.openRepo(repo.path).catch(() => null);
        if (info && remoteMatches(info.remoteUrl, pr.owner, pr.repo)) {
          await onOpen(repo.path, false, { pr: url.trim() });
          return;
        }
      }
      toast.info(`Select your local clone of ${pr.owner}/${pr.repo}`);
      const path = await pickFolder();
      if (!path) {
        return;
      }
      await onOpen(path, false, { pr: url.trim() });
    } finally {
      setBusy(false);
    }
  };

  return (
    <form
      className="flex items-center gap-1.5"
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <div className="relative flex-1 min-w-0">
        <GitHubIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-muted pointer-events-none" />
        <input
          type="text"
          value={url}
          onChange={(event) => setUrl(event.target.value)}
          placeholder="Open a pull request URL…"
          className="w-full h-7 text-xs bg-bg border border-border rounded-md pl-8 pr-3 text-text placeholder:text-text-muted focus:outline-none focus:border-accent"
        />
      </div>
      {url.trim() && (
        <button type="submit" disabled={busy} className={buttonOutline}>
          {busy ? 'Opening…' : 'Open'}
        </button>
      )}
    </form>
  );
}
