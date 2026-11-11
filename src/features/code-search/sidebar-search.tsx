import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState, type ReactNode } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import type { DiffFile, DiffLine, FileStatus } from '@/lib/diff-parser';
import { cn } from '../../lib/cn';
import { getFilePath } from '../../lib/diff-utils';
import { chord } from '../../lib/shortcuts';
import { errorMessage } from '../../lib/tauri';
import type { SearchFile, SearchMatch } from '../../lib/types';
import { useViewState } from '../../lib/view-state';
import { useRepoPath } from '../../hooks/use-repo';
import { CommentedOnlyToggle, SidebarFilter, SidebarMenu, SidebarSummary } from '../../components/layout/sidebar-frame';
import { statusLetter } from '../../components/tree/file-tree-item';
import { MenuItem, MenuLabel, MenuSeparator, Popover, useMenu } from '../../components/ui/popover';
import { ChevronDownIcon, CodeIcon, CollapseAllIcon, ExpandAllIcon, FileIcon, FileTextIcon, HistoryIcon, SearchIcon } from '../../components/ui/icon';
import { Spinner } from '../../components/icons/spinner';
import {
  clearSearchFocusRequest,
  isSearchCancelled,
  rememberSearch,
  updateCodeSearch,
  useCodeSearchPrefs,
  useCodeSearchResults,
  useSearchFocusRequest,
  type CodeSearchPrefs,
  type SidebarSearchMode,
} from './code-search';

/** A result to open: `inDiff` when the diff on screen shows that very line. */
export interface SearchTarget {
  path: string;
  line: number;
  inDiff: boolean;
}

interface SidebarSearchProps {
  view: 'diff' | 'tree';
  filter: string;
  onFilterChange: (value: string) => void;
  /** The commented-files toggle, shown while filtering file names. */
  commentedToggle?: { active: boolean; count: number; onToggle: () => void } | null;
  /** The ⋯ menu's own items, shown while filtering file names. */
  menu: (close: () => void) => ReactNode;
  /** The Diff view's files: a scope for the search, sorted first, and where a result can open in place. */
  diffFiles?: DiffFile[];
  onOpenResult: (target: SearchTarget) => void;
  /** The file tree and its summary, shown while filtering file names. */
  children: ReactNode;
}

const FIND_SHORTCUT = chord('F', { shift: true });
const GROUP_HEIGHT = 26;
const MATCH_HEIGHT = 24;
const SHOW_BUSY_AFTER_MS = 150;

interface DiffIndex {
  order: Map<string, number>;
  status: Map<string, FileStatus>;
  lines: Map<string, Map<number, DiffLine>>;
}

function indexDiff(files: DiffFile[]): DiffIndex {
  const index: DiffIndex = { order: new Map(), status: new Map(), lines: new Map() };
  files.forEach((file, position) => {
    const path = getFilePath(file);
    index.order.set(path, position);
    index.status.set(path, file.status);
    const byLine = new Map<number, DiffLine>();
    for (const hunk of file.hunks) {
      for (const line of hunk.lines) {
        if (line.type !== 'delete' && line.newLineNumber !== null) {
          byLine.set(line.newLineNumber, line);
        }
      }
    }
    index.lines.set(path, byLine);
  });
  return index;
}

/** The diff's row for this match, when the diff shows that line with the same text. */
function diffLineFor(index: DiffIndex | null, path: string, match: SearchMatch): DiffLine | null {
  const line = index?.lines.get(path)?.get(match.line);
  if (!line) {
    return null;
  }
  const text = match.text.replace(/^…/, '').replace(/…$/, '');
  return line.content === match.text || line.content.includes(text) ? line : null;
}

function useDelayedFlag(flag: boolean, delay: number): boolean {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    if (!flag) {
      setShown(false);
      return;
    }
    const timer = setTimeout(() => setShown(true), delay);
    return () => clearTimeout(timer);
  }, [flag, delay]);
  return shown;
}

function ModeSwitch(props: { mode: SidebarSearchMode; onChange: (mode: SidebarSearchMode) => void }) {
  const { mode, onChange } = props;
  const menu = useMenu();
  const code = mode === 'code';

  return (
    <>
      <button
        ref={menu.anchorRef}
        onClick={menu.toggle}
        aria-label={code ? 'Searching code. Switch search mode' : 'Filtering file names. Switch search mode'}
        title={code ? 'Searching code' : 'Filtering file names'}
        aria-expanded={menu.open}
        className={cn(
          'absolute left-[3px] top-1/2 -translate-y-1/2 h-[22px] pl-1.5 pr-0.5 inline-flex items-center gap-px rounded cursor-pointer transition-colors',
          code ? 'text-accent' : 'text-text-muted',
          'hover:bg-hover hover:text-text',
          menu.open && 'bg-hover text-text',
        )}
      >
        {code ? <CodeIcon size="sm" /> : <SearchIcon size="sm" />}
        <ChevronDownIcon className="w-2.5 h-2.5" />
      </button>
      <Popover open={menu.open} onClose={menu.close} anchorRef={menu.anchorRef} width={220}>
        <ModeItems mode={mode} onChange={(next) => { onChange(next); menu.close(); }} />
      </Popover>
    </>
  );
}

function ModeItems(props: { mode: SidebarSearchMode; onChange: (mode: SidebarSearchMode) => void }) {
  const { mode, onChange } = props;

  return (
    <>
      <MenuLabel>Search in</MenuLabel>
      <MenuItem icon={<FileTextIcon size="sm" />} label="File names" hint="/" checked={mode === 'files'} onSelect={() => onChange('files')} />
      <MenuItem icon={<CodeIcon size="sm" />} label="Code" hint={FIND_SHORTCUT} checked={mode === 'code'} onSelect={() => onChange('code')} />
    </>
  );
}

function OptionToggle(props: { label: ReactNode; title: string; active: boolean; onToggle: () => void }) {
  const { label, title, active, onToggle } = props;

  return (
    <button
      title={title}
      aria-label={title}
      aria-pressed={active}
      onClick={onToggle}
      className={cn(
        'w-7 h-[22px] inline-flex items-center justify-center rounded-[5px] border font-mono text-[11px] cursor-pointer transition-colors',
        active ? 'bg-accent/12 border-accent/40 text-accent' : 'border-transparent text-text-muted hover:bg-hover hover:text-text',
      )}
    >
      {label}
    </button>
  );
}

function ScopeToggle(props: { scope: CodeSearchPrefs['scope']; onChange: (scope: CodeSearchPrefs['scope']) => void }) {
  const { scope, onChange } = props;
  const options: { value: CodeSearchPrefs['scope']; label: string; title: string }[] = [
    { value: 'all', label: 'All files', title: 'Search every file' },
    { value: 'diff', label: 'This diff', title: 'Search only the files in this diff' },
  ];

  return (
    <div className="flex items-center p-0.5 gap-0.5 rounded-md bg-fill">
      {options.map((option) => (
        <button
          key={option.value}
          title={option.title}
          aria-pressed={scope === option.value}
          onClick={() => onChange(option.value)}
          className={cn(
            'h-5 px-2 rounded-[4px] text-xs cursor-pointer transition-colors',
            scope === option.value ? 'bg-toggle text-text font-medium ring-1 ring-toggle-border' : 'text-text-secondary hover:text-text',
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

/** The line with its matches marked, leading indent dropped and a long lead-in cut so the first match shows. */
function Snippet(props: { match: SearchMatch }) {
  const { match } = props;
  const { text, ranges } = match;
  const first = ranges[0]?.[0] ?? 0;
  let start = Math.min(text.length - text.trimStart().length, first);
  let prefix = '';
  if (first - start > 40) {
    start = first - 16;
    prefix = '…';
  }
  const parts: ReactNode[] = [];
  let position = start;
  ranges.forEach(([from, to], index) => {
    const begin = Math.max(from, position);
    if (to <= begin) {
      return;
    }
    if (begin > position) {
      parts.push(text.slice(position, begin));
    }
    parts.push(<mark key={index} className="search-mark">{text.slice(begin, to)}</mark>);
    position = to;
  });
  parts.push(text.slice(position));

  return (
    <span className="min-w-0 truncate font-mono text-xs text-text-secondary whitespace-pre">
      {prefix}
      {parts}
    </span>
  );
}

type ResultItem =
  | { kind: 'group'; file: SearchFile; collapsed: boolean }
  | { kind: 'match'; file: SearchFile; match: SearchMatch };

interface ResultsListHandle {
  focusFirst: () => boolean;
  openFirst: () => void;
}

interface ResultsListProps {
  files: SearchFile[];
  collapsed: Set<string>;
  onToggleGroup: (path: string, collapse?: boolean) => void;
  active: { path: string; line: number } | null;
  diffIndex: DiffIndex | null;
  dimmed: boolean;
  footer: ReactNode;
  onOpen: (file: SearchFile, match: SearchMatch) => void;
  onExit: () => void;
}

const ResultsList = forwardRef<ResultsListHandle, ResultsListProps>(function ResultsList(props, ref) {
  const { files, collapsed, onToggleGroup, active, diffIndex, dimmed, footer, onOpen, onExit } = props;
  const scrollRef = useRef<HTMLDivElement>(null);
  const [focusIndex, setFocusIndex] = useState(-1);

  const items = useMemo(() => {
    const list: ResultItem[] = [];
    for (const file of files) {
      const isCollapsed = collapsed.has(file.path);
      list.push({ kind: 'group', file, collapsed: isCollapsed });
      if (isCollapsed) {
        continue;
      }
      for (const match of file.matches) {
        list.push({ kind: 'match', file, match });
      }
    }
    return list;
  }, [files, collapsed]);

  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: (index) => (items[index].kind === 'group' ? GROUP_HEIGHT : MATCH_HEIGHT),
    overscan: 20,
  });

  useEffect(() => {
    setFocusIndex((index) => Math.min(index, items.length - 1));
  }, [items.length]);

  const moveFocus = useCallback((index: number) => {
    setFocusIndex(index);
    virtualizer.scrollToIndex(index, { align: 'auto' });
  }, [virtualizer]);

  useImperativeHandle(ref, () => ({
    focusFirst: () => {
      const first = items.findIndex((item) => item.kind === 'match');
      if (first < 0) {
        return false;
      }
      moveFocus(first);
      scrollRef.current?.focus();
      return true;
    },
    openFirst: () => {
      const first = items.find((item) => item.kind === 'match');
      if (first?.kind === 'match') {
        onOpen(first.file, first.match);
      }
    },
  }), [items, moveFocus, onOpen]);

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const item = items[focusIndex];
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (items.length === 0) {
        return;
      }
      const step = event.key === 'ArrowDown' ? 1 : -1;
      moveFocus(Math.min(items.length - 1, Math.max(0, focusIndex + step)));
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      onExit();
      return;
    }
    if (!item) {
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      if (item.kind === 'group') {
        onToggleGroup(item.file.path);
        return;
      }
      onOpen(item.file, item.match);
      return;
    }
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      const groupIndex = items.findIndex((candidate) => candidate.kind === 'group' && candidate.file.path === item.file.path);
      onToggleGroup(item.file.path, true);
      setFocusIndex(groupIndex);
      return;
    }
    if (event.key === 'ArrowRight' && item.kind === 'group') {
      event.preventDefault();
      onToggleGroup(item.file.path, false);
    }
  };

  const focused = items[focusIndex];

  return (
    <div
      ref={scrollRef}
      tabIndex={0}
      role="listbox"
      aria-label="Search results"
      aria-activedescendant={focused ? `search-item-${focusIndex}` : undefined}
      onKeyDown={handleKeyDown}
      onBlur={() => setFocusIndex(-1)}
      className={cn('flex-1 min-h-0 overflow-y-auto px-2 pb-3 outline-none transition-opacity', dimmed && 'opacity-55')}
    >
      <div className="relative w-full" style={{ height: virtualizer.getTotalSize() }}>
        {virtualizer.getVirtualItems().map((row) => {
          const item = items[row.index];
          const isFocused = row.index === focusIndex;
          if (item.kind === 'group') {
            const path = item.file.path;
            const slash = path.lastIndexOf('/');
            const status = diffIndex?.status.get(path);
            const letter = status ? statusLetter(status) : null;
            return (
              <div
                key={row.key}
                id={`search-item-${row.index}`}
                role="option"
                aria-selected={false}
                aria-expanded={!item.collapsed}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => { setFocusIndex(row.index); onToggleGroup(path); }}
                title={path}
                className={cn(
                  'absolute left-0 right-0 flex items-center gap-1.5 pl-1 pr-1.5 rounded-md cursor-pointer whitespace-nowrap hover:bg-hover',
                  isFocused && 'ring-1 ring-inset ring-focus',
                  item.file.diffIgnored && 'opacity-60',
                )}
                style={{ top: row.start, height: GROUP_HEIGHT }}
              >
                <ChevronDownIcon className={cn('w-3 h-3 shrink-0 text-text-muted transition-transform', item.collapsed && '-rotate-90')} />
                <FileIcon className="w-3.5 h-3.5 shrink-0 text-text-muted" />
                <span className="shrink-0 font-medium text-[13px] text-text">{path.slice(slash + 1)}</span>
                <span className="min-w-0 flex-1 truncate text-xs text-text-muted">{slash > 0 ? path.slice(0, slash) : ''}</span>
                {letter && (
                  <span className={cn('shrink-0 w-3 text-center font-mono text-[11px] font-semibold', letter.className)} title={letter.label}>
                    {letter.letter}
                  </span>
                )}
                <span className="shrink-0 min-w-[18px] h-4 px-1.5 rounded-full bg-fill text-text-secondary text-[10px] font-semibold leading-4 text-center tabular-nums">
                  {item.file.matches.length}
                </span>
              </div>
            );
          }
          const { file, match } = item;
          const isActive = active?.path === file.path && active.line === match.line;
          const added = diffLineFor(diffIndex, file.path, match)?.type === 'add';
          return (
            <div
              key={row.key}
              id={`search-item-${row.index}`}
              role="option"
              aria-selected={isActive}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => { setFocusIndex(row.index); onOpen(file, match); }}
              title={added ? `Line ${match.line}, added in this diff` : `Line ${match.line}`}
              className={cn(
                'search-row absolute left-0 right-0 flex items-center gap-2 pl-5 pr-2 rounded-md cursor-pointer hover:bg-hover',
                isActive && 'bg-active search-row-active',
                isFocused && 'ring-1 ring-inset ring-focus',
              )}
              style={{ top: row.start, height: MATCH_HEIGHT }}
            >
              {added && <span className="absolute left-[11px] top-[5px] bottom-[5px] w-0.5 rounded-full bg-diff-added" aria-hidden />}
              <span className="shrink-0 w-7 text-right font-mono text-[11px] text-text-muted tabular-nums">{match.line}</span>
              <Snippet match={match} />
            </div>
          );
        })}
      </div>
      {footer}
    </div>
  );
});

export function SidebarSearch(props: SidebarSearchProps) {
  const { view, filter, onFilterChange, commentedToggle, menu, diffFiles, onOpenResult, children } = props;
  const repoPath = useRepoPath();
  const prefs = useCodeSearchPrefs(repoPath);
  const code = prefs.mode === 'code';
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<ResultsListHandle>(null);
  const focusRequested = useSearchFocusRequest(repoPath);
  const [active, setActive] = useViewState<{ path: string; line: number } | null>('code-search:active', null);
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());

  const update = useCallback((patch: Partial<CodeSearchPrefs>) => updateCodeSearch(repoPath, patch), [repoPath]);

  useEffect(() => {
    if (!focusRequested) {
      return;
    }
    clearSearchFocusRequest();
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [focusRequested]);

  const inDiffView = view === 'diff' && !!diffFiles;
  const scoped = inDiffView && prefs.scope === 'diff';
  const scopePaths = useMemo(() => (scoped && diffFiles ? diffFiles.map(getFilePath).sort() : null), [scoped, diffFiles]);
  const diffIndex = useMemo(() => (inDiffView && diffFiles ? indexDiff(diffFiles) : null), [inDiffView, diffFiles]);

  const search = useCodeSearchResults(repoPath, prefs, scopePaths, code);
  const searchError = search.error && !isSearchCancelled(search.error) ? search.error : null;
  const invalid = !!searchError && (searchError as { code?: string }).code === 'invalid';
  const data = searchError ? undefined : search.data;
  const waiting = code && prefs.query.length > 0 && (!search.settled || search.isFetching);
  const busy = useDelayedFlag(waiting, SHOW_BUSY_AFTER_MS);

  useEffect(() => {
    setCollapsed(new Set());
  }, [prefs.query, prefs.caseSensitive, prefs.wholeWord, prefs.regex, prefs.scope]);

  const files = useMemo(() => {
    const found = data?.files ?? [];
    if (!diffIndex) {
      return found;
    }
    const inDiff = found.filter((file) => diffIndex.order.has(file.path));
    inDiff.sort((a, b) => (diffIndex.order.get(a.path) ?? 0) - (diffIndex.order.get(b.path) ?? 0));
    return [...inDiff, ...found.filter((file) => !diffIndex.order.has(file.path))];
  }, [data, diffIndex]);

  const toggleGroup = useCallback((path: string, collapse?: boolean) => {
    setCollapsed((prev) => {
      const shouldCollapse = collapse ?? !prev.has(path);
      if (shouldCollapse === prev.has(path)) {
        return prev;
      }
      const next = new Set(prev);
      if (shouldCollapse) {
        next.add(path);
      } else {
        next.delete(path);
      }
      return next;
    });
  }, []);

  const openMatch = useCallback((file: SearchFile, match: SearchMatch) => {
    rememberSearch(repoPath, prefs.query);
    setActive({ path: file.path, line: match.line });
    onOpenResult({ path: file.path, line: match.line, inDiff: !!diffLineFor(diffIndex, file.path, match) });
  }, [repoPath, prefs.query, setActive, onOpenResult, diffIndex]);

  const setMode = (mode: SidebarSearchMode) => {
    update({ mode });
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (!code) {
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      if (prefs.query) {
        update({ query: '' });
        return;
      }
      update({ mode: 'files' });
      return;
    }
    if (event.key === 'ArrowDown') {
      if (listRef.current?.focusFirst()) {
        event.preventDefault();
      }
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      listRef.current?.openFirst();
    }
  };

  const allCollapsed = files.length > 0 && files.every((file) => collapsed.has(file.path));
  const setAllCollapsed = (collapse: boolean) => setCollapsed(collapse ? new Set(files.map((file) => file.path)) : new Set());

  const summary = () => {
    if (!prefs.query) {
      return <span className="truncate">{scoped ? `Searches the ${diffFiles?.length ?? 0} files in this diff` : 'Searches every file'}</span>;
    }
    if (searchError) {
      return <span className="truncate">No search</span>;
    }
    if (!data) {
      return busy ? <><Spinner /><span>Searching…</span></> : null;
    }
    if (data.total === 0) {
      return <><span>0 results</span>{busy && <Spinner />}</>;
    }
    return (
      <>
        <span className="truncate">
          {data.total.toLocaleString()}{data.truncated ? '+' : ''} result{data.total === 1 ? '' : 's'} in {files.length} file{files.length === 1 ? '' : 's'}
        </span>
        {busy && <Spinner />}
        <span className="flex-1" />
        {files.length > 1 && (
          <button className="h-5 px-1 -mr-1 rounded text-text-muted hover:text-text hover:bg-hover cursor-pointer" onClick={() => setAllCollapsed(!allCollapsed)}>
            {allCollapsed ? 'Expand all' : 'Collapse all'}
          </button>
        )}
      </>
    );
  };

  const body = () => {
    if (!prefs.query) {
      return (
        <div className="flex-1 min-h-0 overflow-y-auto px-2 pb-3">
          {prefs.recent.length > 0 && (
            <>
              <div className="px-2 pt-1 pb-1 text-[11px] font-medium text-text-secondary">Recent</div>
              {prefs.recent.map((query) => (
                <button
                  key={query}
                  className="flex items-center gap-2 w-full h-7 px-2 rounded-md text-left font-mono text-xs text-text hover:bg-hover cursor-pointer"
                  onClick={() => { update({ query }); inputRef.current?.focus(); }}
                >
                  <HistoryIcon size="sm" className="shrink-0 text-text-muted" />
                  <span className="truncate">{query}</span>
                </button>
              ))}
            </>
          )}
          <p className="px-2 pt-3 text-xs leading-[18px] text-text-muted">
            ↓ moves into the results and ↵ opens one. Esc clears the search, then goes back to filtering file names.
          </p>
        </div>
      );
    }
    if (searchError) {
      return (
        <div className="flex flex-col items-center gap-2 px-4 pt-6 text-center text-xs text-text-muted">
          {invalid ? (
            <>
              <span>Fix the pattern, or search for the text as typed.</span>
              <button className="h-6 px-2.5 rounded-md border border-control-border bg-raised text-text hover:bg-control-hover cursor-pointer" onClick={() => update({ regex: false })}>
                Turn off regex
              </button>
            </>
          ) : (
            <span>Search failed: {errorMessage(searchError)}</span>
          )}
        </div>
      );
    }
    if (data && files.length === 0 && search.settled && !search.isFetching) {
      const fix = prefs.caseSensitive
        ? { label: 'Turn off Match case', patch: { caseSensitive: false } }
        : prefs.wholeWord
          ? { label: 'Turn off Whole word', patch: { wholeWord: false } }
          : scoped
            ? { label: 'Search all files', patch: { scope: 'all' as const } }
            : null;
      return (
        <div className="flex flex-col items-center gap-2 px-4 pt-6 text-center text-xs text-text-muted">
          <span className="text-[13px] text-text">No results</span>
          <span>Ignored, binary and very large files aren’t searched.</span>
          {fix && (
            <button className="h-6 px-2.5 rounded-md border border-control-border bg-raised text-text hover:bg-control-hover cursor-pointer" onClick={() => update(fix.patch)}>
              {fix.label}
            </button>
          )}
        </div>
      );
    }
    return (
      <ResultsList
        ref={listRef}
        files={files}
        collapsed={collapsed}
        onToggleGroup={toggleGroup}
        active={active}
        diffIndex={diffIndex}
        dimmed={busy && !!data}
        onOpen={openMatch}
        onExit={() => inputRef.current?.focus()}
        footer={data?.truncated && (
          <p className="mx-1 mt-2 px-2.5 py-2 rounded-md bg-fill text-xs leading-[17px] text-text-secondary">
            Showing the first {data.total.toLocaleString()} results. Make the search more specific to see the rest.
          </p>
        )}
      />
    );
  };

  return (
    <>
      <SidebarFilter
        ref={inputRef}
        value={code ? prefs.query : filter}
        onChange={code ? (query) => update({ query }) : onFilterChange}
        placeholder={code ? 'Search code' : 'Filter files'}
        shortcut={code ? FIND_SHORTCUT : '/'}
        invalid={code && invalid}
        leading={<ModeSwitch mode={prefs.mode} onChange={setMode} />}
        onKeyDown={handleKeyDown}
        trailing={
          <>
            {!code && commentedToggle && commentedToggle.count > 0 && (
              <CommentedOnlyToggle active={commentedToggle.active} count={commentedToggle.count} onToggle={commentedToggle.onToggle} />
            )}
            <SidebarMenu title={code ? 'Search options' : 'File list options'}>
              {(close) => (
                <>
                  <ModeItems mode={prefs.mode} onChange={(mode) => { setMode(mode); close(); }} />
                  <MenuSeparator />
                  {code ? (
                    <>
                      <MenuItem icon={<CollapseAllIcon size="sm" />} label="Collapse all results" disabled={files.length === 0 || allCollapsed} onSelect={() => { setAllCollapsed(true); close(); }} />
                      <MenuItem icon={<ExpandAllIcon size="sm" />} label="Expand all results" disabled={collapsed.size === 0} onSelect={() => { setAllCollapsed(false); close(); }} />
                    </>
                  ) : (
                    menu(close)
                  )}
                </>
              )}
            </SidebarMenu>
          </>
        }
      />
      {code ? (
        <>
          <div className="flex items-center justify-between gap-2 px-3 pb-2 shrink-0">
            {inDiffView ? <ScopeToggle scope={prefs.scope} onChange={(scope) => update({ scope })} /> : <span />}
            <div className="flex items-center gap-0.5">
              <OptionToggle label="Aa" title="Match case" active={prefs.caseSensitive} onToggle={() => update({ caseSensitive: !prefs.caseSensitive })} />
              <OptionToggle label={<span className="underline underline-offset-2">ab</span>} title="Match whole word" active={prefs.wholeWord} onToggle={() => update({ wholeWord: !prefs.wholeWord })} />
              <OptionToggle label=".*" title="Use regular expression" active={prefs.regex} onToggle={() => update({ regex: !prefs.regex })} />
            </div>
          </div>
          {invalid && <div className="px-4 -mt-1 pb-2 text-xs leading-4 text-deleted">{errorMessage(searchError)}</div>}
          <SidebarSummary>{summary()}</SidebarSummary>
          {body()}
        </>
      ) : null}
      {/* Kept mounted while searching code, so the tree keeps its folders and scroll. */}
      <div className={code ? 'hidden' : 'contents'}>{children}</div>
    </>
  );
}
