import type { TreeNode } from '../../lib/file-tree';
import { cn } from '../../lib/cn';
import { useState } from 'react';
import { toast } from 'sonner';
import { ChevronIcon, CollapseAllIcon, CopyIcon, EditorIcon, FileIcon, FileTextIcon, FolderIcon } from '../ui/icon';
import { useLocation, useSearchParams } from 'react-router';
import { contentsLabel, copyAbsolutePath, copyFileContents, copyRelativePath } from '../../lib/file-copy';
import { ContextMenu, MenuItem, MenuSeparator } from '../ui/popover';
import { errorMessage, openInEditor } from '../../lib/api';
import { useEditorName } from '../../hooks/use-editor-name';

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
      className="shrink-0 min-w-4 h-4 px-1 rounded-full bg-fill text-text-secondary text-[10px] font-semibold leading-4 text-center tabular-nums"
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

interface TreeItemMenuProps {
  path: string;
  position: { x: number; y: number } | null;
  onClose: () => void;
  onFocusFolder?: () => void;
  isFile?: boolean;
  binary?: boolean;
}

export function TreeItemMenu(props: TreeItemMenuProps) {
  const { path, position, onClose, onFocusFolder, isFile = false, binary = false } = props;
  const editor = useEditorName();
  const [params] = useSearchParams();
  const viewRef = useLocation().pathname.endsWith('/diff') ? params.get('ref') ?? 'work' : 'work';

  const run = (action: () => void) => () => {
    onClose();
    action();
  };

  return (
    <ContextMenu position={position} onClose={onClose}>
      <MenuItem
        icon={<EditorIcon size="sm" />}
        label={`Open in ${editor}`}
        onSelect={run(() => {
          openInEditor(path).catch((error) => toast.error('Could not open the editor', { description: errorMessage(error) }));
        })}
      />
      <MenuSeparator />
      <MenuItem icon={<CopyIcon size="sm" />} label="Copy relative path" hint="⌥⌘C" onSelect={run(() => copyRelativePath(path))} />
      <MenuItem icon={<CopyIcon size="sm" />} label="Copy absolute path" onSelect={run(() => copyAbsolutePath(path))} />
      {isFile && (
        <MenuItem
          icon={<FileTextIcon size="sm" />}
          label={binary ? 'Copy file contents (binary file)' : contentsLabel(viewRef)}
          hint={binary ? undefined : '⇧⌥⌘C'}
          disabled={binary}
          onSelect={run(() => void copyFileContents(path, viewRef))}
        />
      )}
      {onFocusFolder && (
        <>
          <MenuSeparator />
          <MenuItem icon={<CollapseAllIcon size="sm" />} label="Collapse other folders" onSelect={run(onFocusFolder)} />
        </>
      )}
    </ContextMenu>
  );
}

interface FileTreeRowProps {
  node: TreeNode;
  depth: number;
  active: boolean;
  reviewed: boolean;
  threadCount: number;
  expanded: boolean;
  onToggleDir: (path: string) => void;
  onCollapseDir?: (path: string) => void;
  onExpandOnly?: (path: string) => void;
  onFileClick: (path: string) => void;
}

/** One row of the tree (a folder or a file), without its children; the context menu mounts only while open. */
export function FileTreeRow(props: FileTreeRowProps) {
  const { node, depth, active, reviewed, threadCount, expanded, onToggleDir, onCollapseDir, onExpandOnly, onFileClick } = props;
  const paddingLeft = BASE_PADDING + depth * INDENT;
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const openMenu = (event: React.MouseEvent) => {
    event.preventDefault();
    setMenu({ x: event.clientX, y: event.clientY });
  };

  if (node.type === 'dir') {
    const handleChevronClick = (event: React.MouseEvent) => {
      event.stopPropagation();
      if (onCollapseDir && expanded) {
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
          onContextMenu={openMenu}
          title={node.path}
        >
          <IndentGuides depth={depth} />
          <span onClick={handleChevronClick} className="flex items-center justify-center w-4 h-4 shrink-0 rounded hover:bg-hover">
            <ChevronIcon expanded={expanded} />
          </span>
          <FolderIcon open={expanded} />
          <span className="truncate text-text">{node.name}</span>
        </button>
        {menu && (
          <TreeItemMenu
            path={node.path}
            position={menu}
            onClose={() => setMenu(null)}
            onFocusFolder={onExpandOnly ? () => onExpandOnly(node.path) : undefined}
          />
        )}
      </>
    );
  }

  return (
    <>
      <button
        className={cn(rowClass, active ? 'bg-selected' : 'hover:bg-hover')}
        style={{ paddingLeft: paddingLeft + CHEVRON + 6 }}
        onClick={() => onFileClick(node.path)}
        title={node.path}
        onContextMenu={openMenu}
      >
        <IndentGuides depth={depth} />
        <FileIcon className={cn('w-3.5 h-3.5 shrink-0', active ? 'text-text-secondary' : 'text-text-muted')} />
        <span className={cn('flex-1 min-w-0 truncate', active ? 'text-text font-medium' : 'text-text', reviewed && 'text-text-muted line-through decoration-text-muted/60')}>
          {node.name}
        </span>
        <CommentCount count={threadCount} />
        {reviewed && <span className="text-added text-[11px] shrink-0" title="Viewed">&#10003;</span>}
        {node.file && <StatusLetter status={node.file.status} />}
      </button>
      {menu && (
        <TreeItemMenu
          path={node.path}
          isFile
          binary={!!node.file?.isBinary}
          position={menu}
          onClose={() => setMenu(null)}
          onFocusFolder={onExpandOnly ? () => {
            const parts = node.path.split('/');
            onExpandOnly(parts.length > 1 ? parts.slice(0, -1).join('/') : '');
          } : undefined}
        />
      )}
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
  const expanded = node.type === 'dir' && expandedDirs.has(node.path);

  return (
    <>
      <FileTreeRow
        node={node}
        depth={depth}
        active={activeFile === node.path}
        reviewed={reviewedFiles.has(node.path)}
        threadCount={commentCountsByFile.get(node.path) ?? 0}
        expanded={expanded}
        onToggleDir={onToggleDir}
        onCollapseDir={onCollapseDir}
        onExpandOnly={onExpandOnly}
        onFileClick={onFileClick}
      />
      {expanded && node.children.map((child) => (
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
