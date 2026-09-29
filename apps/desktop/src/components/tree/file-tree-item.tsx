import type { TreeNode } from '../../lib/file-tree';
import { cn } from '../../lib/cn';
import { StatusBadge } from '../ui/status-badge';
import { ChevronIcon } from '../icons/chevron-icon';
import { FolderIcon } from '../icons/folder-icon';
import { FileIcon } from '../icons/file-icon';
import { CommentIcon } from '../icons/comment-icon';

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
  const paddingLeft = depth * 12 + 8;

  if (node.type === 'dir') {
    const isExpanded = expandedDirs.has(node.path);

    const handleRowClick = () => {
      onToggleDir(node.path);
    };

    const handleContextMenu = (e: React.MouseEvent) => {
      if (!onExpandOnly) {
        return;
      }
      e.preventDefault();
      onExpandOnly(node.path);
      onToggleDir(node.path);
    };

    const handleChevronClick = (e: React.MouseEvent) => {
      e.stopPropagation();
      if (onCollapseDir && isExpanded) {
        onCollapseDir(node.path);
      } else {
        onToggleDir(node.path);
      }
    };

    return (
      <>
        <button
          className="flex items-center gap-1.5 w-full py-1 pr-2 text-left text-[13px] hover:bg-hover cursor-pointer"
          style={{ paddingLeft: `${paddingLeft}px` }}
          onClick={handleRowClick}
          onContextMenu={handleContextMenu}
        >
          <span onClick={handleChevronClick} className="relative flex items-center rounded p-0.5 hover:bg-border/70 transition-colors">
            <ChevronIcon expanded={isExpanded} />
          </span>
          <FolderIcon open={isExpanded} />
          <span className="truncate text-text">{node.name}</span>
        </button>
        {isExpanded && node.children.map(child => (
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
  const hasComments = threadCount > 0;

  return (
    <button
      className={cn(
        'flex items-center gap-1.5 w-full py-1 pr-2 text-left text-[13px] cursor-pointer border-l-2',
        isActive
          ? 'bg-active border-l-accent'
          : 'border-l-transparent hover:bg-hover',
        isReviewed && 'opacity-50'
      )}
      style={{ paddingLeft: `${paddingLeft + 15}px` }}
      onClick={() => onFileClick(node.path)}
      onContextMenu={(e) => {
        if (!onExpandOnly) {
          return;
        }
        e.preventDefault();
        const parts = node.path.split('/');
        if (parts.length > 1) {
          onExpandOnly(parts.slice(0, -1).join('/'));
        } else {
          onExpandOnly('');
        }
        onFileClick(node.path);
      }}
    >
      {node.file ? <StatusBadge status={node.file.status} compact /> : <FileIcon className="w-4 h-4 shrink-0 text-text-muted" />}
      <span className={cn('flex-1 min-w-0 truncate text-text', isReviewed && 'line-through')}>
        {node.name}
      </span>
      {hasComments && (
        <span
          className="flex items-center gap-1 text-accent shrink-0"
          title={`${threadCount} open comment thread${threadCount === 1 ? '' : 's'}`}
        >
          <CommentIcon className="w-3 h-3" />
          <span className="text-[10px] font-semibold leading-none">{threadCount}</span>
        </span>
      )}
      {isReviewed && (
        <span className="text-added text-[10px] shrink-0" title="Viewed">&#10003;</span>
      )}
    </button>
  );
}
