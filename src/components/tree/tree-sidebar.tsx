import { useMemo, useCallback, useEffect, useRef } from 'react';
import {
  buildFileTreeFromPaths,
  collapseSingleChildDirs,
  sortTree,
  filterTree,
  filterTreeToPaths,
  collectAllDirPaths,
} from '../../lib/file-tree';
import { FileTreeItem } from './file-tree-item';
import { SidebarFrame, SidebarSummary } from '../layout/sidebar-frame';
import { SidebarSearch, type SearchTarget } from '../../features/code-search/sidebar-search';
import { MenuItem } from '../ui/popover';
import { CollapseAllIcon, ExpandAllIcon } from '../ui/icon';
import { useRestoredScroll, useViewState } from '../../lib/view-state';

interface TreeSidebarProps {
  paths: string[];
  /** Files and folders `.diffityignore` hides from diffs, shown dimmed. */
  diffIgnored?: Set<string>;
  activeFile: string | null;
  commentCountsByFile: Map<string, number>;
  onFileClick: (path: string) => void;
  onDirClick: (path: string) => void;
  onOpenSearchResult: (target: SearchTarget) => void;
}

export function TreeSidebar(props: TreeSidebarProps) {
  const {
    paths,
    diffIgnored,
    activeFile,
    commentCountsByFile,
    onFileClick,
    onDirClick,
    onOpenSearchResult,
  } = props;

  const [search, setSearch] = useViewState('tree:filter', '');
  const [expandedDirs, setExpandedDirs] = useViewState<Set<string> | null>('tree:expandedDirs', null);
  const [commentedFilesOnly, setCommentedFilesOnly] = useViewState('tree:commentedOnly', false);
  const listRef = useRef<HTMLDivElement>(null);
  useRestoredScroll(listRef, 'tree:sidebarScroll');

  const tree = useMemo(() => {
    return sortTree(collapseSingleChildDirs(buildFileTreeFromPaths(paths)));
  }, [paths]);

  const allDirPaths = useMemo(() => collectAllDirPaths(tree), [tree]);

  const commentedPaths = useMemo(
    () => new Set(commentCountsByFile.keys()),
    [commentCountsByFile],
  );

  const commentedFileCount = commentCountsByFile.size;

  const effectiveCommentedOnly = commentedFilesOnly && commentedFileCount > 0;

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
  }, [activeFile, allDirPaths, setExpandedDirs]);

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

  const handleExpandDir = useCallback((path: string) => {
    setExpandedDirs(prev => {
      const next = new Set(prev ?? []);
      next.add(path);
      return next;
    });
    onDirClick(path);
  }, [onDirClick, setExpandedDirs]);

  const handleCollapseDir = useCallback((path: string) => {
    setExpandedDirs(prev => {
      const next = new Set(prev ?? []);
      next.delete(path);
      return next;
    });
  }, [setExpandedDirs]);

  const handleExpandOnly = useCallback((path: string) => {
    const parts = path.split('/');
    const next = new Set<string>();
    for (let i = 1; i <= parts.length; i++) {
      next.add(parts.slice(0, i).join('/'));
    }
    setExpandedDirs(next);
  }, [setExpandedDirs]);

  const emptyReviewedFiles = useMemo(() => new Set<string>(), []);

  return (
    <SidebarFrame view="tree">
      <SidebarSearch
        view="tree"
        filter={search}
        onFilterChange={setSearch}
        commentedToggle={{ active: effectiveCommentedOnly, count: commentedFileCount, onToggle: () => setCommentedFilesOnly((prev) => !prev) }}
        onOpenResult={onOpenSearchResult}
        menu={(close) => (
          <>
            <MenuItem
              icon={<ExpandAllIcon size="sm" />}
              label="Expand all folders"
              disabled={allExpanded}
              onSelect={() => { setExpandedDirs(new Set(allDirPaths)); close(); }}
            />
            <MenuItem
              icon={<CollapseAllIcon size="sm" />}
              label="Collapse all folders"
              onSelect={() => { setExpandedDirs(new Set()); close(); }}
            />
          </>
        )}
      >
      <SidebarSummary>
        {paths.length} file{paths.length === 1 ? '' : 's'}
      </SidebarSummary>
      <div ref={listRef} className="flex-1 overflow-y-auto px-2 pb-3">
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
              dimmedFiles={diffIgnored}
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
      </SidebarSearch>
    </SidebarFrame>
  );
}
