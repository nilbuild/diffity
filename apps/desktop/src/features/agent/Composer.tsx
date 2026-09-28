import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useSelection } from '@/features/workspace/selection';
import { cn } from '@/lib/cn';
import { REVIEW_FOCUSES } from './agents';
import { useAgentStore } from './agent-store';
import { IconChevronDown, IconPlus, IconSend, IconStop } from './icons';
import { Button, IconButton, Kbd, MenuItem, Popover } from './primitives';
import { ContextChipView, chipLabel } from './TimelineRows';

export interface ComposerProps {
  disabled: boolean;
  disabledReason: string | null;
  streaming: boolean;
  modeHint: string | null;
  onSend: (text: string) => void;
  onStop: () => void;
  onReview: (focus: string) => void;
  onResolveAll: () => void;
  onSummarize: () => void;
}

function ReviewButton(props: { disabled: boolean; onReview: (focus: string) => void }) {
  const { disabled, onReview } = props;
  const [open, setOpen] = useState(false);
  const trigger = (
    <div className="flex">
      <Button size="xs" disabled={disabled} className="rounded-r-none" onClick={() => onReview('all')}>
        Review
      </Button>
      <Button
        size="xs"
        disabled={disabled}
        className="-ml-px rounded-l-none px-1"
        aria-label="Review focus"
        onClick={() => setOpen((value) => !value)}
      >
        <IconChevronDown size={11} />
      </Button>
    </div>
  );
  return (
    <Popover open={open} onOpenChange={setOpen} trigger={trigger} side="top" className="w-[180px]">
      <div className="px-2 pt-1 pb-1.5 text-[10.5px] font-medium tracking-wide text-fg-subtle uppercase">Focus</div>
      {REVIEW_FOCUSES.map((focus) => (
        <MenuItem
          key={focus.value}
          onSelect={() => {
            setOpen(false);
            onReview(focus.value);
          }}
        >
          {focus.label}
        </MenuItem>
      ))}
    </Popover>
  );
}

export function Composer(props: ComposerProps) {
  const { disabled, disabledReason, streaming, modeHint, onSend, onStop, onReview, onResolveAll, onSummarize } = props;
  const [text, setText] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const attached = useAgentStore((state) => state.attached);
  const attach = useAgentStore((state) => state.attach);
  const detach = useAgentStore((state) => state.detach);
  const focusToken = useAgentStore((state) => state.composerFocusToken);
  const selection = useSelection((state) => state.selection);

  const selectionAttached =
    selection !== null &&
    attached.some(
      (chip) =>
        chip.filePath === selection.filePath &&
        chip.startLine === selection.startLine &&
        chip.endLine === selection.endLine &&
        chip.side === selection.side,
    );

  useEffect(() => {
    if (focusToken === 0) {
      return;
    }
    textareaRef.current?.focus();
  }, [focusToken]);

  useLayoutEffect(() => {
    const element = textareaRef.current;
    if (!element) {
      return;
    }
    element.style.height = 'auto';
    element.style.height = `${Math.min(element.scrollHeight, 200)}px`;
  }, [text]);

  const canSend = !disabled && !streaming && (text.trim().length > 0 || attached.length > 0);

  const submit = () => {
    if (!canSend) {
      return;
    }
    onSend(text.trim());
    setText('');
  };

  return (
    <div className="shrink-0 border-t border-border p-2">
      <div className="mb-1.5 flex flex-wrap items-center gap-1">
        <ReviewButton disabled={disabled || streaming} onReview={onReview} />
        <Button size="xs" disabled={disabled || streaming} onClick={onResolveAll}>
          Resolve all
        </Button>
        <Button size="xs" disabled={disabled || streaming} onClick={onSummarize}>
          Summarize changes
        </Button>
      </div>
      <div
        className={cn(
          'rounded-lg border border-border bg-bg-elevated focus-within:border-accent focus-within:ring-2 focus-within:ring-ring',
          disabled && 'opacity-70',
        )}
      >
        {(attached.length > 0 || (selection && !selectionAttached)) && (
          <div className="flex flex-wrap gap-1 px-2 pt-2">
            {attached.map((chip, index) => (
              <ContextChipView key={`${chip.filePath}-${index}`} chip={chip} onRemove={() => detach(index)} />
            ))}
            {selection && !selectionAttached && (
              <button
                type="button"
                onClick={() => attach(selection)}
                title="Attach current selection (⌘L)"
                className="inline-flex items-center gap-1 rounded-md border border-dashed border-border-strong px-1.5 py-0.5 font-mono text-[11px] text-fg-subtle hover:border-accent hover:text-accent"
              >
                <IconPlus size={10} />
                {chipLabel(selection)}
              </button>
            )}
          </div>
        )}
        <textarea
          ref={textareaRef}
          value={text}
          rows={2}
          disabled={disabled}
          placeholder={disabledReason ?? 'Ask about these changes…'}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) {
              return;
            }
            event.preventDefault();
            submit();
          }}
          className="selectable block max-h-[200px] w-full resize-none bg-transparent px-2.5 py-2 text-[13px] outline-none placeholder:text-fg-subtle"
        />
        <div className="flex items-center gap-2 px-2 pb-1.5">
          <span className="min-w-0 flex-1 truncate text-[10.5px] text-fg-subtle">
            {modeHint ?? (
              <>
                <Kbd>↵</Kbd> send · <Kbd>⇧↵</Kbd> newline
              </>
            )}
          </span>
          {streaming ? (
            <Button size="xs" variant="danger" onClick={onStop}>
              <IconStop size={10} />
              Stop
            </Button>
          ) : (
            <IconButton
              label="Send (Enter)"
              disabled={!canSend}
              onClick={submit}
              className={cn('h-6 w-6', canSend && 'bg-accent text-accent-fg hover:bg-accent-hover hover:text-accent-fg')}
            >
              <IconSend size={12} />
            </IconButton>
          )}
        </div>
      </div>
    </div>
  );
}
