import { useState, type ReactNode } from 'react';
import { cn } from '../../lib/cn';
import type { ViewMode } from '../../lib/diff-utils';
import { SegmentedToggle } from '../ui/segmented-toggle';
import { buttonIconOutline } from '../ui/button-styles';
import { CollapseAllIcon, CopyIcon, EllipsisIcon, EyeIcon, EyeOffIcon, ExpandAllIcon, SplitViewIcon, TrashIcon, UnifiedViewIcon, WrapIcon, XIcon } from '../ui/icon';
import { MenuItem, MenuSeparator, Popover, useMenu } from '../ui/popover';
import { ConfirmDialog } from '../ui/confirm-dialog';
import { toast } from 'sonner';
import { setWrapLines, useTypography } from '../../lib/typography';

interface DiffBarProps {
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  hideWhitespace: boolean;
  onHideWhitespaceChange: (hide: boolean) => void;
  /** Files `.diffityignore` hides, and whether they are temporarily shown. */
  ignored?: { hiddenCount: number; showing: boolean; onShowingChange: (showing: boolean) => void };
  onExpandAll: () => void;
  onCollapseAll: () => void;
  commentNav?: ReactNode;
  /** Shown first, e.g. where the reader is in the guide. */
  leading?: ReactNode;
  /** Copy / delete-all for the comments in this view, shown in ⋯ when there are any. */
  comments?: { count: number; formatForCopy: () => string; onDeleteAll: () => void };
}

export function hiddenFilesLabel(count: number) {
  return `${count} file${count === 1 ? '' : 's'} hidden by .diffityignore`;
}

function IgnoredFilesChip(props: { hiddenCount: number; showing: boolean; onShowingChange: (showing: boolean) => void }) {
  const { hiddenCount, showing, onShowingChange } = props;

  if (showing) {
    return (
      <button
        onClick={() => onShowingChange(false)}
        className="inline-flex items-center gap-1.5 h-6 pl-2 pr-1.5 rounded-full bg-selected text-xs text-text cursor-pointer hover:bg-fill-hover transition-colors"
        title="Files hidden by .diffityignore are shown for now. Click to hide them again"
      >
        <EyeIcon size="xs" className="text-text-secondary" />
        Ignored files shown
        <XIcon size={10} className="text-text-muted" />
      </button>
    );
  }
  if (hiddenCount === 0) {
    return null;
  }
  return (
    <button
      onClick={() => onShowingChange(true)}
      className="inline-flex items-center gap-1.5 h-6 px-2 rounded-full text-xs text-text-secondary cursor-pointer hover:bg-hover hover:text-text transition-colors"
      title="Matched by .diffityignore or this repo's ignore list in Settings. Click to show them for now"
    >
      <EyeOffIcon size="xs" />
      {hiddenFilesLabel(hiddenCount)}
      <span className="text-accent">Show</span>
    </button>
  );
}

export function DiffBar(props: DiffBarProps) {
  const { viewMode, onViewModeChange, hideWhitespace, onHideWhitespaceChange, ignored, onExpandAll, onCollapseAll, commentNav, leading, comments } = props;
  const menu = useMenu();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const wrapLines = useTypography((state) => state.wrapLines);
  const run = (action: () => void) => () => {
    menu.close();
    action();
  };

  return (
    <div className="@container/diffbar flex items-center gap-2 h-10 shrink-0 px-5 border-b border-border-muted bg-bg">
      {leading}
      {commentNav}
      <span className="flex-1" />
      {ignored && <IgnoredFilesChip {...ignored} />}
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
        labelClassName="@max-[560px]/diffbar:sr-only"
        options={[
          { value: 'unified', label: 'Unified', title: 'Unified: one column (U)', icon: <UnifiedViewIcon size="sm" /> },
          { value: 'split', label: 'Split', title: 'Split: before and after side by side (S)', icon: <SplitViewIcon size="sm" /> },
        ]}
      />
      <button
        ref={menu.anchorRef}
        onClick={menu.toggle}
        title="More diff options: whitespace, line wrapping, expand or collapse files, comments"
        aria-label="More diff options"
        className={cn(buttonIconOutline, menu.open && 'bg-control-hover text-text')}
      >
        <EllipsisIcon size="md" />
      </button>
      <Popover open={menu.open} onClose={menu.close} anchorRef={menu.anchorRef} align="end" width={250}>
        <MenuItem icon={<EyeOffIcon size="sm" />} label="Hide whitespace changes" checked={hideWhitespace} onSelect={run(() => onHideWhitespaceChange(!hideWhitespace))} />
        <MenuItem icon={<WrapIcon size="sm" />} label="Wrap long lines" checked={wrapLines} onSelect={run(() => setWrapLines(!wrapLines))} />
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
