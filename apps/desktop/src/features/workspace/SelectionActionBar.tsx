import { useEffect } from 'react';
import { Button } from '@/components/ui/Button';
import { Kbd } from '@/components/ui/Kbd';
import { CommentIcon, LightbulbIcon, SparklesIcon, UndoIcon, XIcon } from '@/components/ui/icon';
import { IconButton } from '@/components/ui/IconButton';
import { modKey } from '@/lib/platform';
import type { ContextChip } from '@/lib/types';
import { agentBus } from './agent-bus';
import { useSelection } from './selection';

export interface SelectionActionBarProps {
  chip: ContextChip | null;
  onComment: () => void;
  onClear: () => void;
  onRevertHunk?: () => void;
  hidden?: boolean;
}

/** Floating bar shown while lines are selected; mirrors the selection into the shared `useSelection` store. */
export function SelectionActionBar(props: SelectionActionBarProps) {
  const { chip, onComment, onClear, onRevertHunk, hidden } = props;
  const setSelection = useSelection((s) => s.setSelection);

  useEffect(() => {
    setSelection(chip);
  }, [chip, setSelection]);

  useEffect(() => () => setSelection(null), [setSelection]);

  if (!chip || hidden) {
    return null;
  }

  const lines =
    chip.startLine === chip.endLine ? `line ${chip.startLine}` : `lines ${chip.startLine}–${chip.endLine}`;

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-4 z-20 flex justify-center">
      <div className="pointer-events-auto flex items-center gap-1 rounded-lg border border-border-strong bg-raised p-1">
        <span className="max-w-[260px] truncate px-2 font-mono text-2xs text-fg-muted">
          {chip.filePath.split('/').pop()} · {lines}
        </span>
        <div className="h-4 w-px bg-border" />
        <Button variant="ghost" onClick={onComment}>
          <CommentIcon size={14} />
          Comment
        </Button>
        <Button variant="ghost" onClick={() => agentBus.askAboutSelection(chip)}>
          <SparklesIcon size={14} />
          Ask AI
          <Kbd className="ml-0.5">{modKey}L</Kbd>
        </Button>
        <Button variant="ghost" onClick={() => agentBus.runAction({ kind: 'explain', path: chip.filePath }, [chip])}>
          <LightbulbIcon size={14} />
          Explain
        </Button>
        {onRevertHunk && (
          <Button variant="ghost" onClick={onRevertHunk}>
            <UndoIcon size={14} />
            Revert hunk
          </Button>
        )}
        <IconButton label="Clear selection" shortcut="Esc" tooltipSide="top" onClick={onClear}>
          <XIcon size={14} />
        </IconButton>
      </div>
    </div>
  );
}
