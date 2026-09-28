import { useEffect, useState, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import { getCurrentWebview } from '@tauri-apps/api/webview';
import { useHotkeys } from 'react-hotkeys-hook';
import { toast } from 'sonner';
import { Button } from '@/components/ui/Button';
import { IconButton } from '@/components/ui/IconButton';
import { Kbd } from '@/components/ui/Kbd';
import { Input } from '@/components/ui/Input';
import {
  DownloadIcon,
  FolderIcon,
  FolderOpenIcon,
  GitBranchIcon,
  GitCompareIcon,
  NewWindowIcon,
  PullRequestIcon,
  XIcon,
} from '@/components/ui/icon';
import { cn } from '@/lib/cn';
import * as api from '@/lib/api';
import { isTauri, modKey } from '@/lib/platform';
import { queryKeys } from '@/lib/query';
import { dayjs } from '@/lib/time';
import type { RecentRepo } from '@/lib/types';
import { openRepoInNewWindow, repoRoute } from '@/lib/window';
import { parsePrUrl, pickFolder, remoteMatches } from './open-repo';

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
  const recent = useQuery({ queryKey: queryKeys.recentRepos(), queryFn: api.recentRepos });
  const hiddenQuery = useQuery({ queryKey: queryKeys.setting(HIDDEN_KEY), queryFn: () => api.getSetting(HIDDEN_KEY) });
  const hidden = parseHidden(hiddenQuery.data);
  const repos = (recent.data ?? []).filter((repo) => {
    const hiddenAt = hidden[repo.path];
    return !hiddenAt || repo.lastOpenedAt > hiddenAt;
  });

  const remove = async (path: string) => {
    const next = { ...hidden, [path]: new Date().toISOString() };
    const value = JSON.stringify(next);
    queryClient.setQueryData(queryKeys.setting(HIDDEN_KEY), value);
    try {
      await api.setSetting(HIDDEN_KEY, value);
    } catch (error) {
      toast.error('Could not update recent repositories', { description: api.errorMessage(error) });
    }
  };

  return { repos, all: recent.data ?? [], loading: recent.isLoading, remove };
}

export function WelcomePage() {
  const navigate = useNavigate();
  const recent = useRecentRepos();
  const [dragging, setDragging] = useState(false);

  const openRepo = (path: string, newWindow = false, extra?: Record<string, string>) => {
    if (newWindow) {
      void openRepoInNewWindow(path, extra);
      return;
    }
    navigate(repoRoute(path, extra));
  };

  const openFolder = async (newWindow = false) => {
    const path = await pickFolder();
    if (!path) {
      return;
    }
    openRepo(path, newWindow);
  };

  useHotkeys('mod+o', (event) => {
    event.preventDefault();
    void openFolder();
  });

  useFolderDrop((path) => openRepo(path), setDragging);

  return (
    <div className="relative flex h-full flex-col bg-canvas">
      <div data-tauri-drag-region className="h-11 shrink-0" />
      <div className="flex min-h-0 flex-1 justify-center overflow-y-auto px-6 pb-10">
        <div className="flex w-full max-w-[600px] flex-col gap-7 pt-[6vh]">
          <header className="flex items-center gap-3.5">
            <Logo />
            <div className="min-w-0 flex-1">
              <h1 className="font-serif text-3xl font-semibold text-fg">Diffity</h1>
              <p className="text-sm text-fg-muted">Review diffs, leave comments, and hand them to Claude Code.</p>
            </div>
          </header>

          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => void openFolder()}
              className="group flex cursor-default items-start gap-3 rounded-xl border border-accent/30 bg-accent-soft p-4 text-left transition-colors hover:border-accent/70"
            >
              <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-accent-solid text-accent-fg">
                <FolderOpenIcon size={16} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2 text-sm font-semibold text-fg">
                  Open folder
                  <Kbd className="ml-auto">{modKey}O</Kbd>
                </span>
                <span className="mt-0.5 block text-xs text-fg-muted">Review a local Git repository</span>
              </span>
            </button>
            <button
              type="button"
              onClick={() => void openFolder(true)}
              className="group flex cursor-default items-start gap-3 rounded-xl border border-border/60 bg-muted-soft p-4 text-left transition-colors hover:border-border-strong"
            >
              <span className="flex size-8 shrink-0 items-center justify-center rounded-full border-[1.5px] border-fg-muted/50 text-fg-muted">
                <NewWindowIcon size={16} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-fg">Open in new window</span>
                <span className="mt-0.5 block text-xs text-fg-muted">Keep this window free</span>
              </span>
            </button>
          </div>

          <section>
            <SectionLabel>Open a pull request</SectionLabel>
            <PrUrlForm recent={recent.all} onOpen={openRepo} />
          </section>

          <section>
            <div className="mb-2.5 flex items-center gap-3">
              <SectionLabel className="mb-0 flex-1">Recent</SectionLabel>
              {recent.repos.length > 0 && (
                <span className="text-2xs text-fg-subtle">
                  <Kbd>{modKey}</Kbd> click opens in a new window
                </span>
              )}
            </div>
            <RecentList repos={recent.repos} loading={recent.loading} onOpen={openRepo} onRemove={recent.remove} />
          </section>

          <p className="flex items-center justify-center gap-1.5 text-2xs text-fg-subtle">
            <DownloadIcon size={12} />
            Drop a folder anywhere on this window to open it
          </p>
        </div>
      </div>
      {dragging && (
        <div className="pointer-events-none absolute inset-3 flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-accent bg-accent-soft text-sm font-medium text-accent">
          <FolderOpenIcon size={24} />
          Drop a folder to open it
        </div>
      )}
    </div>
  );
}

function SectionLabel(props: { children: ReactNode; className?: string }) {
  return (
    <h2 className={cn('mb-2.5 flex items-center gap-3 text-sm font-medium text-fg after:h-px after:flex-1 after:bg-border', props.className)}>
      {props.children}
    </h2>
  );
}

function Logo() {
  return (
    <div className="flex size-11 shrink-0 items-center justify-center rounded-full bg-accent-solid text-accent-fg">
      <GitCompareIcon size={24} />
    </div>
  );
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

interface RecentListProps {
  repos: RecentRepo[];
  loading: boolean;
  onOpen: (path: string, newWindow?: boolean) => void;
  onRemove: (path: string) => void;
}

function RecentList(props: RecentListProps) {
  const { repos, loading, onOpen, onRemove } = props;
  if (loading) {
    return <div className="h-32 animate-pulse rounded-lg border border-border bg-panel" />;
  }
  if (repos.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-border px-4 py-8 text-center">
        <FolderIcon size={20} className="text-fg-subtle" />
        <p className="text-xs text-fg-muted">No recent repositories yet.</p>
      </div>
    );
  }
  return (
    <ul className="overflow-hidden rounded-xl border border-border bg-paper">
      {repos.map((repo) => (
        <RecentRow key={repo.path} repo={repo} onOpen={onOpen} onRemove={onRemove} />
      ))}
    </ul>
  );
}

function RecentRow(props: { repo: RecentRepo; onOpen: (path: string, newWindow?: boolean) => void; onRemove: (path: string) => void }) {
  const { repo, onOpen, onRemove } = props;
  const statusQuery = useQuery({
    queryKey: queryKeys.gitStatus(repo.path),
    queryFn: () => api.gitStatus(repo.path),
    staleTime: 60_000,
  });
  const branch = statusQuery.data?.branch ?? null;
  return (
    <li className="group relative flex items-center border-b border-border-subtle last:border-b-0 hover:bg-hover">
      <button
        type="button"
        onClick={(event) => onOpen(repo.path, event.metaKey || event.ctrlKey)}
        className="flex min-w-0 flex-1 cursor-default items-center gap-3 px-3 py-2.5 text-left"
      >
        <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted font-serif text-sm font-semibold text-fg-muted uppercase">
          {repo.name.slice(0, 1)}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex min-w-0 items-center gap-2">
            <span className="truncate text-sm font-medium text-fg">{repo.name}</span>
            {branch && (
              <span className="inline-flex min-w-0 items-center gap-1 text-2xs text-fg-subtle">
                <GitBranchIcon size={12} className="shrink-0" />
                <span className="truncate font-mono">{branch}</span>
              </span>
            )}
          </span>
          <span className="block truncate text-2xs text-fg-subtle">{repo.path.replace(/^\/Users\/[^/]+/, '~')}</span>
        </span>
        <span className="shrink-0 text-2xs text-fg-subtle group-hover:invisible">{dayjs(repo.lastOpenedAt).fromNow()}</span>
      </button>
      <div className="invisible absolute right-2 flex items-center gap-0.5 group-hover:visible group-focus-within:visible">
        <IconButton size="sm" label="Open in new window" onClick={() => onOpen(repo.path, true)}>
          <NewWindowIcon size={14} />
        </IconButton>
        <IconButton size="sm" label="Remove from recent" onClick={() => onRemove(repo.path)}>
          <XIcon size={14} />
        </IconButton>
      </div>
    </li>
  );
}

interface PrUrlFormProps {
  recent: RecentRepo[];
  onOpen: (path: string, newWindow?: boolean, extra?: Record<string, string>) => void;
}

function PrUrlForm(props: PrUrlFormProps) {
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
        const info = await api.openRepo(repo.path).catch(() => null);
        if (info && remoteMatches(info.remoteUrl, pr.owner, pr.repo)) {
          onOpen(repo.path, false, { pr: url.trim() });
          return;
        }
      }
      toast.info(`Select your local clone of ${pr.owner}/${pr.repo}`);
      const path = await pickFolder();
      if (!path) {
        return;
      }
      onOpen(path, false, { pr: url.trim() });
    } finally {
      setBusy(false);
    }
  };

  return (
    <form
      className="flex gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <Input
        size="lg"
        wrapperClassName="flex-1"
        icon={<PullRequestIcon size={14} />}
        value={url}
        onChange={(event) => setUrl(event.target.value)}
        placeholder="https://github.com/owner/repo/pull/123"
      />
      <Button size="lg" type="submit" loading={busy} disabled={!url.trim() || busy}>
        Open PR
      </Button>
    </form>
  );
}
