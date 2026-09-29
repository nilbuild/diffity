import { useCallback, useRef, useState, type ReactNode } from 'react';
import { Check, ChevronsDownUp, ChevronsUpDown, Columns2, EyeOff, Rows3, SlidersHorizontal } from 'lucide-react';
import { useDismiss } from '../../hooks/use-dismiss';
import { cn } from '../../lib/cn';
import { menuItemClass } from '../layout/options-menu';
import { sectionLabel } from '../ui/button-styles';
import type { ViewMode } from '../../lib/diff-utils';


interface ViewOptionsProps {
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  hideWhitespace: boolean;
  onHideWhitespaceChange: (hide: boolean) => void;
  onExpandAll?: () => void;
  onCollapseAll?: () => void;
}

function Item(props: { icon: ReactNode; label: string; checked?: boolean; hint?: string; onClick: () => void }) {
  const { icon, label, checked, hint, onClick } = props;

  return (
    <button className={menuItemClass} onClick={onClick}>
      {icon}
      <span className="flex-1">{label}</span>
      {hint && <span className="text-xs text-text-muted">{hint}</span>}
      {checked !== undefined && <Check size={14} strokeWidth={2} className={cn('text-text-secondary', !checked && 'invisible')} />}
    </button>
  );
}

export function ViewOptions(props: ViewOptionsProps) {
  const { viewMode, onViewModeChange, hideWhitespace, onHideWhitespaceChange, onExpandAll, onCollapseAll } = props;
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useDismiss(ref, open, close);
  const changed = hideWhitespace;

  const pick = (action: () => void) => () => {
    action();
    close();
  };

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        title="View options: layout, whitespace, expand or collapse files"
        aria-label="View options"
        className={cn(
          'relative w-7 h-7 inline-flex items-center justify-center rounded-md transition-colors cursor-pointer',
          open ? 'bg-active text-text' : 'text-text-secondary hover:text-text hover:bg-hover',
        )}
      >
        <SlidersHorizontal size={15} strokeWidth={1.75} />
        {changed && <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-text-secondary" />}
      </button>
      {open && (
        <div className="absolute left-0 top-full mt-1.5 w-56 p-1 bg-overlay rounded-lg ring-1 ring-overlay-border z-50">
          <div className={sectionLabel}>Layout</div>
          <Item icon={<Rows3 size={15} strokeWidth={1.75} />} label="Unified" checked={viewMode === 'unified'} onClick={pick(() => onViewModeChange('unified'))} />
          <Item icon={<Columns2 size={15} strokeWidth={1.75} />} label="Split" checked={viewMode === 'split'} onClick={pick(() => onViewModeChange('split'))} />
          <div className="border-t border-overlay-border my-1 -mx-1" />
          <Item
            icon={<EyeOff size={15} strokeWidth={1.75} />}
            label="Hide whitespace"
            checked={hideWhitespace}
            onClick={pick(() => onHideWhitespaceChange(!hideWhitespace))}
          />
          {(onExpandAll || onCollapseAll) && <div className="border-t border-overlay-border my-1 -mx-1" />}
          {onExpandAll && <Item icon={<ChevronsUpDown size={15} strokeWidth={1.75} />} label="Expand all files" onClick={pick(onExpandAll)} />}
          {onCollapseAll && <Item icon={<ChevronsDownUp size={15} strokeWidth={1.75} />} label="Collapse all files" onClick={pick(onCollapseAll)} />}
        </div>
      )}
    </div>
  );
}
