import { useEffect, useMemo, useState, useCallback, useRef, useImperativeHandle, forwardRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import type { DiffFile } from '@diffity/parser';
import {
  buildFileTree,
  collapseSingleChildDirs,
  sortTree,
  filterTree,
  filterTreeToPaths,
  collectAllDirPaths,
  type TreeNode,
} from '../../lib/file-tree';
import { CommentCount, FileTreeRow, StatusLetter, TreeItemMenu } from './file-tree-item';
import { getFilePath } from '../../lib/diff-utils';
import { cn } from '../../lib/cn';
import { readViewState, useRestoredScroll, useViewState } from '../../lib/view-state';

interface FileTreeProps {
  files: DiffFile[];
  search: string;
  activeFile: string | null;
  reviewedFiles: Set<string>;
  commentCountsByFile: Map<string, number>;
  commentedFilesOnly: boolean;
  flat?: boolean;
  stateKey: string;
  onFileClick: (path: string) => void;
  onExpandedStateChange?: (allExpanded: boolean) => void;
}

const ROW_HEIGHT = 28;

function visibleRows(nodes: TreeNode[], expanded: Set<string>, depth = 0, out: { node: TreeNode; depth: number }[] = []) {
  for (const node of nodes) {
    out.push({ node, depth });
    if (node.type === 'dir' && expanded.has(node.path)) {
      visibleRows(node.children, expanded, depth + 1, out);
    }
  }
  return out;
}

export interface FileTreeHandle {
  expandAll: () => void;
  collapseAll: () => void;
}

export const FileTree = forwardRef<FileTreeHandle, FileTreeProps>(function FileTree(props, ref) {
  const {
    files,
    search,
    activeFile,
    reviewedFiles,
    commentCountsByFile,
    commentedFilesOnly,
    flat,
    stateKey,
    onFileClick,
    onExpandedStateChange,
  } = props;

  const tree = useMemo(() => {
    return sortTree(collapseSingleChildDirs(buildFileTree(files)));
  }, [files]);

  const allDirPaths = useMemo(() => collectAllDirPaths(tree), [tree]);
  const [collapsedDirs, setCollapsedDirs] = useViewState<Set<string>>(`${stateKey}:collapsedDirs`, () => new Set());
  const expandedDirs = useMemo(() => new Set(allDirPaths.filter((path) => !collapsedDirs.has(path))), [allDirPaths, collapsedDirs]);

  const commentedPaths = useMemo(
    () => new Set(commentCountsByFile.keys()),
    [commentCountsByFile],
  );

  const baseTree = useMemo(() => {
    if (!commentedFilesOnly) {
      return tree;
    }
    return filterTreeToPaths(tree, commentedPaths);
  }, [tree, commentedFilesOnly, commentedPaths]);

  const displayTree = useMemo(() => {
    if (!search) {
      return baseTree;
    }
    return filterTree(baseTree, search);
  }, [baseTree, search]);

  const effectiveExpandedDirs = useMemo(() => {
    if (search || commentedFilesOnly) {
      return new Set(collectAllDirPaths(displayTree));
    }
    return expandedDirs;
  }, [search, commentedFilesOnly, displayTree, expandedDirs]);

  useImperativeHandle(ref, () => ({
    expandAll: () => setCollapsedDirs(new Set()),
    collapseAll: () => setCollapsedDirs(new Set(allDirPaths)),
  }), [allDirPaths, setCollapsedDirs]);

  useEffect(() => {
    if (!onExpandedStateChange || allDirPaths.length === 0) {
      return;
    }
    onExpandedStateChange(expandedDirs.size >= allDirPaths.length);
  }, [expandedDirs, allDirPaths, onExpandedStateChange]);

  const handleToggleDir = useCallback((path: string) => {
    setCollapsedDirs(prev => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  }, [setCollapsedDirs]);

  const [flatMenu, setFlatMenu] = useState<{ path: string; binary: boolean; at: { x: number; y: number } } | null>(null);

  const flatFiles = useMemo(() => {
    if (!flat) {
      return [];
    }
    const lower = search.toLowerCase();
    return files
      .map((file) => ({ file, path: getFilePath(file) }))
      .filter((entry) => !commentedFilesOnly || commentedPaths.has(entry.path))
      .filter((entry) => !lower || entry.path.toLowerCase().includes(lower));
  }, [flat, files, search, commentedFilesOnly, commentedPaths]);

  const isEmpty = flat ? flatFiles.length === 0 : displayTree.length === 0;

  const renderEmpty = () => (
    <div className="px-4 py-6 text-center text-xs text-text-muted">
      {search
        ? 'No matching files'
        : commentedFilesOnly
          ? 'No files with open comments'
          : 'No changed files'}
    </div>
  );

  const treeRows = useMemo(
    () => (flat ? [] : visibleRows(displayTree, effectiveExpandedDirs)),
    [flat, displayTree, effectiveExpandedDirs],
  );
  const rowCount = flat ? flatFiles.length : treeRows.length;
  const scrollRef = useRef<HTMLDivElement>(null);
  const scrollKey = `${stateKey}:scroll`;
  const virtualizer = useVirtualizer({
    initialOffset: () => readViewState<number>(scrollKey, 0),
    count: rowCount,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 12,
  });

  const activeIndex = useMemo(() => {
    if (!activeFile) {
      return -1;
    }
    if (flat) {
      return flatFiles.findIndex((entry) => entry.path === activeFile);
    }
    return treeRows.findIndex((row) => row.node.path === activeFile);
  }, [activeFile, flat, flatFiles, treeRows]);

  useRestoredScroll(scrollRef, scrollKey);

  useEffect(() => {
    if (activeIndex < 0) {
      return;
    }
    virtualizer.scrollToIndex(activeIndex, { align: 'auto' });
  }, [activeIndex, virtualizer]);

  const renderFlatRow = (index: number) => {
    const entry = flatFiles[index];
    const slash = entry.path.lastIndexOf('/');
    const name = entry.path.slice(slash + 1);
    const dir = slash > 0 ? entry.path.slice(0, slash) : '';
    const isActive = activeFile === entry.path;
    const isReviewed = reviewedFiles.has(entry.path);

    return (
      <button
        className={cn(
          'flex items-center gap-2 w-full h-7 px-2 rounded-md text-left text-[13px] cursor-pointer',
          isActive ? 'bg-selected' : 'hover:bg-hover',
        )}
        onClick={() => onFileClick(entry.path)}
        onContextMenu={(event) => {
          event.preventDefault();
          setFlatMenu({ path: entry.path, binary: entry.file.isBinary, at: { x: event.clientX, y: event.clientY } });
        }}
        title={entry.path}
      >
        <span className={cn('min-w-0 flex-1 flex items-baseline gap-1.5 overflow-hidden', isReviewed && 'opacity-55')}>
          <span className={cn('shrink-0 max-w-full truncate text-text', isActive && 'font-medium', isReviewed && 'line-through decoration-text-muted/60')}>{name}</span>
          {dir && <span className="min-w-0 truncate text-xs text-text-muted" dir="rtl"><bdi>{dir}</bdi></span>}
        </span>
        <CommentCount count={commentCountsByFile.get(entry.path) ?? 0} />
        {isReviewed && <span className="text-added text-[11px] shrink-0" title="Viewed">&#10003;</span>}
        <StatusLetter status={entry.file.status} />
      </button>
    );
  };

  const renderTreeRow = (index: number) => {
    const row = treeRows[index];
    return (
      <FileTreeRow
        node={row.node}
        depth={row.depth}
        active={activeFile === row.node.path}
        reviewed={reviewedFiles.has(row.node.path)}
        threadCount={commentCountsByFile.get(row.node.path) ?? 0}
        expanded={row.node.type === 'dir' && effectiveExpandedDirs.has(row.node.path)}
        onToggleDir={handleToggleDir}
        onFileClick={onFileClick}
      />
    );
  };

  return (
    <div ref={scrollRef} className="flex-1 overflow-y-auto px-2 pb-3 select-none">
      {flatMenu && <TreeItemMenu path={flatMenu.path} isFile binary={flatMenu.binary} position={flatMenu.at} onClose={() => setFlatMenu(null)} />}
      {isEmpty ? renderEmpty() : (
        <div className="relative w-full" style={{ height: virtualizer.getTotalSize() }}>
          {virtualizer.getVirtualItems().map((item) => (
            <div
              key={item.key}
              className="absolute left-0 top-0 w-full"
              style={{ height: ROW_HEIGHT, transform: `translateY(${item.start}px)` }}
            >
              {flat ? renderFlatRow(item.index) : renderTreeRow(item.index)}
            </div>
          ))}
        </div>
      )}
    </div>
  );
});
