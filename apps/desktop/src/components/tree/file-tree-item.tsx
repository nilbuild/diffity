import type { TreeNode } from '../../lib/file-tree';
import { cn } from '../../lib/cn';
import { ChevronIcon } from '../icons/chevron-icon';
import { FolderIcon } from '../icons/folder-icon';
import { FileIcon } from '../icons/file-icon';

interface FileTreeItemProps {
  node: TreeNode;
  depth: number;
  activeFile: string | null;
  reviewedFiles: Set<string>;
  commentCountsByFile: Map<string, number>;
  expandedDirs: Set<string>;
  onToggleDir: (path: string) => void;
  onCollapseDir?: (path: string) => void;
  onExpandOnly?: (path: string) => void;
  onFileClick: (path: string) => void;
}

const INDENT = 12;
const BASE_PADDING = 8;
const CHEVRON = 16;

const rowClass = 'relative flex items-center gap-1.5 w-full h-7 pr-2 rounded-md text-left text-[13px] cursor-pointer';

export function statusLetter(status: string): { letter: string; className: string; label: string } {
  switch (status) {
    case 'added':
      return { letter: 'A', className: 'text-added', label: 'Added' };
    case 'deleted':
      return { letter: 'D', className: 'text-deleted', label: 'Deleted' };
    case 'renamed':
      return { letter: 'R', className: 'text-renamed', label: 'Renamed' };
    case 'copied':
      return { letter: 'C', className: 'text-renamed', label: 'Copied' };
    default:
      return { letter: 'M', className: 'text-modified', label: 'Modified' };
  }
}

export function CommentCount(props: { count: number }) {
  const { count } = props;

  if (count <= 0) {
    return null;
  }
  return (
    <span
      className="shrink-0 min-w-4 h-4 px-1 rounded-full bg-accent/15 text-accent text-[10px] font-semibold leading-4 text-center tabular-nums"
      title={`${count} open comment thread${count === 1 ? '' : 's'}`}
    >
      {count}
    </span>
  );
}

export function StatusLetter(props: { status: string }) {
  const { status } = props;
  const info = statusLetter(status);

  return (
    <span className={cn('shrink-0 w-3 text-center font-mono text-[11px] font-semibold', info.className)} title={info.label}>
      {info.letter}
    </span>
  );
}

function IndentGuides(props: { depth: number }) {
  const { depth } = props;

  if (depth === 0) {
    return null;
  }
  return (
    <>
      {Array.from({ length: depth }, (_, level) => (
        <span
          key={level}
          aria-hidden
          className="absolute top-0 bottom-0 w-px bg-border"
          style={{ left: BASE_PADDING + level * INDENT + CHEVRON / 2 - 0.5 }}
        />
      ))}
    </>
  );
}

export function FileTreeItem(props: FileTreeItemProps) {
  const {
    node,
    depth,
    activeFile,
    reviewedFiles,
    commentCountsByFile,
    expandedDirs,
    onToggleDir,
    onCollapseDir,
    onExpandOnly,
    onFileClick,
  } = props;
  const paddingLeft = BASE_PADDING + depth * INDENT;

  if (node.type === 'dir') {
    const isExpanded = expandedDirs.has(node.path);

    const handleContextMenu = (event: React.MouseEvent) => {
      if (!onExpandOnly) {
        return;
      }
      event.preventDefault();
      onExpandOnly(node.path);
      onToggleDir(node.path);
    };

    const handleChevronClick = (event: React.MouseEvent) => {
      event.stopPropagation();
      if (onCollapseDir && isExpanded) {
        onCollapseDir(node.path);
        return;
      }
      onToggleDir(node.path);
    };

    return (
      <>
        <button
          className={cn(rowClass, 'hover:bg-hover')}
          style={{ paddingLeft }}
          onClick={() => onToggleDir(node.path)}
          onContextMenu={handleContextMenu}
          title={node.path}
        >
          <IndentGuides depth={depth} />
          <span onClick={handleChevronClick} className="flex items-center justify-center w-4 h-4 shrink-0 rounded hover:bg-hover">
            <ChevronIcon expanded={isExpanded} />
          </span>
          <FolderIcon open={isExpanded} />
          <span className="truncate text-text">{node.name}</span>
        </button>
        {isExpanded && node.children.map((child) => (
          <FileTreeItem
            key={child.path}
            node={child}
            depth={depth + 1}
            activeFile={activeFile}
            reviewedFiles={reviewedFiles}
            commentCountsByFile={commentCountsByFile}
            expandedDirs={expandedDirs}
            onToggleDir={onToggleDir}
            onCollapseDir={onCollapseDir}
            onExpandOnly={onExpandOnly}
            onFileClick={onFileClick}
          />
        ))}
      </>
    );
  }

  const isActive = activeFile === node.path;
  const isReviewed = reviewedFiles.has(node.path);
  const threadCount = commentCountsByFile.get(node.path) ?? 0;

  return (
    <button
      className={cn(rowClass, isActive ? 'bg-selected' : 'hover:bg-hover')}
      style={{ paddingLeft: paddingLeft + CHEVRON + 6 }}
      onClick={() => onFileClick(node.path)}
      title={node.path}
      onContextMenu={(event) => {
        if (!onExpandOnly) {
          return;
        }
        event.preventDefault();
        const parts = node.path.split('/');
        onExpandOnly(parts.length > 1 ? parts.slice(0, -1).join('/') : '');
        onFileClick(node.path);
      }}
    >
      <IndentGuides depth={depth} />
      <FileIcon className={cn('w-3.5 h-3.5 shrink-0', isActive ? 'text-accent' : 'text-text-muted')} />
      <span className={cn('flex-1 min-w-0 truncate', isActive ? 'text-text font-medium' : 'text-text', isReviewed && 'text-text-muted line-through decoration-text-muted/60')}>
        {node.name}
      </span>
      <CommentCount count={threadCount} />
      {isReviewed && <span className="text-added text-[11px] shrink-0" title="Viewed">&#10003;</span>}
      {node.file && <StatusLetter status={node.file.status} />}
    </button>
  );
}
