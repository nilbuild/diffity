import type { DiffHunk } from '@/lib/diff-parser';
import { cn } from '../../lib/cn';
import { changeActionLabel, changeActionsFor, changeActionTitle, type ChangeAction, type WorkingView } from '../../lib/change-actions';
import { MinusIcon, PlusIcon, UndoIcon } from '../ui/icon';

export interface ChangeActionsConfig {
  view: WorkingView;
  /** Set when the buttons are shown but can't be used (e.g. whitespace is hidden); used as their tooltip. */
  disabledReason: string | null;
  onAction: (action: ChangeAction, hunk: DiffHunk, startIndex: number, endIndex: number) => void;
}

interface ChangeActionsRowProps {
  config: ChangeActionsConfig;
  hunk: DiffHunk;
  startIndex: number;
  endIndex: number;
}

const ICONS: Record<ChangeAction, typeof PlusIcon> = {
  stage: PlusIcon,
  unstage: MinusIcon,
  discard: UndoIcon,
};

/** Hover actions for one change group: [Stage] [Discard] in All / Unstaged, [Unstage] in Staged. */
export function ChangeActionsRow(props: ChangeActionsRowProps) {
  const { config, hunk, startIndex, endIndex } = props;
  const { view, disabledReason, onAction } = config;
  const disabled = !!disabledReason;

  return (
    <tr className="relative z-10">
      <td colSpan={4} className="relative h-0 p-0">
        <div className="absolute right-2 top-0.5 z-10 flex items-center gap-1 opacity-0 group-hover/undo:opacity-100 focus-within:opacity-100 pointer-events-none group-hover/undo:pointer-events-auto">
          {changeActionsFor(view).map((action) => {
            const Icon = ICONS[action];
            return (
              <button
                key={action}
                type="button"
                aria-disabled={disabled}
                onClick={() => {
                  if (disabled) {
                    return;
                  }
                  onAction(action, hunk, startIndex, endIndex);
                }}
                className={cn(
                  'flex items-center gap-1 h-5 px-1.5 text-[11px] font-sans rounded border border-control-border bg-raised text-text-secondary transition-colors whitespace-nowrap',
                  disabled ? 'opacity-50 cursor-default' : 'cursor-pointer hover:text-text hover:bg-control-hover',
                  !disabled && action === 'discard' && 'hover:text-deleted hover:border-deleted/40 hover:bg-raised',
                )}
                title={disabledReason ?? changeActionTitle(action, view)}
              >
                <Icon className="w-3 h-3" />
                {changeActionLabel(action)}
              </button>
            );
          })}
        </div>
      </td>
    </tr>
  );
}
