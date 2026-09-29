import { useEffect, useMemo, useState, useCallback, useRef, useImperativeHandle, forwardRef } from 'react';
import type { DiffFile } from '@diffity/parser';
import {
  buildFileTree,
  collapseSingleChildDirs,
  sortTree,
  filterTree,
  filterTreeToPaths,
  collectAllDirPaths,
} from '../../lib/file-tree';
import { FileTreeItem, CommentCount, StatusLetter } from './file-tree-item';
import { getFilePath } from '../../lib/diff-utils';
import { cn } from '../../lib/cn';

interface FileTreeProps {
  files: DiffFile[];
  search: string;
  activeFile: string | null;
  reviewedFiles: Set<string>;
  commentCountsByFile: Map<string, number>;
  commentedFilesOnly: boolean;
  flat?: boolean;
  onFileClick: (path: string) => void;
  onExpandedStateChange?: (allExpanded: boolean) => void;
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
    onFileClick,
    onExpandedStateChange,
  } = props;

  const tree = useMemo(() => {
    return sortTree(collapseSingleChildDirs(buildFileTree(files)));
  }, [files]);

  const prevTreeRef = useRef(tree);
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(() => new Set(collectAllDirPaths(tree)));

  if (prevTreeRef.current !== tree) {
    prevTreeRef.current = tree;
    setExpandedDirs(new Set(collectAllDirPaths(tree)));
  }

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

  const allDirPaths = useMemo(() => collectAllDirPaths(tree), [tree]);

  useImperativeHandle(ref, () => ({
    expandAll: () => setExpandedDirs(new Set(allDirPaths)),
    collapseAll: () => setExpandedDirs(new Set()),
  }), [allDirPaths]);

  useEffect(() => {
    if (!onExpandedStateChange || allDirPaths.length === 0) {
      return;
    }
    onExpandedStateChange(expandedDirs.size >= allDirPaths.length);
  }, [expandedDirs, allDirPaths, onExpandedStateChange]);

  const handleToggleDir = useCallback((path: string) => {
    setExpandedDirs(prev => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  }, []);

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
          : 'No files'}
    </div>
  );

  const renderFlat = () => flatFiles.map((entry) => {
    const slash = entry.path.lastIndexOf('/');
    const name = entry.path.slice(slash + 1);
    const dir = slash > 0 ? entry.path.slice(0, slash) : '';
    const isActive = activeFile === entry.path;
    const isReviewed = reviewedFiles.has(entry.path);

    return (
      <button
        key={entry.path}
        className={cn(
          'flex items-center gap-2 w-full h-7 px-2 rounded-md text-left text-[13px] cursor-pointer',
          isActive ? 'bg-selected' : 'hover:bg-hover',
        )}
        onClick={() => onFileClick(entry.path)}
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
  });

  return (
    <div className="flex-1 overflow-y-auto px-2 pb-3">
      {isEmpty ? renderEmpty() : flat ? renderFlat() : (
        displayTree.map(node => (
          <FileTreeItem
            key={node.path}
            node={node}
            depth={0}
            activeFile={activeFile}
            reviewedFiles={reviewedFiles}
            commentCountsByFile={commentCountsByFile}
            expandedDirs={effectiveExpandedDirs}
            onToggleDir={handleToggleDir}
            onFileClick={onFileClick}
          />
        ))
      )}
    </div>
  );
});
