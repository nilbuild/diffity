import { toast } from 'sonner';
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
} from '@/components/ui/icons';
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
      className="mr-1 inline-flex size-5 cursor-default items-center justify-center rounded text-fg-muted hover:bg-bg-muted hover:text-fg"
    >
      <ChevronRightIcon size={14} className={cn('transition-transform', !collapsed && 'rotate-90')} />
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
      icon: <CopyIcon size={13} />,
      onSelect: () => {
        void navigator.clipboard.writeText(path).then(() => toast.success('Path copied'));
      },
    },
    {
      label: 'Open in editor',
      icon: <CodeIcon size={13} />,
      onSelect: () => {
        api.openInEditor(repoPath, path).catch((error: unknown) => toast.error(api.errorMessage(error)));
      },
    },
    { label: 'Comment on file', icon: <CommentIcon size={13} />, onSelect: onCommentFile },
    {
      label: 'Explain with AI',
      icon: <LightbulbIcon size={13} />,
      onSelect: () => agentBus.runAction({ kind: 'explain', path }),
    },
  ];

  if (canRevert && entry.fileDiff) {
    items.push('separator');
    for (const hunk of listHunks(entry.fileDiff)) {
      items.push({
        label: `Revert hunk ${hunk.header}`,
        icon: <UndoIcon size={13} />,
        onSelect: () => void revertHunk(hunk.index, hunk.header),
      });
    }
    items.push({ label: 'Revert file…', icon: <UndoIcon size={13} />, danger: true, onSelect: () => void revertFile() });
  }

  return (
    <div className="flex items-center gap-1 pl-2 font-sans" onMouseDown={(event) => event.stopPropagation()}>
      {isBig && collapsed && <span className="text-[11px] text-fg-subtle">Large diff hidden</span>}
      {openComments > 0 && (
        <span className="inline-flex items-center gap-0.5 rounded-full bg-accent-subtle px-1.5 text-[10px] font-semibold text-accent">
          <CommentIcon size={10} />
          {openComments}
        </span>
      )}
      {previewable && (
        <IconButton size="sm" label={previewing ? 'Hide rich preview' : 'Show rich preview'} active={previewing} onClick={onTogglePreview}>
          <BookIcon size={13} />
        </IconButton>
      )}
      <label
        className={cn(
          'ml-1 inline-flex h-6 cursor-default items-center gap-1.5 rounded-md border px-2 text-[11px] select-none',
          viewed ? 'border-success/40 bg-success/10 text-success' : 'border-border text-fg-muted hover:bg-bg-muted',
        )}
      >
        <input type="checkbox" checked={viewed} onChange={onToggleViewed} className="size-3 accent-[var(--success)]" />
        Viewed
      </label>
      <Menu
        items={items}
        trigger={(trigger) => (
          <IconButton ref={trigger.ref} size="sm" label="File actions" active={trigger.open} onClick={trigger.onClick}>
            <MoreIcon size={14} />
          </IconButton>
        )}
      />
    </div>
  );
}
