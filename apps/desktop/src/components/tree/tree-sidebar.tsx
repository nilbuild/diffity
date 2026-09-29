import { useMemo, useState, useCallback, useEffect, forwardRef } from 'react';
import {
  buildFileTreeFromPaths,
  collapseSingleChildDirs,
  sortTree,
  filterTree,
  filterTreeToPaths,
  collectAllDirPaths,
} from '../../lib/file-tree';
import { FileTreeItem } from './file-tree-item';
import { SidebarIcon } from '../icons/sidebar-icon';
import { SearchIcon } from '../icons/search-icon';
import { XIcon } from '../icons/x-icon';
import { CommentIcon } from '../icons/comment-icon';
import { CollapseAllIcon } from '../icons/collapse-all-icon';
import { ExpandAllIcon } from '../icons/expand-all-icon';

interface TreeSidebarProps {
  paths: string[];
  activeFile: string | null;
  commentCountsByFile: Map<string, number>;
  onFileClick: (path: string) => void;
  onDirClick: (path: string) => void;
}

export const TreeSidebar = forwardRef<HTMLInputElement, TreeSidebarProps>(function TreeSidebar(props, ref) {
  const {
    paths,
    activeFile,
    commentCountsByFile,
    onFileClick,
    onDirClick,
  } = props;

  const [search, setSearch] = useState('');
  const [collapsed, setCollapsed] = useState(false);
  const [expandedDirs, setExpandedDirs] = useState<Set<string> | null>(null);
  const [commentedFilesOnly, setCommentedFilesOnly] = useState(false);

  const tree = useMemo(() => {
    return sortTree(collapseSingleChildDirs(buildFileTreeFromPaths(paths)));
  }, [paths]);

  const allDirPaths = useMemo(() => collectAllDirPaths(tree), [tree]);

  const commentedPaths = useMemo(
    () => new Set(commentCountsByFile.keys()),
    [commentCountsByFile],
  );

  const commentedFileCount = commentCountsByFile.size;
  const commentedFileCountLabel = commentedFileCount > 99 ? '99+' : String(commentedFileCount);

  const effectiveCommentedOnly = commentedFilesOnly && commentedFileCount > 0;

  // Auto-expand to active file
  useEffect(() => {
    if (!activeFile) {
      return;
    }
    const parts = activeFile.split('/');
    if (parts.length <= 1) {
      return;
    }
    setExpandedDirs(prev => {
      const next = new Set(prev ?? []);
      for (let i = 1; i < parts.length; i++) {
        next.add(parts.slice(0, i).join('/'));
      }
      return next;
    });
  }, [activeFile, allDirPaths]);

  const effectiveExpanded = useMemo(() => {
    if (search || effectiveCommentedOnly) {
      const baseTree = effectiveCommentedOnly ? filterTreeToPaths(tree, commentedPaths) : tree;
      const filtered = search ? filterTree(baseTree, search) : baseTree;
      return new Set(collectAllDirPaths(filtered));
    }
    return expandedDirs ?? new Set<string>();
  }, [search, effectiveCommentedOnly, tree, expandedDirs, commentedPaths]);

  const displayTree = useMemo(() => {
    let result = tree;
    if (effectiveCommentedOnly) {
      result = filterTreeToPaths(result, commentedPaths);
    }
    if (search) {
      result = filterTree(result, search);
    }
    return result;
  }, [tree, search, effectiveCommentedOnly, commentedPaths]);

  const allExpanded = effectiveExpanded.size >= allDirPaths.length;

  // Expand only on click (no collapse); chevron handles collapse
  const handleExpandDir = useCallback((path: string) => {
    setExpandedDirs(prev => {
      const next = new Set(prev ?? []);
      next.add(path);
      return next;
    });
    onDirClick(path);
  }, [onDirClick]);

  const handleCollapseDir = useCallback((path: string) => {
    setExpandedDirs(prev => {
      const next = new Set(prev ?? []);
      next.delete(path);
      return next;
    });
  }, []);

  const handleExpandOnly = useCallback((path: string) => {
    const parts = path.split('/');
    const next = new Set<string>();
    for (let i = 1; i <= parts.length; i++) {
      next.add(parts.slice(0, i).join('/'));
    }
    setExpandedDirs(next);
  }, []);

  const emptyReviewedFiles = useMemo(() => new Set<string>(), []);

  if (collapsed) {
    return (
      <div className="w-10 min-w-10 border-r border-border bg-bg-secondary flex items-start justify-center pt-3">
        <button
          className="p-1.5 rounded-md text-text-muted hover:text-text hover:bg-hover cursor-pointer"
          onClick={() => setCollapsed(false)}
          title="Show sidebar"
        >
          <SidebarIcon className="w-4 h-4" />
        </button>
      </div>
    );
  }

  return (
    <aside className="w-72 min-w-72 border-r border-border bg-bg-secondary flex flex-col overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-border">
        <span className="text-xs font-medium text-text-secondary flex items-center gap-2 uppercase tracking-wider">
          Files
          <span className="inline-flex items-center justify-center min-w-5 h-5 px-1.5 bg-bg-tertiary rounded-full text-[10px] font-semibold text-text-muted">
            {paths.length}
          </span>
        </span>
        <div className="flex items-center gap-0.5">
          <button
            className="p-1 rounded-md text-text-muted hover:text-text hover:bg-hover cursor-pointer"
            onClick={() => {
              if (allExpanded) {
                setExpandedDirs(new Set());
              } else {
                setExpandedDirs(new Set(allDirPaths));
              }
            }}
            title={allExpanded ? 'Collapse all' : 'Expand all'}
          >
            {allExpanded ? (
              <CollapseAllIcon className="w-3.5 h-3.5" />
            ) : (
              <ExpandAllIcon className="w-3.5 h-3.5" />
            )}
          </button>
          <button
            className="p-1 rounded-md text-text-muted hover:text-text hover:bg-hover cursor-pointer"
            onClick={() => setCollapsed(true)}
            title="Hide sidebar"
          >
            <SidebarIcon className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
      <div className="flex items-center gap-2 px-3 py-2">
        <div className="relative flex-1">
          <SearchIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-muted pointer-events-none" />
          <input
            ref={ref}
            className="w-full h-8 pl-7 pr-7 border border-border rounded-md bg-bg text-xs outline-none focus:border-accent focus:ring-1 focus:ring-accent/20 placeholder:text-text-muted"
            type="text"
            placeholder='Press "/" to focus'
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          {search && (
            <button
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-text-muted hover:text-text cursor-pointer"
              onClick={() => setSearch('')}
            >
              <XIcon className="w-3 h-3" />
            </button>
          )}
        </div>
        {commentedFileCount > 0 && (
          <button
            className={`inline-flex items-center gap-1.5 shrink-0 h-8 px-2 rounded-md border transition-colors cursor-pointer ${
              effectiveCommentedOnly
                ? 'border-accent bg-accent/8 text-accent'
                : 'border-border bg-bg hover:bg-hover text-text-secondary hover:text-text'
            }`}
            onClick={() => setCommentedFilesOnly(prev => !prev)}
            title={effectiveCommentedOnly ? 'Show all files' : 'Show only files with open comments'}
            aria-pressed={effectiveCommentedOnly}
          >
            <CommentIcon className="w-3.5 h-3.5" />
            <span
              className={`inline-flex items-center justify-center min-w-[16px] h-[16px] px-1 rounded-full text-[9px] font-semibold leading-none tabular-nums ${
                effectiveCommentedOnly
                  ? 'bg-bg text-accent'
                  : 'bg-bg-tertiary text-text-secondary'
              }`}
            >
              {commentedFileCountLabel}
            </span>
          </button>
        )}
      </div>
      <div className="flex-1 overflow-y-auto py-1">
        {displayTree.length === 0 ? (
          <div className="px-4 py-6 text-center text-xs text-text-muted">
            {search
              ? 'No matching files'
              : effectiveCommentedOnly
                ? 'No files with open comments'
                : 'No files'}
          </div>
        ) : (
          displayTree.map(node => (
            <FileTreeItem
              key={node.path}
              node={node}
              depth={0}
              activeFile={activeFile}
              reviewedFiles={emptyReviewedFiles}
              commentCountsByFile={commentCountsByFile}
              expandedDirs={effectiveExpanded}
              onToggleDir={handleExpandDir}
              onCollapseDir={handleCollapseDir}
              onExpandOnly={handleExpandOnly}
              onFileClick={onFileClick}
            />
          ))
        )}
      </div>
    </aside>
  );
});
