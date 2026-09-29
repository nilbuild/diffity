import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import { listen } from '@tauri-apps/api/event';
import { create } from 'zustand';
import { toast } from 'sonner';
import { cn } from '../../lib/cn';
import * as tauri from '../../lib/tauri';
import { modKey } from '../../lib/platform';
import { openRepoAt, shortPath, useRecentRepos } from '../welcome/recent-repos';
import { parsePrUrl, pickFolder, remoteMatches } from '../welcome/open-repo';
import { Spinner } from '../../components/icons/spinner';
import { DownloadIcon, FolderOpenIcon, FolderSimpleIcon, GitBranchIcon, GitHubIcon, GitPullRequestIcon, SearchIcon } from '../../components/ui/icon';

const useQuickOpen = create<{ open: boolean }>(() => ({ open: false }));
const CLONE_PARENT_KEY = 'diffity-clone-parent';

export function openQuickOpen() {
  useQuickOpen.setState({ open: true });
}

function closeQuickOpen() {
  useQuickOpen.setState({ open: false });
}

export async function browseForFolder(navigate: ReturnType<typeof useNavigate>) {
  closeQuickOpen();
  const path = await pickFolder();
  if (!path) {
    return;
  }
  await openRepoAt(path, navigate);
}

function readCloneParent(): string | null {
  try {
    return localStorage.getItem(CLONE_PARENT_KEY);
  } catch {
    return null;
  }
}

function tildify(path: string, home: string): string {
  if (path === home) {
    return '~/';
  }
  if (path.startsWith(`${home}/`)) {
    return `~/${path.slice(home.length + 1)}`;
  }
  return path;
}

function repoUrl(input: string): string | null {
  const trimmed = input.trim();
  if (/^https?:\/\/github\.com\/[^/\s]+\/[^/\s]+\/?(\.git)?$/.test(trimmed) || /^git@github\.com:[^/\s]+\/[^/\s]+$/.test(trimmed)) {
    return trimmed;
  }
  return null;
}

interface Row {
  key: string;
  icon: React.ReactNode;
  title: React.ReactNode;
  detail?: React.ReactNode;
  /** Text the input becomes on Tab / → (folders). */
  complete?: string;
  run: () => void;
}

/** Global ⌘O / ⌘⇧O: works on the start screen and inside a repository. */
export function useQuickOpenShortcut() {
  const navigate = useNavigate();

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.altKey || event.key.toLowerCase() !== 'o') {
        return;
      }
      event.preventDefault();
      if (event.shiftKey) {
        void browseForFolder(navigate);
        return;
      }
      openQuickOpen();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [navigate]);
}

export function QuickOpen() {
  const open = useQuickOpen((state) => state.open);

  if (!open) {
    return null;
  }
  return <QuickOpenBody />;
}

function QuickOpenBody() {
  const navigate = useNavigate();
  const [input, setInput] = useState('');
  const [active, setActive] = useState(0);
  const [clone, setClone] = useState<{ url: string; prNumber?: number } | null>(null);
  const [cloning, setCloning] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const recent = useRecentRepos();
  const { data: roots } = useQuery({ queryKey: ['quick-open-roots'], queryFn: tauri.quickOpenRoots, staleTime: 60_000 });
  const home = roots?.home ?? '';
  const pathMode = input.startsWith('~') || input.startsWith('/') || input.includes('/') && !input.includes('://') && !input.startsWith('git@');
  const prUrl = parsePrUrl(input);
  const cloneUrl = !prUrl ? repoUrl(input) : null;
  const typingPath = clone ? true : pathMode;
  const { data: suggestions } = useQuery({
    queryKey: ['dir-suggestions', input],
    queryFn: () => tauri.listDirSuggestions(input),
    enabled: typingPath && input.length > 0,
    placeholderData: (previous) => previous,
    staleTime: 5_000,
  });

  useEffect(() => {
    inputRef.current?.focus();
  }, [clone]);

  useEffect(() => {
    setActive(0);
  }, [input, clone]);

  useEffect(() => {
    listRef.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  const openPath = async (path: string) => {
    const resolved = await tauri.resolveRepoRoot(path).catch(() => null);
    if (!resolved?.exists) {
      toast.error('That folder does not exist', { description: path });
      return;
    }
    if (!resolved.repoRoot) {
      toast.error(`${shortPath(resolved.path)} is not in a Git repository`, { description: 'Pick a repository folder, or run `git init` there first.' });
      return;
    }
    if (resolved.repoRoot !== resolved.path.replace(/\/$/, '')) {
      toast.info(`Opened the repository root: ${shortPath(resolved.repoRoot)}`);
    }
    closeQuickOpen();
    await openRepoAt(resolved.repoRoot, navigate);
  };

  const openPr = async (url: string) => {
    const pr = parsePrUrl(url);
    if (!pr) {
      return;
    }
    for (const repo of recent.repos) {
      const info = await tauri.openRepo(repo.path).catch(() => null);
      if (info && remoteMatches(info.remoteUrl, pr.owner, pr.repo)) {
        closeQuickOpen();
        await openRepoAt(repo.path, navigate, { extra: { pr: url.trim() } });
        return;
      }
    }
    setClone({ url: `https://github.com/${pr.owner}/${pr.repo}`, prNumber: pr.number });
    setInput(tildify(readCloneParent() ?? roots?.roots.find((root) => /\/(Code|code|lab|Projects)$/.test(root)) ?? home, home).replace(/\/?$/, '/'));
  };

  const runClone = async (parentInput: string) => {
    if (!clone) {
      return;
    }
    const resolved = await tauri.resolveRepoRoot(parentInput).catch(() => null);
    if (!resolved?.exists) {
      toast.error('Choose an existing folder to clone into');
      return;
    }
    setCloning('Starting…');
    const unlisten = await listen<{ line: string }>('clone-progress', (event) => setCloning(event.payload.line)).catch(() => null);
    try {
      const path = await tauri.cloneRepo(clone.url, resolved.path);
      try {
        localStorage.setItem(CLONE_PARENT_KEY, resolved.path);
      } catch {
        // storage is optional
      }
      toast.success('Cloned', { description: shortPath(path) });
      closeQuickOpen();
      await openRepoAt(path, navigate, clone.prNumber ? { extra: { pr: `${clone.url}/pull/${clone.prNumber}` } } : undefined);
    } catch (error) {
      toast.error('Clone failed', { description: tauri.errorMessage(error) });
    } finally {
      unlisten?.();
      setCloning(null);
    }
  };

  const rows = useMemo<Row[]>(() => {
    const list: Row[] = [];
    const folderRow = (entry: tauri.DirSuggestion): Row => ({
      key: entry.path,
      icon: entry.isGit ? <GitBranchIcon size="sm" className="text-text-secondary" /> : <FolderSimpleIcon size="sm" className="text-text-muted/80" />,
      title: <span className="font-mono text-xs">{entry.name}</span>,
      detail: entry.isGit ? <span className="font-mono text-[11px] text-text-muted">{entry.branch ?? 'repository'}</span> : undefined,
      complete: `${tildify(entry.path, home)}/`,
      run: () => {
        if (clone) {
          setInput(`${tildify(entry.path, home)}/`);
          return;
        }
        void openPath(entry.path);
      },
    });

    if (clone) {
      list.push({
        key: 'clone-here',
        icon: <DownloadIcon size="sm" className="text-text-secondary" />,
        title: <>Clone into <span className="font-mono text-xs">{input || '~/'}</span></>,
        detail: <span className="text-[11px] text-text-muted">{clone.url.replace('https://github.com/', '')}</span>,
        run: () => void runClone(input || '~/'),
      });
      for (const entry of suggestions?.entries ?? []) {
        if (!entry.isGit) {
          list.push(folderRow(entry));
        }
      }
      return list;
    }

    if (prUrl) {
      list.push({ key: 'pr', icon: <GitPullRequestIcon size="sm" className="text-added" />, title: `Open pull request #${prUrl.number} of ${prUrl.owner}/${prUrl.repo}`, detail: <span className="text-[11px] text-text-muted">uses your local clone, or clones it</span>, run: () => void openPr(input) });
      return list;
    }
    if (cloneUrl) {
      list.push({
        key: 'clone',
        icon: <DownloadIcon size="sm" className="text-text-secondary" />,
        title: `Clone ${cloneUrl.replace(/^https?:\/\/github\.com\//, '').replace(/\.git$/, '')}…`,
        detail: <span className="text-[11px] text-text-muted">choose a folder next</span>,
        run: () => {
          setClone({ url: cloneUrl });
          setInput(tildify(readCloneParent() ?? roots?.roots.find((root) => /\/(Code|code|lab|Projects)$/.test(root)) ?? home, home).replace(/\/?$/, '/'));
        },
      });
      return list;
    }

    if (typingPath) {
      for (const entry of suggestions?.entries ?? []) {
        list.push(folderRow(entry));
      }
      if (input.endsWith('/') && suggestions?.dir) {
        list.unshift({ key: 'this', icon: <FolderOpenIcon size="sm" className="text-text-secondary" />, title: <>Open <span className="font-mono text-xs">{input}</span></>, run: () => void openPath(input) });
      }
      if (input && !input.endsWith('/') && list.length === 0) {
        list.push({ key: 'typed', icon: <FolderOpenIcon size="sm" className="text-text-secondary" />, title: <>Open <span className="font-mono text-xs">{input}</span></>, run: () => void openPath(input) });
      }
      return list;
    }

    const needle = input.trim().toLowerCase();
    for (const repo of recent.repos) {
      if (needle && !`${repo.name} ${repo.path}`.toLowerCase().includes(needle)) {
        continue;
      }
      list.push({
        key: `recent:${repo.path}`,
        icon: <span className="inline-flex items-center justify-center w-4 h-4 rounded bg-fill text-[8px] font-semibold text-text-secondary">{repo.name.slice(0, 2).toUpperCase()}</span>,
        title: repo.name,
        detail: <span className="font-mono text-[11px] text-text-muted">{shortPath(repo.path)}</span>,
        complete: `${tildify(repo.path, home)}/`,
        run: () => {
          closeQuickOpen();
          void openRepoAt(repo.path, navigate);
        },
      });
    }
    if (!needle) {
      for (const root of [home, ...(roots?.roots ?? [])].filter(Boolean)) {
        list.push({
          key: `root:${root}`,
          icon: <FolderSimpleIcon size="sm" className="text-text-muted/80" />,
          title: <span className="font-mono text-xs">{tildify(root, home)}</span>,
          detail: <span className="text-[11px] text-text-muted">browse</span>,
          complete: tildify(root, home).replace(/\/?$/, '/'),
          run: () => setInput(tildify(root, home).replace(/\/?$/, '/')),
        });
      }
    }
    return list;
  }, [clone, input, suggestions, prUrl, cloneUrl, typingPath, recent.repos, roots, home, navigate]);

  const sections = clone || typingPath || prUrl || cloneUrl
    ? [{ label: clone ? 'Choose where to clone' : prUrl || cloneUrl ? 'GitHub' : suggestions?.dir ? tildify(suggestions.dir, home) : 'Folders', rows }]
    : [
      { label: 'Recent projects', rows: rows.filter((row) => row.key.startsWith('recent:')) },
      { label: 'Start from', rows: rows.filter((row) => row.key.startsWith('root:')) },
    ].filter((section) => section.rows.length > 0);

  const goUp = () => {
    const trimmed = input.replace(/\/$/, '');
    const cut = trimmed.lastIndexOf('/');
    setInput(cut >= 0 ? trimmed.slice(0, cut + 1) : '');
  };

  let index = -1;
  return createPortal(
    <div
      className="fixed inset-0 z-[80] flex justify-center bg-black/25 pt-[12vh] font-sans"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !cloning) {
          closeQuickOpen();
        }
      }}
    >
      <div role="dialog" aria-label="Open a repository" className="flex flex-col w-[640px] max-w-[calc(100vw-32px)] max-h-[min(520px,70vh)] rounded-xl border border-overlay-border bg-overlay overflow-hidden animate-fade-in">
        <div className="flex items-center gap-2.5 h-12 px-4 border-b border-overlay-border">
          {clone ? <DownloadIcon size="md" className="text-text-muted" /> : <SearchIcon size="md" className="text-text-muted" />}
          <input
            ref={inputRef}
            value={input}
            disabled={!!cloning}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              const row = rows[active];
              if (event.key === 'Escape') {
                event.preventDefault();
                if (clone) {
                  setClone(null);
                  setInput('');
                  return;
                }
                closeQuickOpen();
                return;
              }
              if (event.key === 'ArrowDown') {
                event.preventDefault();
                setActive((value) => Math.min(value + 1, rows.length - 1));
                return;
              }
              if (event.key === 'ArrowUp') {
                event.preventDefault();
                setActive((value) => Math.max(value - 1, 0));
                return;
              }
              if (event.key === 'Tab' || (event.key === 'ArrowRight' && event.currentTarget.selectionStart === input.length)) {
                const target = row?.complete ? row : rows.find((item) => item.complete);
                if (event.key === 'Tab') {
                  event.preventDefault();
                }
                if (target?.complete) {
                  event.preventDefault();
                  setInput(target.complete);
                }
                return;
              }
              if (event.key === 'Backspace' && input.endsWith('/') && input.length > 1 && event.currentTarget.selectionStart === input.length) {
                event.preventDefault();
                goUp();
                return;
              }
              if (event.key === 'Enter') {
                event.preventDefault();
                row?.run();
              }
            }}
            placeholder={clone ? 'Folder to clone into, e.g. ~/Code/' : 'Type a path (~/…), a project name, or a GitHub URL'}
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            className="flex-1 min-w-0 bg-transparent text-[15px] text-text placeholder:text-text-muted outline-none font-mono"
          />
          {cloning ? <Spinner className="w-3.5 h-3.5" /> : <kbd className="text-[11px] text-text-muted">esc</kbd>}
        </div>
        {cloning && <div className="px-4 py-2 border-b border-overlay-border font-mono text-[11px] text-text-secondary truncate">{cloning}</div>}
        <div ref={listRef} className="flex-1 min-h-0 overflow-y-auto p-1.5">
          {rows.length === 0 && <div className="px-3 py-6 text-center text-[13px] text-text-muted">No folders here</div>}
          {sections.map((section) => (
            <div key={section.label} className="pb-1">
              <div className="px-2.5 pt-2 pb-1 text-[11px] font-medium text-text-muted truncate">{section.label}</div>
              {section.rows.map((row) => {
                index = rows.indexOf(row);
                const current = index;
                return (
                  <button
                    key={row.key}
                    data-active={current === active}
                    onMouseMove={() => setActive(current)}
                    onClick={row.run}
                    tabIndex={-1}
                    className={cn('flex items-center gap-2.5 w-full h-9 px-2.5 rounded-md text-left cursor-pointer outline-none', current === active ? 'bg-selected' : 'hover:bg-hover')}
                  >
                    <span className="flex w-4 justify-center shrink-0">{row.icon}</span>
                    <span className="min-w-0 flex-1 truncate text-[13px] text-text">{row.title}</span>
                    {row.detail && <span className="shrink-0 min-w-0 truncate max-w-[45%]">{row.detail}</span>}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
        <div className="flex items-center gap-4 h-9 px-2 border-t border-overlay-border text-[11px] text-text-muted">
          <button onClick={() => void browseForFolder(navigate)} className="inline-flex items-center gap-1.5 h-7 px-2 rounded-md text-[12px] text-text-secondary hover:text-text hover:bg-hover cursor-pointer">
            <FolderOpenIcon size="sm" />
            Browse…
            <kbd className="font-sans text-[11px] text-text-muted">{modKey}⇧O</kbd>
          </button>
          <span className="ml-auto pr-2">Tab completes · → enters · ⌫ goes up · <GitHubIcon size={10} className="inline -mt-px" /> URLs clone</span>
        </div>
      </div>
    </div>,
    document.body,
  );
}
