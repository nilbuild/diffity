import { toast } from 'sonner';
import { CountBadge } from '@/components/ui/Badge';
import { IconButton } from '@/components/ui/IconButton';
import { Menu, type MenuItem } from '@/components/ui/Menu';
import { confirmDialog } from '@/components/ui/ConfirmDialog';
import {
  BookIcon,
  ChevronRightIcon,
  CodeIcon,
  CommentIcon,
  CopyIcon,
  LightbulbIcon,
  MoreIcon,
  UndoIcon,
} from '@/components/ui/icon';
import { hunkToPatch, listHunks } from '@/components/diff-surface';
import * as api from '@/lib/api';
import { cn } from '@/lib/cn';
import { agentBus } from '@/features/workspace/agent-bus';
import type { DiffEntry } from './use-diff';

export function CollapseToggle(props: { collapsed: boolean; onToggle: () => void }) {
  const { collapsed, onToggle } = props;
  return (
    <button
      type="button"
      aria-label={collapsed ? 'Expand file' : 'Collapse file'}
      onClick={onToggle}
      className="mr-1 inline-flex size-6 cursor-default items-center justify-center rounded-md text-fg-muted hover:bg-hover hover:text-fg"
    >
      <ChevronRightIcon size={12} className={cn('transition-transform', !collapsed && 'rotate-90')} />
    </button>
  );
}

export interface FileHeaderActionsProps {
  entry: DiffEntry;
  repoPath: string;
  canRevert: boolean;
  viewed: boolean;
  openComments: number;
  previewable: boolean;
  previewing: boolean;
  isBig: boolean;
  collapsed: boolean;
  onToggleViewed: () => void;
  onTogglePreview: () => void;
  onCommentFile: () => void;
  onReverted: () => void;
}

export function FileHeaderActions(props: FileHeaderActionsProps) {
  const {
    entry,
    repoPath,
    canRevert,
    viewed,
    openComments,
    previewable,
    previewing,
    isBig,
    collapsed,
    onToggleViewed,
    onTogglePreview,
    onCommentFile,
    onReverted,
  } = props;
  const path = entry.summary.path;

  const revertFile = async () => {
    const ok = await confirmDialog({
      title: 'Revert file?',
      message: `Discard all changes to ${path}. This cannot be undone.`,
      confirmLabel: 'Revert file',
      danger: true,
    });
    if (!ok) {
      return;
    }
    try {
      await api.revertFile(repoPath, path);
      toast.success(`Reverted ${path}`);
      onReverted();
    } catch (error) {
      toast.error(api.errorMessage(error));
    }
  };

  const revertHunk = async (index: number, header: string) => {
    const fileDiff = entry.fileDiff;
    if (!fileDiff) {
      return;
    }
    const patch = hunkToPatch(fileDiff, index);
    if (!patch) {
      return;
    }
    const ok = await confirmDialog({
      title: 'Revert hunk?',
      message: `Discard the changes in ${header} of ${path}.`,
      confirmLabel: 'Revert hunk',
      danger: true,
    });
    if (!ok) {
      return;
    }
    try {
      await api.revertHunk(repoPath, patch);
      toast.success('Hunk reverted');
      onReverted();
    } catch (error) {
      toast.error(api.errorMessage(error));
    }
  };

  const items: (MenuItem | 'separator')[] = [
    {
      label: 'Copy path',
      icon: <CopyIcon size={14} />,
      onSelect: () => {
        void navigator.clipboard.writeText(path).then(() => toast.success('Path copied'));
      },
    },
    {
      label: 'Open in editor',
      icon: <CodeIcon size={14} />,
      onSelect: () => {
        api.openInEditor(repoPath, path).catch((error: unknown) => toast.error(api.errorMessage(error)));
      },
    },
    { label: 'Comment on file', icon: <CommentIcon size={14} />, onSelect: onCommentFile },
    {
      label: 'Explain with AI',
      icon: <LightbulbIcon size={14} />,
      onSelect: () => agentBus.runAction({ kind: 'explain', path }),
    },
  ];

  if (canRevert && entry.fileDiff) {
    items.push('separator');
    for (const hunk of listHunks(entry.fileDiff)) {
      items.push({
        label: `Revert hunk ${hunk.header}`,
        icon: <UndoIcon size={14} />,
        onSelect: () => void revertHunk(hunk.index, hunk.header),
      });
    }
    items.push({ label: 'Revert file…', icon: <UndoIcon size={14} />, danger: true, onSelect: () => void revertFile() });
  }

  return (
    <div className="flex items-center gap-1 pl-2 font-sans" onMouseDown={(event) => event.stopPropagation()}>
      {isBig && collapsed && <span className="text-2xs text-fg-subtle">Large diff hidden</span>}
      {openComments > 0 && (
        <CountBadge count={openComments} icon={<CommentIcon size={12} />} title={`${openComments} open comments`} />
      )}
      {previewable && (
        <IconButton size="sm" label={previewing ? 'Hide rich preview' : 'Show rich preview'} active={previewing} onClick={onTogglePreview}>
          <BookIcon size={14} />
        </IconButton>
      )}
      <label
        className={cn(
          'ml-1 inline-flex h-6 cursor-default items-center gap-1.5 rounded-md border px-2 text-xs font-medium select-none',
          viewed ? 'border-success/30 bg-success/10 text-success' : 'border-border bg-raised text-fg-muted hover:border-border-strong hover:text-fg',
        )}
      >
        <input type="checkbox" checked={viewed} onChange={onToggleViewed} className="size-3 accent-[var(--success)]" />
        Viewed
      </label>
      <Menu
        items={items}
        trigger={(trigger) => (
          <IconButton ref={trigger.ref} size="sm" label="File actions" active={trigger.open} onClick={trigger.onClick}>
            <MoreIcon size={16} />
          </IconButton>
        )}
      />
    </div>
  );
}
