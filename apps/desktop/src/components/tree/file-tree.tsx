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
import { FileTreeItem } from './file-tree-item';

interface FileTreeProps {
  files: DiffFile[];
  search: string;
  activeFile: string | null;
  reviewedFiles: Set<string>;
  commentCountsByFile: Map<string, number>;
  commentedFilesOnly: boolean;
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

  return (
    <div className="flex-1 overflow-y-auto py-1">
      {displayTree.length === 0 ? (
        <div className="px-4 py-6 text-center text-xs text-text-muted">
          {search
            ? 'No matching files'
            : commentedFilesOnly
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
