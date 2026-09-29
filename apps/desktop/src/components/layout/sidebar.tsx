import { useEffect, useMemo, useRef, useState } from 'react';
import type { DiffFile } from '@diffity/parser';
import { FileTree } from '../tree/file-tree';
import type { FileTreeHandle } from '../tree/file-tree';
import { SidebarIcon } from '../icons/sidebar-icon';
import { SearchIcon } from '../icons/search-icon';
import { XIcon } from '../icons/x-icon';
import { CommentIcon } from '../icons/comment-icon';
import { CollapseAllIcon } from '../icons/collapse-all-icon';
import { ExpandAllIcon } from '../icons/expand-all-icon';

interface SidebarProps {
  files: DiffFile[];
  activeFile: string | null;
  reviewedFiles: Set<string>;
  commentCountsByFile: Map<string, number>;
  onFileClick: (path: string) => void;
  onCommentedFileClick: (path: string) => void;
}

export function Sidebar(props: SidebarProps) {
  const {
    files,
    activeFile,
    reviewedFiles,
    commentCountsByFile,
    onFileClick,
    onCommentedFileClick,
  } = props;
  const fileTreeRef = useRef<FileTreeHandle>(null);
  const [search, setSearch] = useState('');
  const [collapsed, setCollapsed] = useState(false);
  const [commentedFilesOnly, setCommentedFilesOnly] = useState(false);
  const [allExpanded, setAllExpanded] = useState(true);

  const commentedFileCount = commentCountsByFile.size;
  const commentedFileCountLabel = commentedFileCount > 99 ? '99+' : String(commentedFileCount);
  const countLabel = useMemo(() => {
    if (commentedFilesOnly) {
      return `${commentedFileCount}/${files.length}`;
    }
    if (reviewedFiles.size > 0) {
      return `${reviewedFiles.size}/${files.length}`;
    }
    return `${files.length}`;
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
            {countLabel}
          </span>
        </span>
        <div className="flex items-center gap-0.5">
          <button
            className="p-1 rounded-md text-text-muted hover:text-text hover:bg-hover cursor-pointer"
            onClick={() => {
              if (allExpanded) {
                fileTreeRef.current?.collapseAll();
              } else {
                fileTreeRef.current?.expandAll();
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
            className="w-full h-8 pl-7 pr-7 border border-border rounded-md bg-bg text-xs outline-none focus:border-accent focus:ring-1 focus:ring-accent/20 placeholder:text-text-muted"
            type="text"
            placeholder="Filter files..."
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
              commentedFilesOnly
                ? 'border-accent bg-accent/8 text-accent'
                : 'border-border bg-bg hover:bg-hover text-text-secondary hover:text-text'
            }`}
            onClick={() => setCommentedFilesOnly((prev) => !prev)}
            title={commentedFilesOnly ? 'Show all files' : 'Show only files with open comments'}
            aria-pressed={commentedFilesOnly}
            aria-label={`${commentedFilesOnly ? 'Show all files' : 'Show only files with open comments'} (${commentedFileCountLabel} files)`}
          >
            <CommentIcon className="w-3.5 h-3.5" />
            <span
              className={`inline-flex items-center justify-center min-w-[16px] h-[16px] px-1 rounded-full text-[9px] font-semibold leading-none tabular-nums ${
                commentedFilesOnly
                  ? 'bg-bg text-accent'
                  : 'bg-bg-tertiary text-text-secondary'
              }`}
            >
              {commentedFileCountLabel}
            </span>
          </button>
        )}
      </div>
      <FileTree
        ref={fileTreeRef}
        files={files}
        search={search}
        activeFile={activeFile}
        reviewedFiles={reviewedFiles}
        commentCountsByFile={commentCountsByFile}
        commentedFilesOnly={commentedFilesOnly}
        onFileClick={handleTreeFileClick}
        onExpandedStateChange={setAllExpanded}
      />
    </aside>
  );
}
