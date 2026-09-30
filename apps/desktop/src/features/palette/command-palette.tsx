import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useQuery } from '@tanstack/react-query';
import { useLocation, useNavigate } from 'react-router';
import { handleCopyShortcut } from '../../lib/file-copy';
import { toast } from 'sonner';
import { revealItemInDir } from '@tauri-apps/plugin-opener';
import { cn } from '../../lib/cn';
import * as tauri from '../../lib/tauri';
import { commitRef, errorMessage, openInEditor } from '../../lib/api';
import { modKey } from '../../lib/platform';
import { shortcutHint } from '../../lib/shortcuts';
import { KeyCaps } from '../../components/ui/key-caps';
import { useRepoNav } from '../../hooks/use-repo';
import { useTheme } from '../../hooks/use-theme';
import { useGitHubAuth, useGitHubPr, useRecentCommits } from '../../hooks/use-repo-state';
import { isOpenThread, useRepoThreads } from '../../hooks/use-repo-threads';
import { openComments, openSettings, openShortcuts, toggleSidebar } from '../../lib/ui-store';
import { goToThread } from '../../lib/thread-location';
import { treePathsOptions } from '../../queries/tree';
import { openRepoAt, shortPath, useRecentRepos } from '../welcome/recent-repos';
import { lastLocationFor } from '../../lib/repo-locations';
import { usePullRequests } from '../pr/pull-requests-dialog';
import { checkoutPullRequest } from '../pr/pr-checkout';
import { prDiffRef } from '../../components/layout/ref-menu';
import {
  ChangesIcon, CommentIcon, EditorIcon, FetchIcon, FileIcon, FilesIcon, GitCommitIcon, GitPullRequestIcon,
  HomeIcon, KeyboardIcon, MoonIcon, PullIcon, PushIcon, RevealIcon, SearchIcon, SettingsIcon, SidebarIcon,
} from '../../components/ui/icon';
import {
  closePalette, fuzzyScore, recentActionIds, recentFiles, rememberAction, rememberFile, usePalette,
  type PaletteAction, type PaletteMode,
} from './palette-store';

interface Item extends PaletteAction {
  group: string;
  score: number;
  detail?: ReactNode;
  alt?: () => void;
}

const GROUP_ORDER = ['Recent', 'Files in this view', 'Actions', 'View', 'Go to', 'Projects', 'Pull requests', 'Recent commits', 'Comments', 'All files'];

function runGit(label: string, run: () => Promise<{ ok: boolean; output: string }>) {
  const id = toast.loading(`${label}…`);
  run().then((result) => {
    if (result.ok) {
      toast.success(`${label} done`, { id, description: result.output || undefined });
      return;
    }
    toast.error(`${label} failed`, { id, description: result.output });
  }, (error) => toast.error(`${label} failed`, { id, description: tauri.errorMessage(error) }));
}

function useGlobalActions(): PaletteAction[] {
  const nav = useRepoNav();
  const { theme, toggleTheme } = useTheme();

  return useMemo(() => [
    { id: 'go-home', title: 'Go to Home', group: 'Go to', hint: shortcutHint('go-home'), icon: <HomeIcon size="sm" />, run: nav.toOverview },
    { id: 'go-changes', title: 'Uncommitted changes', group: 'Go to', icon: <ChangesIcon size="sm" />, run: () => nav.toDiff('work') },
    { id: 'go-files', title: 'Browse files', group: 'Go to', icon: <FilesIcon size="sm" />, run: () => nav.toTree() },
    { id: 'comments', title: 'Show all comments', group: 'Go to', hint: shortcutHint('comments'), icon: <CommentIcon size="sm" />, run: openComments },
    { id: 'toggle-sidebar', title: 'Toggle sidebar', group: 'View', hint: shortcutHint('toggle-sidebar'), icon: <SidebarIcon size="sm" />, run: toggleSidebar },
    { id: 'toggle-theme', title: theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme', group: 'View', keywords: 'theme dark light appearance', icon: <MoonIcon size="sm" />, run: toggleTheme },
    { id: 'fetch', title: 'Fetch', group: 'Actions', keywords: 'git remote', icon: <FetchIcon size="sm" />, run: () => runGit('Fetch', () => tauri.gitFetch(nav.repoPath)) },
    { id: 'pull', title: 'Pull', group: 'Actions', keywords: 'git', icon: <PullIcon size="sm" />, run: () => runGit('Pull', () => tauri.gitPull(nav.repoPath)) },
    { id: 'push', title: 'Push', group: 'Actions', keywords: 'git publish', icon: <PushIcon size="sm" />, run: () => runGit('Push', () => tauri.gitPush(nav.repoPath)) },
    { id: 'open-editor', title: 'Open repository in editor', group: 'Actions', icon: <EditorIcon size="sm" />, run: () => { openInEditor('').catch((error) => toast.error('Could not open the editor', { description: errorMessage(error) })); } },
    { id: 'reveal', title: 'Reveal in Finder', group: 'Actions', icon: <RevealIcon size="sm" />, run: () => { revealItemInDir(nav.repoPath).catch(() => undefined); } },
    { id: 'settings', title: 'Settings', group: 'Actions', hint: shortcutHint('settings'), icon: <SettingsIcon size="sm" />, run: openSettings },
    { id: 'shortcuts', title: 'Keyboard shortcuts', group: 'Actions', hint: shortcutHint('shortcuts'), icon: <KeyboardIcon size="sm" />, run: openShortcuts },
  ], [nav, theme, toggleTheme]);
}

export function CommandPalette() {
  const mode = usePalette((state) => state.mode);

  if (!mode) {
    return null;
  }
  return <PaletteBody mode={mode} />;
}

function PaletteBody(props: { mode: PaletteMode }) {
  const { mode } = props;
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const nav = useRepoNav();
  const pageActions = usePalette((state) => state.pageActions);
  const viewFiles = usePalette((state) => state.viewFiles);
  const globalActions = useGlobalActions();
  const recent = useRecentRepos();
  const { data: commits } = useRecentCommits(10);
  const { details, hasRemote } = useGitHubPr();
  const { data: auth } = useGitHubAuth();
  const prs = usePullRequests(mode === 'all' && hasRemote && !!auth?.authenticated);
  const { data: repoThreads } = useRepoThreads();
  const { data: tree } = useQuery({ ...treePathsOptions(), enabled: mode === 'files' });
  const location = useLocation();
  const viewRef = location.pathname.endsWith('/diff') ? new URLSearchParams(location.search).get('ref') ?? 'work' : 'work';

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const items = useMemo<Item[]>(() => {
    const out: Item[] = [];
    const add = (item: Omit<Item, 'score'>, text: string) => {
      const score = fuzzyScore(query, text);
      if (score > 0) {
        out.push({ ...item, score });
      }
    };

    if (mode === 'files') {
      const recentPaths = recentFiles(nav.repoPath);
      const inView = new Set(viewFiles?.files.map((file) => file.path) ?? []);
      const openFile = (path: string) => {
        rememberFile(nav.repoPath, path);
        if (viewFiles && inView.has(path)) {
          viewFiles.reveal(path);
          return;
        }
        nav.toTree(path, 'file');
      };
      const editFile = (path: string) => {
        rememberFile(nav.repoPath, path);
        openInEditor(path).catch((error) => toast.error('Could not open the editor', { description: errorMessage(error) }));
      };
      for (const file of viewFiles?.files ?? []) {
        const recentIndex = recentPaths.indexOf(file.path);
        add({
          id: `view:${file.path}`,
          title: file.path,
          group: recentIndex >= 0 && !query ? 'Recent' : 'Files in this view',
          icon: <FileIcon size="sm" />,
          detail: (
            <span className="flex items-center gap-2 font-mono text-[11px] tabular-nums">
              {!!file.comments && <span className="inline-flex items-center gap-1 text-text-secondary"><CommentIcon size={11} />{file.comments}</span>}
              {!!file.additions && <span className="text-added">+{file.additions}</span>}
              {!!file.deletions && <span className="text-deleted">−{file.deletions}</span>}
              {file.viewed && <span className="text-text-muted">viewed</span>}
              {file.status && <span className="w-3 text-center text-modified">{file.status}</span>}
            </span>
          ),
          run: () => openFile(file.path),
          alt: () => editFile(file.path),
        }, file.path);
      }
      for (const path of tree?.paths ?? []) {
        if (inView.has(path)) {
          continue;
        }
        const recentIndex = recentPaths.indexOf(path);
        add({
          id: `file:${path}`,
          title: path,
          group: recentIndex >= 0 && !query ? 'Recent' : 'All files',
          icon: <FileIcon size="sm" className="text-text-muted" />,
          run: () => openFile(path),
          alt: () => editFile(path),
        }, path);
      }
      const recentRank = (item: Item) => {
        const path = item.id.replace(/^(view|file):/, '');
        const index = recentPaths.indexOf(path);
        return index < 0 ? 999 : index;
      };
      return out.sort((a, b) => GROUP_ORDER.indexOf(a.group) - GROUP_ORDER.indexOf(b.group) || (query ? b.score - a.score : recentRank(a) - recentRank(b))).slice(0, 200);
    }

    const recentIds = recentActionIds();
    const actions = [...Object.values(pageActions).flat(), ...globalActions];
    for (const action of actions) {
      const recentIndex = recentIds.indexOf(action.id);
      add({ ...action, group: recentIndex >= 0 && !query ? 'Recent' : action.group ?? 'Actions' }, `${action.title} ${action.keywords ?? ''}`);
    }

    if (mode === 'all') {
      for (const repo of recent.repos) {
        if (repo.path === nav.repoPath) {
          continue;
        }
        add({
          id: `project:${repo.path}`,
          title: repo.name,
          group: 'Projects',
          icon: <span className="inline-flex items-center justify-center w-4 h-4 rounded bg-fill text-[8px] font-semibold text-text-secondary">{repo.name.slice(0, 2).toUpperCase()}</span>,
          detail: <span className="font-mono text-[11px] text-text-muted">{shortPath(repo.path)}</span>,
          run: () => {
            const last = lastLocationFor(repo.path);
            if (last) {
              navigate(last);
              return;
            }
            void openRepoAt(repo.path, navigate);
          },
        }, `${repo.name} ${repo.path}`);
      }
      if (details) {
        add({ id: 'pr-current', title: `PR #${details.prNumber} · ${details.prTitle}`, group: 'Pull requests', icon: <GitPullRequestIcon size="sm" className="text-added" />, run: () => nav.toDiff(prDiffRef(details)) }, `pr ${details.prNumber} ${details.prTitle}`);
      }
      for (const pr of prs.data ?? []) {
        if (pr.number === details?.prNumber) {
          continue;
        }
        add({
          id: `pr:${pr.number}`,
          title: `#${pr.number} · ${pr.title}`,
          group: 'Pull requests',
          icon: <GitPullRequestIcon size="sm" className={pr.isDraft ? 'text-text-muted' : 'text-added'} />,
          detail: <span className="text-[11px] text-text-muted">check out · {pr.author}</span>,
          run: () => void checkoutPullRequest(nav.repoPath, `#${pr.number}`, nav.toDiff),
        }, `pr ${pr.number} ${pr.title} ${pr.author}`);
      }
      for (const commit of commits?.commits ?? []) {
        add({
          id: `commit:${commit.hash}`,
          title: commit.message,
          group: 'Recent commits',
          icon: <GitCommitIcon size="sm" />,
          detail: <span className="font-mono text-[11px] text-text-muted">{commit.shortHash} · {commit.relativeDate}</span>,
          run: () => nav.toDiff(commitRef(commit.hash)),
        }, `${commit.message} ${commit.shortHash} ${commit.author}`);
      }
      for (const thread of (repoThreads ?? []).filter(isOpenThread).slice(0, 50)) {
        add({
          id: `thread:${thread.id}`,
          title: thread.excerpt || 'Comment',
          group: 'Comments',
          icon: <CommentIcon size="sm" className={thread.authorType === 'agent' ? 'text-claude' : undefined} />,
          detail: <span className="font-mono text-[11px] text-text-muted truncate max-w-[220px]">{thread.filePath.split('/').pop()} · {thread.refLabel}</span>,
          run: () => goToThread(nav.repoPath, { ref: thread.ref, threadId: thread.id }),
        }, `${thread.excerpt} ${thread.filePath} ${thread.authorName}`);
      }
    }

    const recentRank = (item: Item) => {
      const index = recentIds.indexOf(item.id);
      return index < 0 ? 999 : index;
    };
    return out.sort((a, b) => {
      if (query) {
        return b.score - a.score;
      }
      return GROUP_ORDER.indexOf(a.group) - GROUP_ORDER.indexOf(b.group) || recentRank(a) - recentRank(b);
    }).slice(0, 120);
  }, [mode, query, pageActions, globalActions, recent.repos, nav, navigate, details, prs.data, commits, repoThreads, viewFiles, tree]);

  const grouped = useMemo(() => {
    if (query) {
      return [{ group: mode === 'files' ? 'Files' : 'Results', items }];
    }
    const groups: { group: string; items: Item[] }[] = [];
    for (const item of items) {
      const last = groups[groups.length - 1];
      if (last && last.group === item.group) {
        last.items.push(item);
        continue;
      }
      groups.push({ group: item.group, items: [item] });
    }
    return groups;
  }, [items, query, mode]);

  const flatItems = grouped.flatMap((group) => group.items);

  useEffect(() => {
    setActive(0);
  }, [query, mode]);

  useEffect(() => {
    listRef.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  const choose = (item: Item | undefined, alt = false) => {
    if (!item) {
      return;
    }
    closePalette();
    if (mode !== 'files') {
      rememberAction(item.id);
    }
    if (alt && item.alt) {
      item.alt();
      return;
    }
    item.run();
  };

  const placeholder = mode === 'files' ? 'Go to file…' : mode === 'actions' ? 'Run an action…' : 'Search actions, projects, branches, commits, comments…';
  let index = -1;

  return createPortal(
    <div
      className="fixed inset-0 z-[80] flex justify-center bg-black/25 pt-[12vh] font-sans"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          closePalette();
        }
      }}
    >
      <div role="dialog" aria-label="Command palette" className="flex flex-col w-[640px] max-w-[calc(100vw-32px)] max-h-[min(520px,70vh)] rounded-xl border border-overlay-border bg-overlay overflow-hidden animate-fade-in">
        <div className="flex items-center gap-2.5 h-12 px-4 border-b border-overlay-border">
          <SearchIcon size="md" className="text-text-muted" />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                event.preventDefault();
                closePalette();
                return;
              }
              if (event.key === 'ArrowDown' || (event.key === 'n' && event.ctrlKey)) {
                event.preventDefault();
                setActive((value) => Math.min(value + 1, flatItems.length - 1));
                return;
              }
              if (event.key === 'ArrowUp' || (event.key === 'p' && event.ctrlKey)) {
                event.preventDefault();
                setActive((value) => Math.max(value - 1, 0));
                return;
              }
              if (mode === 'files' && flatItems[active]) {
                const path = flatItems[active].id.replace(/^(view|file):/, '');
                if (handleCopyShortcut(event.nativeEvent, path, flatItems[active].id.startsWith('view:') ? viewRef : 'work')) {
                  closePalette();
                  return;
                }
              }
              if (event.key === 'Enter') {
                event.preventDefault();
                choose(flatItems[active], event.metaKey || event.ctrlKey);
              }
            }}
            placeholder={placeholder}
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            className="flex-1 min-w-0 bg-transparent text-[15px] text-text placeholder:text-text-muted outline-none"
          />
          <kbd className="text-[11px] text-text-muted">esc</kbd>
        </div>
        <div ref={listRef} className="flex-1 min-h-0 overflow-y-auto p-1.5">
          {flatItems.length === 0 && <div className="px-3 py-6 text-center text-[13px] text-text-muted">No matches</div>}
          {grouped.map((group) => (
            <div key={group.group} className="pb-1">
              <div className="px-2.5 pt-2 pb-1 text-[11px] font-medium text-text-muted">{group.group}</div>
              {group.items.map((item) => {
                index += 1;
                const current = index;
                return (
                  <button
                    key={item.id}
                    data-active={current === active}
                    onMouseMove={() => setActive(current)}
                    onClick={(event) => choose(item, event.metaKey || event.ctrlKey)}
                    className={cn('flex items-center gap-2.5 w-full h-9 px-2.5 rounded-md text-left cursor-pointer', current === active ? 'bg-selected' : 'hover:bg-hover')}
                  >
                    <span className="flex w-4 justify-center text-text-secondary shrink-0">{item.icon}</span>
                    <span className={cn('min-w-0 flex-1 truncate text-[13px] text-text', mode === 'files' && 'font-mono text-xs')}>{item.title}</span>
                    {item.detail && <span className="shrink-0 min-w-0">{item.detail}</span>}
                    {item.hint && <KeyCaps keys={[item.hint]} />}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
        <div className="flex items-center gap-4 h-8 px-4 border-t border-overlay-border text-[11px] text-text-muted">
          <span>↑↓ to move</span>
          <span>↵ to open</span>
          {mode === 'files' && <span>{modKey}↵ open in editor · {shortcutHint('copy-path')} path · {shortcutHint('copy-contents')} contents</span>}
          <span className="ml-auto">{shortcutHint('palette')} everything · {shortcutHint('go-to-file')} files · {shortcutHint('palette-actions')} actions</span>
        </div>
      </div>
    </div>,
    document.body,
  );
}
