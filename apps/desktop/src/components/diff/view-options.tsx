import { useState, type ReactNode } from 'react';
import { cn } from '../../lib/cn';
import type { ViewMode } from '../../lib/diff-utils';
import { SegmentedToggle } from '../ui/segmented-toggle';
import { buttonIconOutline } from '../ui/button-styles';
import { CollapseAllIcon, CopyIcon, EllipsisIcon, EyeOffIcon, ExpandAllIcon, SplitViewIcon, TrashIcon, UnifiedViewIcon, XIcon } from '../ui/icon';
import { MenuItem, MenuSeparator, Popover, useMenu } from '../ui/popover';
import { ConfirmDialog } from '../ui/confirm-dialog';
import { toast } from 'sonner';

interface DiffBarProps {
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  hideWhitespace: boolean;
  onHideWhitespaceChange: (hide: boolean) => void;
  fileCount: number;
  viewedCount: number;
  onExpandAll: () => void;
  onCollapseAll: () => void;
  commentNav?: ReactNode;
  /** Copy / delete-all for the comments in this view, shown in ⋯ when there are any. */
  comments?: { count: number; formatForCopy: () => string; onDeleteAll: () => void };
}

function ViewedProgress(props: { viewed: number; total: number }) {
  const { viewed, total } = props;
  const percent = total === 0 ? 0 : Math.round((viewed / total) * 100);

  return (
    <div className="flex items-center gap-2 min-w-0 text-xs text-text-secondary tabular-nums" title="Mark files as viewed with the checkbox on each file, or press R">
      <span className="relative w-16 h-1.5 rounded-full bg-fill overflow-hidden shrink-0">
        <span className="absolute inset-y-0 left-0 rounded-full bg-added transition-[width] duration-300" style={{ width: `${percent}%` }} />
      </span>
      <span className="truncate">
        {viewed === total && total > 0 ? 'All files viewed' : `${viewed} of ${total} files viewed`}
      </span>
    </div>
  );
}

export function DiffBar(props: DiffBarProps) {
  const { viewMode, onViewModeChange, hideWhitespace, onHideWhitespaceChange, fileCount, viewedCount, onExpandAll, onCollapseAll, commentNav, comments } = props;
  const menu = useMenu();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const run = (action: () => void) => () => {
    menu.close();
    action();
  };

  return (
    <div className="flex items-center gap-2 h-10 shrink-0 px-5 border-b border-border-muted bg-bg">
      <ViewedProgress viewed={viewedCount} total={fileCount} />
      {commentNav}
      <span className="flex-1" />
      {hideWhitespace && (
        <button
          onClick={() => onHideWhitespaceChange(false)}
          className="inline-flex items-center gap-1.5 h-6 pl-2 pr-1.5 rounded-full bg-selected text-xs text-text cursor-pointer hover:bg-fill-hover transition-colors"
          title="Whitespace-only changes are hidden. Click to show them"
        >
          <EyeOffIcon size="xs" className="text-text-secondary" />
          Whitespace hidden
          <XIcon size={10} className="text-text-muted" />
        </button>
      )}
      <SegmentedToggle
        value={viewMode}
        onChange={onViewModeChange}
        options={[
          { value: 'unified', label: 'Unified', title: 'Unified: one column (U)', icon: <UnifiedViewIcon size="sm" /> },
          { value: 'split', label: 'Split', title: 'Split: before and after side by side (S)', icon: <SplitViewIcon size="sm" /> },
        ]}
      />
      <button
        ref={menu.anchorRef}
        onClick={menu.toggle}
        title="More diff options: whitespace, expand or collapse files, comments"
        aria-label="More diff options"
        className={cn(buttonIconOutline, menu.open && 'bg-control-hover text-text')}
      >
        <EllipsisIcon size="md" />
      </button>
      <Popover open={menu.open} onClose={menu.close} anchorRef={menu.anchorRef} align="end" width={250}>
        <MenuItem icon={<EyeOffIcon size="sm" />} label="Hide whitespace changes" checked={hideWhitespace} onSelect={run(() => onHideWhitespaceChange(!hideWhitespace))} />
        <MenuSeparator />
        <MenuItem icon={<ExpandAllIcon size="sm" />} label="Expand all files" onSelect={run(onExpandAll)} />
        <MenuItem icon={<CollapseAllIcon size="sm" />} label="Collapse all files" hint="⇧X" onSelect={run(onCollapseAll)} />
        {comments && comments.count > 0 && (
          <>
            <MenuSeparator />
            <MenuItem icon={<CopyIcon size="sm" />} label="Copy open comments as Markdown" onSelect={run(() => {
              const text = comments.formatForCopy();
              if (!text) {
                toast.info('No open comments to copy');
                return;
              }
              void navigator.clipboard.writeText(text).then(() => toast.success('Copied open comments'));
            })} />
            <MenuItem icon={<TrashIcon size="sm" />} label="Delete all comments…" onSelect={run(() => setConfirmDelete(true))} />
          </>
        )}
      </Popover>
      {confirmDelete && comments && (
        <ConfirmDialog
          title="Delete all comments"
          message="Delete every comment in this view, including resolved ones and drafts? This cannot be undone."
          confirmLabel="Delete all"
          onConfirm={() => {
            comments.onDeleteAll();
            setConfirmDelete(false);
          }}
          onCancel={() => setConfirmDelete(false)}
        />
      )}
    </div>
  );
}
