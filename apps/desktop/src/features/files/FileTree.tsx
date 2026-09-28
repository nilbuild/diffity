import { useEffect, useMemo, useRef, useState } from 'react';
import { useHotkeys } from 'react-hotkeys-hook';
import { IconButton } from '@/components/ui/IconButton';
import {
  ChevronRightIcon,
  ChevronsDownUpIcon,
  ChevronsUpDownIcon,
  CommentIcon,
  FileIcon,
  FolderIcon,
  LightbulbIcon,
  SearchIcon,
} from '@/components/ui/icons';
import { Popover } from '@/components/ui/Popover';
import { cn } from '@/lib/cn';
import { agentBus } from '@/features/workspace/agent-bus';
import { useFilesStore } from './files-store';
import { allDirPaths, flattenTree, type TreeNode, type TreeRow } from './tree-model';

const ROW_HEIGHT = 24;
const OVERSCAN = 12;

export interface FileTreeProps {
  root: TreeNode;
  commentCounts: Map<string, number>;
  width: number;
}

export function FileTree(props: FileTreeProps) {
  const { root, commentCounts, width } = props;
  const expanded = useFilesStore((s) => s.expanded);
  const filter = useFilesStore((s) => s.filter);
  const setFilter = useFilesStore((s) => s.setFilter);
  const onlyCommented = useFilesStore((s) => s.onlyCommented);
  const toggleOnlyCommented = useFilesStore((s) => s.toggleOnlyCommented);
  const setExpanded = useFilesStore((s) => s.setExpanded);
  const selectedPath = useFilesStore((s) => s.selectedPath);
  const inputRef = useRef<HTMLInputElement>(null);
  const [menu, setMenu] = useState<{ path: string; x: number; y: number } | null>(null);

  useHotkeys('slash', (event) => {
    event.preventDefault();
    inputRef.current?.focus();
  });

  const rows = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    if (!needle && !onlyCommented) {
      return flattenTree(root, expanded, null);
    }
    return flattenTree(root, expanded, (path) => {
      if (needle && !path.toLowerCase().includes(needle)) {
        return false;
      }
      if (onlyCommented && !commentCounts.get(path)) {
        return false;
      }
      return true;
    });
  }, [root, expanded, filter, onlyCommented, commentCounts]);

  const anyExpanded = expanded.size > 0;

  return (
    <aside style={{ width }} className="flex shrink-0 flex-col border-r border-border bg-bg-subtle">
      <div className="flex items-center gap-1 border-b border-border px-2 py-1.5">
        <label className="flex h-6 min-w-0 flex-1 items-center gap-1.5 rounded-md border border-border bg-bg px-2 focus-within:border-accent">
          <SearchIcon size={12} className="shrink-0 text-fg-subtle" />
          <input
            ref={inputRef}
            value={filter}
            placeholder="Filter files  /"
            onChange={(event) => setFilter(event.target.value)}
            onKeyDown={(event) => {
              if (event.key !== 'Escape') {
                return;
              }
              setFilter('');
              event.currentTarget.blur();
            }}
            className="min-w-0 flex-1 bg-transparent text-xs outline-none placeholder:text-fg-subtle"
          />
        </label>
        <IconButton size="sm" label="Only files with open comments" active={onlyCommented} onClick={toggleOnlyCommented}>
          <CommentIcon size={13} />
        </IconButton>
        <IconButton
          size="sm"
          label={anyExpanded ? 'Collapse all' : 'Expand all'}
          onClick={() => setExpanded(anyExpanded ? new Set() : allDirPaths(root))}
        >
          {anyExpanded ? <ChevronsDownUpIcon size={14} /> : <ChevronsUpDownIcon size={14} />}
        </IconButton>
      </div>
      <VirtualRows
        rows={rows}
        selectedPath={selectedPath}
        commentCounts={commentCounts}
        onContextMenu={(path, x, y) => setMenu({ path, x, y })}
      />
      <TreeContextMenu menu={menu} onClose={() => setMenu(null)} />
    </aside>
  );
}

interface VirtualRowsProps {
  rows: TreeRow[];
  selectedPath: string | null;
  commentCounts: Map<string, number>;
  onContextMenu: (path: string, x: number, y: number) => void;
}

function VirtualRows(props: VirtualRowsProps) {
  const { rows, selectedPath, commentCounts, onContextMenu } = props;
  const containerRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [height, setHeight] = useState(600);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) {
      return;
    }
    const observer = new ResizeObserver(() => setHeight(el.clientHeight));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || !selectedPath) {
      return;
    }
    const index = rows.findIndex((r) => r.node.path === selectedPath);
    if (index === -1) {
      return;
    }
    const top = index * ROW_HEIGHT;
    if (top < el.scrollTop || top + ROW_HEIGHT > el.scrollTop + el.clientHeight) {
      el.scrollTop = Math.max(0, top - el.clientHeight / 3);
    }
  }, [selectedPath, rows]);

  const first = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN);
  const last = Math.min(rows.length, Math.ceil((scrollTop + height) / ROW_HEIGHT) + OVERSCAN);

  return (
    <div
      ref={containerRef}
      className="min-h-0 flex-1 overflow-y-auto py-1"
      onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
    >
      <div style={{ height: rows.length * ROW_HEIGHT, position: 'relative' }}>
        {rows.slice(first, last).map((row, offset) => (
          <TreeRowButton
            key={row.node.path}
            row={row}
            top={(first + offset) * ROW_HEIGHT}
            selected={row.node.path === selectedPath}
            comments={commentCounts.get(row.node.path) ?? 0}
            onContextMenu={onContextMenu}
          />
        ))}
      </div>
    </div>
  );
}

interface TreeRowButtonProps {
  row: TreeRow;
  top: number;
  selected: boolean;
  comments: number;
  onContextMenu: (path: string, x: number, y: number) => void;
}

function TreeRowButton(props: TreeRowButtonProps) {
  const { row, top, selected, comments, onContextMenu } = props;
  const { node, expanded } = row;
  const select = useFilesStore((s) => s.select);
  const toggleDir = useFilesStore((s) => s.toggleDir);

  return (
    <button
      type="button"
      title={node.path}
      style={{ top, height: ROW_HEIGHT, paddingLeft: 8 + node.depth * 14 }}
      onClick={() => {
        if (node.kind === 'dir') {
          toggleDir(node.path);
        }
        select(node.path);
      }}
      onContextMenu={(event) => {
        event.preventDefault();
        onContextMenu(node.path, event.clientX, event.clientY);
      }}
      className={cn(
        'absolute inset-x-0 flex cursor-default items-center gap-1.5 pr-3 text-left text-[12.5px]',
        selected ? 'bg-accent-subtle text-fg' : 'text-fg hover:bg-bg-muted',
      )}
    >
      {node.kind === 'dir' ? (
        <>
          <ChevronRightIcon size={12} className={cn('shrink-0 text-fg-subtle transition-transform', expanded && 'rotate-90')} />
          <FolderIcon size={14} className="shrink-0 text-accent/80" />
        </>
      ) : (
        <>
          <span className="w-3 shrink-0" />
          <FileIcon size={14} className="shrink-0 text-fg-subtle" />
        </>
      )}
      <span className="min-w-0 flex-1 truncate">{node.name}</span>
      {comments > 0 && (
        <span className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-accent-subtle px-1.5 text-[10px] font-semibold text-accent">
          {comments}
        </span>
      )}
    </button>
  );
}

function TreeContextMenu(props: { menu: { path: string; x: number; y: number } | null; onClose: () => void }) {
  const { menu, onClose } = props;
  const anchorRef = useRef<HTMLSpanElement>(null);

  return (
    <>
      <span ref={anchorRef} className="fixed size-0" style={{ left: menu?.x ?? 0, top: menu?.y ?? 0 }} />
      <Popover open={menu !== null} onOpenChange={(open) => !open && onClose()} anchorRef={anchorRef} className="min-w-[180px] py-1">
        <button
          type="button"
          className="flex w-full cursor-default items-center gap-2 px-3 py-1.5 text-left text-[13px] hover:bg-bg-muted"
          onClick={() => {
            if (menu) {
              agentBus.runAction({ kind: 'explain', path: menu.path });
            }
            onClose();
          }}
        >
          <LightbulbIcon size={13} className="text-fg-muted" />
          Explain with AI
        </button>
        <button
          type="button"
          className="flex w-full cursor-default items-center gap-2 px-3 py-1.5 text-left text-[13px] hover:bg-bg-muted"
          onClick={() => {
            if (menu) {
              void navigator.clipboard.writeText(menu.path);
            }
            onClose();
          }}
        >
          <FileIcon size={13} className="text-fg-muted" />
          Copy path
        </button>
      </Popover>
    </>
  );
}
