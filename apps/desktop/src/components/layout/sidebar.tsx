import { useEffect, useMemo, useRef, useState } from 'react';
import type { DiffFile, ParsedDiff } from '@diffity/parser';
import { DiffStats } from '../diff/diff-stats';
import { FileTree } from '../tree/file-tree';
import type { FileTreeHandle } from '../tree/file-tree';
import { SidebarIcon } from '../icons/sidebar-icon';
import { ListIcon } from '../icons/list-icon';
import { TreeIcon } from '../icons/tree-icon';
import { CommentedOnlyToggle, SidebarFilter, SidebarFrame, SidebarHeader, SidebarIconButton } from './sidebar-frame';
import { CollapseAllIcon } from '../icons/collapse-all-icon';
import { ExpandAllIcon } from '../icons/expand-all-icon';

interface SidebarProps {
  files: DiffFile[];
  activeFile: string | null;
  reviewedFiles: Set<string>;
  commentCountsByFile: Map<string, number>;
  onFileClick: (path: string) => void;
  onCommentedFileClick: (path: string) => void;
  stats?: ParsedDiff['stats'];
}

const FLAT_KEY = 'diffity-sidebar-flat';

function readFlat() {
  try {
    return localStorage.getItem(FLAT_KEY) === '1';
  } catch {
    return false;
  }
}

export function Sidebar(props: SidebarProps) {
  const {
    files,
    activeFile,
    reviewedFiles,
    commentCountsByFile,
    onFileClick,
    onCommentedFileClick,
    stats,
  } = props;
  const fileTreeRef = useRef<FileTreeHandle>(null);
  const [search, setSearch] = useState('');
  const [collapsed, setCollapsed] = useState(false);
  const [commentedFilesOnly, setCommentedFilesOnly] = useState(false);
  const [allExpanded, setAllExpanded] = useState(true);
  const [flat, setFlatState] = useState(readFlat);

  const setFlat = (value: boolean) => {
    setFlatState(value);
    try {
      localStorage.setItem(FLAT_KEY, value ? '1' : '0');
    } catch {
      return;
    }
  };

  const commentedFileCount = commentCountsByFile.size;
  const countLabel = useMemo(() => {
    if (commentedFilesOnly) {
      return `${commentedFileCount} of ${files.length} files`;
    }
    if (reviewedFiles.size > 0) {
      return `${reviewedFiles.size} of ${files.length} viewed`;
    }
    return `${files.length} file${files.length === 1 ? '' : 's'}`;
  }, [commentedFilesOnly, commentedFileCount, files.length, reviewedFiles.size]);

  useEffect(() => {
    if (commentedFileCount === 0 && commentedFilesOnly) {
      setCommentedFilesOnly(false);
    }
  }, [commentedFileCount, commentedFilesOnly]);

  const handleTreeFileClick = (path: string) => {
    if (commentedFilesOnly && commentCountsByFile.has(path)) {
      onCommentedFileClick(path);
      return;
    }
    onFileClick(path);
  };

  return (
    <SidebarFrame collapsed={collapsed} onExpand={() => setCollapsed(false)}>
      <SidebarHeader
        title={
          <>
            <span className="truncate">{countLabel}</span>
            {stats && <DiffStats additions={stats.totalAdditions} deletions={stats.totalDeletions} />}
          </>
        }
        actions={
          <>
            <SidebarIconButton
              title={flat ? 'Show as tree' : 'Show as flat list'}
              onClick={() => setFlat(!flat)}
            >
              {flat ? <TreeIcon className="w-3.5 h-3.5" /> : <ListIcon className="w-3.5 h-3.5" />}
            </SidebarIconButton>
            {!flat && (
              <SidebarIconButton
                title={allExpanded ? 'Collapse all' : 'Expand all'}
                onClick={() => {
                  if (allExpanded) {
                    fileTreeRef.current?.collapseAll();
                    return;
                  }
                  fileTreeRef.current?.expandAll();
                }}
              >
                {allExpanded ? <CollapseAllIcon className="w-3.5 h-3.5" /> : <ExpandAllIcon className="w-3.5 h-3.5" />}
              </SidebarIconButton>
            )}
            <SidebarIconButton title="Hide sidebar" onClick={() => setCollapsed(true)}>
              <SidebarIcon className="w-3.5 h-3.5" />
            </SidebarIconButton>
          </>
        }
      />
      <SidebarFilter
        value={search}
        onChange={setSearch}
        placeholder="Filter files"
        trailing={commentedFileCount > 0 && (
          <CommentedOnlyToggle
            active={commentedFilesOnly}
            count={commentedFileCount}
            onToggle={() => setCommentedFilesOnly((prev) => !prev)}
          />
        )}
      />
      <FileTree
        ref={fileTreeRef}
        files={files}
        search={search}
        activeFile={activeFile}
        reviewedFiles={reviewedFiles}
        commentCountsByFile={commentCountsByFile}
        commentedFilesOnly={commentedFilesOnly}
        flat={flat}
        onFileClick={handleTreeFileClick}
        onExpandedStateChange={setAllExpanded}
      />
    </SidebarFrame>
  );
}
