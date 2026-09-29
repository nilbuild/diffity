import type { ReactNode } from 'react';
import { cn } from '../../lib/cn';
import type { ViewMode } from '../../lib/diff-utils';
import { SegmentedToggle } from '../ui/segmented-toggle';
import { buttonIconOutline } from '../ui/button-styles';
import { CollapseAllIcon, EllipsisIcon, EyeOffIcon, ExpandAllIcon, SplitViewIcon, UnifiedViewIcon } from '../ui/icon';
import { MenuItem, Popover, useMenu } from '../ui/popover';

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
  const { viewMode, onViewModeChange, hideWhitespace, onHideWhitespaceChange, fileCount, viewedCount, onExpandAll, onCollapseAll, commentNav } = props;
  const menu = useMenu();

  return (
    <div className="flex items-center gap-2 h-10 shrink-0 px-5 border-b border-border-muted bg-bg">
      <ViewedProgress viewed={viewedCount} total={fileCount} />
      {commentNav}
      <span className="flex-1" />
      <button
        onClick={() => onHideWhitespaceChange(!hideWhitespace)}
        aria-pressed={hideWhitespace}
        title={hideWhitespace ? 'Whitespace changes are hidden. Click to show them' : 'Hide changes that only touch whitespace'}
        className={cn(
          'inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md text-[13px] transition-colors cursor-pointer',
          hideWhitespace ? 'bg-selected text-text font-medium' : 'text-text-secondary hover:text-text hover:bg-hover',
        )}
      >
        <EyeOffIcon size="sm" />
        Hide whitespace
      </button>
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
        title="More diff options"
        aria-label="More diff options"
        className={cn(buttonIconOutline, menu.open && 'bg-control-hover text-text')}
      >
        <EllipsisIcon size="md" />
      </button>
      <Popover open={menu.open} onClose={menu.close} anchorRef={menu.anchorRef} align="end" width={220}>
        <MenuItem icon={<ExpandAllIcon size="sm" />} label="Expand all files" onSelect={() => { onExpandAll(); menu.close(); }} />
        <MenuItem icon={<CollapseAllIcon size="sm" />} label="Collapse all files" hint="⇧X" onSelect={() => { onCollapseAll(); menu.close(); }} />
      </Popover>
    </div>
  );
}
