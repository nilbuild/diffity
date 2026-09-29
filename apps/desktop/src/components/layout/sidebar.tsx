import { useEffect, useMemo, useRef, useState } from 'react';
import type { DiffFile, ParsedDiff } from '@diffity/parser';
import { DiffStats } from '../diff/diff-stats';
import { FileTree } from '../tree/file-tree';
import type { FileTreeHandle } from '../tree/file-tree';
import { CommentedOnlyToggle, SidebarFilter, SidebarFrame, SidebarMenu, SidebarSummary } from './sidebar-frame';
import { MenuItem, MenuLabel, MenuSeparator } from '../ui/popover';
import { CollapseAllIcon, ExpandAllIcon, ListIcon, TreeIcon } from '../ui/icon';

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
    <SidebarFrame view="diff">
      {files.length === 0 ? (
        <div className="px-4 pt-6 text-center text-xs text-text-muted">Nothing changed here</div>
      ) : (
      <>
      <SidebarFilter
        value={search}
        onChange={setSearch}
        placeholder="Filter files"
        trailing={
          <>
            {commentedFileCount > 0 && (
              <CommentedOnlyToggle
                active={commentedFilesOnly}
                count={commentedFileCount}
                onToggle={() => setCommentedFilesOnly((prev) => !prev)}
              />
            )}
            <SidebarMenu title="File list options">
              {(close) => (
                <>
                  <MenuLabel>Show files as</MenuLabel>
                  <MenuItem icon={<TreeIcon size="sm" />} label="Tree" checked={!flat} onSelect={() => { setFlat(false); close(); }} />
                  <MenuItem icon={<ListIcon size="sm" />} label="List" checked={flat} onSelect={() => { setFlat(true); close(); }} />
                  <MenuSeparator />
                  <MenuItem
                    icon={<ExpandAllIcon size="sm" />}
                    label="Expand all folders"
                    disabled={flat || allExpanded}
                    onSelect={() => { fileTreeRef.current?.expandAll(); close(); }}
                  />
                  <MenuItem
                    icon={<CollapseAllIcon size="sm" />}
                    label="Collapse all folders"
                    disabled={flat}
                    onSelect={() => { fileTreeRef.current?.collapseAll(); close(); }}
                  />
                </>
              )}
            </SidebarMenu>
          </>
        }
      />
      <SidebarSummary>
        <span className="truncate">{countLabel}</span>
        {stats && <DiffStats additions={stats.totalAdditions} deletions={stats.totalDeletions} />}
      </SidebarSummary>
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
      </>
      )}
    </SidebarFrame>
  );
}
