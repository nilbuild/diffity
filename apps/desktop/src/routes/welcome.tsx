import { useEffect, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { getCurrentWebview } from '@tauri-apps/api/webview';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import { toast } from 'sonner';
import * as tauri from '../lib/tauri';
import { isTauri, modKey } from '../lib/platform';
import { setRepoPath } from '../lib/api';
import type { RecentRepo } from '../lib/types';
import { parsePrUrl, pickFolder, remoteMatches } from '../features/welcome/open-repo';
import { openQuickOpen } from '../features/palette/quick-open';
import { openRepoAt, parentPath, useRecentRepos } from '../features/welcome/recent-repos';
import { RepoBadge } from '../features/welcome/repo-badge';
import { useTheme } from '../hooks/use-theme';
import { BrandLogo } from '../components/icons/brand-logo';
import { hasOverlayTitleBar } from '../components/layout/title-bar';
import { hideStaticSplash } from '../components/layout/skeleton';
import { openSettings } from '../lib/ui-store';
import { cn } from '../lib/cn';
import { buttonIcon, buttonPrimary, inputField } from '../components/ui/button-styles';
import { DownloadIcon, FolderOpenIcon, GitHubIcon, GitPullRequestIcon, MoonIcon, SettingsIcon, SunIcon, XIcon } from '../components/ui/icon';

dayjs.extend(relativeTime);

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
  const [mode, setMode] = useState<'clone' | 'pr' | null>(null);

  useEffect(() => {
    setRepoPath(null);
    document.title = 'Diffity';
    hideStaticSplash();
  }, []);

  const openRepo = (path: string, newWindow = false, extra?: Record<string, string>) => openRepoAt(path, navigate, { newWindow, extra });




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
        <div className="max-w-[640px] mx-auto px-6 pt-[9vh] pb-12">
          <div className="flex items-center gap-3">
            <BrandLogo className="w-9 h-9 shrink-0" />
            <div className="min-w-0">
              <h1 className="text-[17px] font-semibold text-text leading-6">diffity</h1>
              <p className="text-[13px] text-text-secondary truncate">Review code and hand comments to Claude</p>
            </div>
          </div>

          <div className="mt-8 grid grid-cols-3 gap-3">
            <StartCard
              icon={<FolderOpenIcon className="w-[18px] h-[18px]" />}
              title="Open folder"
              detail={`A local Git repository · ${modKey}O`}
              onClick={openQuickOpen}
            />
            <StartCard
              icon={<DownloadIcon className="w-[18px] h-[18px]" />}
              title="Clone"
              detail="From a GitHub URL"
              active={mode === 'clone'}
              onClick={() => setMode(mode === 'clone' ? null : 'clone')}
            />
            <StartCard
              icon={<GitPullRequestIcon className="w-[18px] h-[18px]" />}
              title="Pull request"
              detail="Review a PR by URL"
              active={mode === 'pr'}
              onClick={() => setMode(mode === 'pr' ? null : 'pr')}
            />
          </div>
          {mode === 'clone' && (
            <div className="mt-3">
              <CloneForm onCloned={(path) => void openRepo(path)} />
            </div>
          )}
          {mode === 'pr' && (
            <div className="mt-3">
              <PrUrlForm recent={recent.all} onOpen={openRepo} />
            </div>
          )}

          <RecentList repos={recent.repos} loading={recent.loading} onOpen={openRepo} onRemove={recent.remove} />
          <p className="mt-6 text-center text-xs text-text-muted">Or drop a folder anywhere on this window</p>
        </div>
      </div>
      {dragging && (
        <div className="pointer-events-none absolute inset-3 flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-text-muted/50 bg-hover text-sm font-medium text-text">
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

function groupLabel(date: string) {
  const days = dayjs().startOf('day').diff(dayjs(date).startOf('day'), 'day');
  if (days <= 0) {
    return 'Today';
  }
  if (days < 7) {
    return 'This week';
  }
  return 'Earlier';
}

function RecentList(props: RecentListProps) {
  const { repos, loading, onOpen, onRemove } = props;

  if (loading) {
    return <div className="h-24" />;
  }
  if (repos.length === 0) {
    return (
      <p className="mt-10 text-[13px] text-text-secondary px-3 py-6 rounded-lg bg-bg-secondary text-center">
        Repositories you open show up here
      </p>
    );
  }
  const groups: { label: string; repos: RecentRepo[] }[] = [];
  for (const repo of repos) {
    const label = groupLabel(repo.lastOpenedAt);
    const last = groups[groups.length - 1];
    if (last && last.label === label) {
      last.repos.push(repo);
      continue;
    }
    groups.push({ label, repos: [repo] });
  }
  return (
    <div className="mt-10 space-y-5">
      {groups.map((group) => (
        <section key={group.label}>
          <h2 className="px-1 mb-1.5 text-xs font-medium text-text-secondary">{group.label}</h2>
          <ul className="rounded-lg border border-border bg-bg p-1">
            {group.repos.map((repo) => (
              <RecentRow key={repo.path} repo={repo} onOpen={onOpen} onRemove={onRemove} />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function RecentRow(props: { repo: RecentRepo; onOpen: (path: string, newWindow?: boolean) => void; onRemove: (path: string) => void }) {
  const { repo, onOpen, onRemove } = props;

  return (
    <li className="group relative flex items-center rounded-md hover:bg-hover transition-colors">
      <button
        onClick={(event) => onOpen(repo.path, event.metaKey || event.ctrlKey)}
        className="flex flex-1 min-w-0 items-center gap-3 h-11 px-2 text-left cursor-pointer"
        title={`${repo.path}\n${modKey}-click to open in a new window`}
      >
        <RepoBadge name={repo.name} className="w-7 h-7 rounded-lg text-[11px]" />
        <span className="min-w-0 flex-1">
          <span className="block text-[13px] font-medium text-text truncate">{repo.name}</span>
          <span className="block text-xs text-text-muted truncate">{parentPath(repo.path)}</span>
        </span>
        <span className="text-xs text-text-muted shrink-0 group-hover:invisible">{dayjs(repo.lastOpenedAt).fromNow()}</span>
      </button>
      <button
        onClick={() => onRemove(repo.path)}
        className="absolute right-2 w-6 h-6 inline-flex items-center justify-center rounded-md text-text-muted hover:text-text hover:bg-hover invisible group-hover:visible cursor-pointer"
        title="Remove from recent"
      >
        <XIcon className="w-3.5 h-3.5" />
      </button>
    </li>
  );
}

function StartCard(props: { icon: ReactNode; title: string; detail: string; active?: boolean; onClick: () => void }) {
  const { icon, title, detail, active = false, onClick } = props;

  return (
    <button
      onClick={onClick}
      className={cn(
        'flex flex-col items-start gap-2.5 p-3.5 rounded-lg border text-left transition-colors cursor-pointer',
        active ? 'border-control-border bg-selected' : 'border-border bg-bg hover:bg-hover',
      )}
    >
      <span className="flex items-center justify-center w-8 h-8 rounded-md bg-fill text-text-secondary">{icon}</span>
      <span>
        <span className="block text-[13px] font-medium text-text">{title}</span>
        <span className="block text-xs text-text-secondary">{detail}</span>
      </span>
    </button>
  );
}

function CloneForm(props: { onCloned: (path: string) => void }) {
  const { onCloned } = props;
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!url.trim()) {
      return;
    }
    const parent = await pickFolder();
    if (!parent) {
      return;
    }
    setBusy(true);
    const id = toast.loading('Cloning…');
    try {
      const path = await tauri.gitClone(parent, url.trim());
      toast.success('Cloned', { id, description: parentPath(path) });
      onCloned(path);
    } catch (error) {
      toast.error('Could not clone', { id, description: tauri.errorMessage(error) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <form
      className="flex items-center gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <div className="relative flex-1 min-w-0">
        <GitHubIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-muted pointer-events-none" />
        <input
          autoFocus
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          type="text"
          value={url}
          onChange={(event) => setUrl(event.target.value)}
          placeholder="https://github.com/owner/repo or owner/repo"
          className={cn(inputField, 'pl-8')}
        />
      </div>
      <button type="submit" disabled={busy || !url.trim()} className={buttonPrimary} title="Choose where to put it, then clone">
        {busy ? 'Cloning…' : 'Clone to…'}
      </button>
    </form>
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
      className="flex items-center gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <div className="relative flex-1 min-w-0">
        <GitHubIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-muted pointer-events-none" />
        <input
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          type="text"
          value={url}
          onChange={(event) => setUrl(event.target.value)}
          autoFocus
          placeholder="https://github.com/owner/repo/pull/123"
          className={cn(inputField, 'pl-8')}
        />
      </div>
      <button type="submit" disabled={busy || !url.trim()} className={buttonPrimary}>
        {busy ? 'Opening…' : 'Open'}
      </button>
    </form>
  );
}
