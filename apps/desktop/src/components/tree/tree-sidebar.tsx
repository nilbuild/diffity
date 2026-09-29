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
import { CommentedOnlyToggle, SidebarFilter, SidebarFrame, SidebarHeader, SidebarIconButton } from '../layout/sidebar-frame';
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

  return (
    <SidebarFrame collapsed={collapsed} onExpand={() => setCollapsed(false)}>
      <SidebarHeader
        title={
          <span className="truncate">
            {paths.length} file{paths.length === 1 ? '' : 's'}
          </span>
        }
        actions={
          <>
            <SidebarIconButton
              title={allExpanded ? 'Collapse all' : 'Expand all'}
              onClick={() => {
                if (allExpanded) {
                  setExpandedDirs(new Set());
                  return;
                }
                setExpandedDirs(new Set(allDirPaths));
              }}
            >
              {allExpanded ? <CollapseAllIcon className="w-3.5 h-3.5" /> : <ExpandAllIcon className="w-3.5 h-3.5" />}
            </SidebarIconButton>
            <SidebarIconButton title="Hide sidebar" onClick={() => setCollapsed(true)}>
              <SidebarIcon className="w-3.5 h-3.5" />
            </SidebarIconButton>
          </>
        }
      />
      <SidebarFilter
        ref={ref}
        value={search}
        onChange={setSearch}
        placeholder="Filter files"
        shortcut="/"
        trailing={commentedFileCount > 0 && (
          <CommentedOnlyToggle
            active={effectiveCommentedOnly}
            count={commentedFileCount}
            onToggle={() => setCommentedFilesOnly((prev) => !prev)}
          />
        )}
      />
      <div className="flex-1 overflow-y-auto px-2 pb-3">
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
    </SidebarFrame>
  );
});
