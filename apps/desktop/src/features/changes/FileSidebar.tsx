import { useRef, type RefObject } from 'react';
import { useHotkeys } from 'react-hotkeys-hook';
import { IconButton } from '@/components/ui/IconButton';
import { Input } from '@/components/ui/Input';
import { Kbd } from '@/components/ui/Kbd';
import { CheckIcon, CollapseAllIcon, ExpandAllIcon, CommentIcon, SearchIcon } from '@/components/ui/icon';
import { cn } from '@/lib/cn';
import { useChangesStore } from './changes-store';
import { CommentCount, DiffStat, FileStatusBadge } from './StatusBadge';
import type { DiffEntry } from './use-diff';

export interface FileSidebarProps {
  entries: DiffEntry[];
  totalCount: number;
  openCounts: Map<string, number>;
  viewedPaths: Set<string>;
  allCollapsed: boolean;
  onSelect: (path: string) => void;
  onToggleAll: () => void;
  width: number;
}

export function FileSidebar(props: FileSidebarProps) {
  const { entries, totalCount, openCounts, viewedPaths, allCollapsed, onSelect, onToggleAll, width } = props;
  const filter = useChangesStore((s) => s.filter);
  const setFilter = useChangesStore((s) => s.setFilter);
  const onlyCommented = useChangesStore((s) => s.onlyCommented);
  const toggleOnlyCommented = useChangesStore((s) => s.toggleOnlyCommented);
  const currentFile = useChangesStore((s) => s.currentFile);
  const inputRef = useRef<HTMLInputElement>(null);

  useHotkeys('slash', (event) => {
    event.preventDefault();
    inputRef.current?.focus();
  });

  const viewedCount = entries.filter((e) => viewedPaths.has(e.summary.path)).length;

  return (
    <aside style={{ width }} className="flex shrink-0 flex-col bg-panel">
      <div className="flex h-11 shrink-0 items-center gap-1 px-3">
        <FilterInput inputRef={inputRef} value={filter} onChange={setFilter} />
        <IconButton size="sm" label="Only files with open comments" active={onlyCommented} onClick={toggleOnlyCommented}>
          <CommentIcon size={14} />
        </IconButton>
        <IconButton size="sm" label={allCollapsed ? 'Expand all' : 'Collapse all'}
          shortcut="⇧X" onClick={onToggleAll}>
          {allCollapsed ? <ExpandAllIcon size={14} /> : <CollapseAllIcon size={14} />}
        </IconButton>
      </div>
      <div className="flex h-8 shrink-0 items-center justify-between px-5 text-sm">
        <span className="font-medium text-fg">Changed files</span>
        <span className="text-xs text-fg-subtle tabular-nums">
          {entries.length === totalCount ? totalCount : `${entries.length}/${totalCount}`}
          {viewedCount > 0 && ` · ${viewedCount} viewed`}
        </span>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
        {entries.map((entry) => (
          <FileRow
            key={entry.summary.path}
            entry={entry}
            active={entry.summary.path === currentFile}
            viewed={viewedPaths.has(entry.summary.path)}
            openComments={openCounts.get(entry.summary.path) ?? 0}
            onSelect={onSelect}
          />
        ))}
      </div>
    </aside>
  );
}

function FilterInput(props: { inputRef: RefObject<HTMLInputElement | null>; value: string; onChange: (value: string) => void }) {
  const { inputRef, value, onChange } = props;
  return (
    <Input
      ref={inputRef}
      wrapperClassName="flex-1 rounded-full"
      icon={<SearchIcon size={14} />}
      trailing={!value && <Kbd className="h-4 min-w-4">/</Kbd>}
      value={value}
      placeholder="Filter files"
      onChange={(event) => onChange(event.target.value)}
      onKeyDown={(event) => {
        if (event.key !== 'Escape') {
          return;
        }
        onChange('');
        event.currentTarget.blur();
      }}
    />
  );
}

interface FileRowProps {
  entry: DiffEntry;
  active: boolean;
  viewed: boolean;
  openComments: number;
  onSelect: (path: string) => void;
}

function FileRow(props: FileRowProps) {
  const { entry, active, viewed, openComments, onSelect } = props;
  const { path, status, additions, deletions, binary } = entry.summary;
  const slash = path.lastIndexOf('/');
  const name = path.slice(slash + 1);
  const dir = slash === -1 ? '' : path.slice(0, slash);

  return (
    <button
      type="button"
      title={path}
      onClick={() => onSelect(path)}
      className={cn(
        'group flex h-7 w-full cursor-default items-center gap-2.5 rounded-lg px-3 text-left',
        active ? 'bg-selected' : 'hover:bg-hover',
        viewed && 'opacity-55',
      )}
    >
      <FileStatusBadge status={status} />
      <span className={cn('min-w-0 flex-1 truncate text-sm', active ? 'font-medium text-fg' : 'text-fg-muted', viewed && 'line-through')}>
        {name}
        {dir && <span className="ml-1.5 text-xs font-normal text-fg-subtle">{dir}</span>}
      </span>
      {openComments > 0 && <CommentCount count={openComments} />}
      {binary ? <span className="text-2xs text-fg-subtle">bin</span> : <DiffStat additions={additions} deletions={deletions} />}
      {viewed && <CheckIcon size={12} className="shrink-0 text-accent" />}
    </button>
  );
}
