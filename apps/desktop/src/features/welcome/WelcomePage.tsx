import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import { getCurrentWebview } from '@tauri-apps/api/webview';
import { useHotkeys } from 'react-hotkeys-hook';
import { toast } from 'sonner';
import { Button } from '@/components/ui/Button';
import { IconButton } from '@/components/ui/IconButton';
import { Kbd } from '@/components/ui/Kbd';
import { Menu } from '@/components/ui/Menu';
import { ExternalLinkIcon, FolderIcon, MoreIcon, PullRequestIcon } from '@/components/ui/icons';
import * as api from '@/lib/api';
import { isTauri, modKey } from '@/lib/platform';
import { queryKeys } from '@/lib/query';
import { dayjs } from '@/lib/time';
import type { RecentRepo } from '@/lib/types';
import { openRepoInNewWindow, repoRoute } from '@/lib/window';
import { parsePrUrl, pickFolder, remoteMatches } from './open-repo';

export function WelcomePage() {
  const navigate = useNavigate();
  const recent = useQuery({ queryKey: queryKeys.recentRepos(), queryFn: api.recentRepos });
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
    <div className="relative flex h-full flex-col">
      <div data-tauri-drag-region className="h-11 shrink-0" />
      <div className="flex min-h-0 flex-1 justify-center overflow-y-auto px-6 pb-10">
        <div className="flex w-full max-w-[560px] flex-col gap-8 pt-[8vh]">
          <header className="flex flex-col items-center gap-3 text-center">
            <Logo />
            <div>
              <h1 className="text-xl font-semibold tracking-tight">Diffity</h1>
              <p className="mt-1 text-[13px] text-fg-muted">Review diffs, leave comments, and hand them to your agents.</p>
            </div>
          </header>

          <div className="flex flex-col gap-2">
            <Button variant="primary" className="h-9 w-full text-[13px]" onClick={() => void openFolder()}>
              <FolderIcon size={15} />
              Open Folder…
              <span className="ml-1 text-[11px] opacity-70">{modKey}O</span>
            </Button>
            <PrUrlForm recent={recent.data ?? []} onOpen={openRepo} />
          </div>

          <section>
            <div className="mb-2 flex items-center justify-between px-1">
              <h2 className="text-[11px] font-semibold tracking-wider text-fg-subtle uppercase">Recent repositories</h2>
              <span className="text-[11px] text-fg-subtle">
                <Kbd>{modKey}</Kbd>+click opens in a new window
              </span>
            </div>
            <RecentList repos={recent.data ?? []} loading={recent.isLoading} onOpen={openRepo} />
          </section>
        </div>
      </div>
      {dragging && (
        <div className="pointer-events-none absolute inset-3 flex items-center justify-center rounded-xl border-2 border-dashed border-accent bg-accent-subtle/60 text-sm font-medium text-accent">
          Drop a folder to open it
        </div>
      )}
    </div>
  );
}

function Logo() {
  return (
    <div className="flex size-12 items-center justify-center rounded-xl bg-accent text-accent-fg shadow-lg shadow-accent/30">
      <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round">
        <path d="M8 4v16" />
        <path d="M16 4v16" />
        <path d="M5 8h6" />
        <path d="M13 16h6" />
      </svg>
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
}

function RecentList(props: RecentListProps) {
  const { repos, loading, onOpen } = props;
  if (loading) {
    return <div className="h-24 animate-pulse rounded-lg bg-bg-muted" />;
  }
  if (repos.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border px-4 py-8 text-center text-xs text-fg-subtle">
        No recent repositories. Open a folder or drop one onto this window.
      </div>
    );
  }
  return (
    <ul className="overflow-hidden rounded-lg border border-border bg-bg-elevated">
      {repos.map((repo) => (
        <li key={repo.path} className="group flex items-center border-b border-border last:border-b-0 hover:bg-bg-muted">
          <button
            type="button"
            onClick={(event) => onOpen(repo.path, event.metaKey || event.ctrlKey)}
            className="flex min-w-0 flex-1 cursor-default items-center gap-3 px-3 py-2.5 text-left"
          >
            <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-bg-muted text-sm font-semibold text-fg-muted uppercase">
              {repo.name.slice(0, 1)}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px] font-medium text-fg">{repo.name}</span>
              <span className="block truncate text-[11px] text-fg-subtle">{repo.path.replace(/^\/Users\/[^/]+/, '~')}</span>
            </span>
            <span className="shrink-0 text-[11px] text-fg-subtle">{dayjs(repo.lastOpenedAt).fromNow()}</span>
          </button>
          <div className="pr-2 opacity-0 group-hover:opacity-100">
            <Menu
              items={[
                { label: 'Open', onSelect: () => onOpen(repo.path) },
                { label: 'Open in new window', icon: <ExternalLinkIcon size={13} />, onSelect: () => onOpen(repo.path, true) },
              ]}
              trigger={(trigger) => (
                <IconButton ref={trigger.ref} size="sm" label="More" onClick={trigger.onClick}>
                  <MoreIcon size={14} />
                </IconButton>
              )}
            />
          </div>
        </li>
      ))}
    </ul>
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
      className="flex h-9 items-center gap-2 rounded-md border border-border bg-bg-elevated pr-1 pl-3 focus-within:border-accent"
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <PullRequestIcon size={14} className="shrink-0 text-fg-subtle" />
      <input
        value={url}
        onChange={(event) => setUrl(event.target.value)}
        placeholder="Open a pull request URL…"
        className="min-w-0 flex-1 bg-transparent text-[13px] outline-none placeholder:text-fg-subtle"
      />
      <Button size="sm" type="submit" disabled={!url.trim() || busy}>
        Open PR
      </Button>
    </form>
  );
}
