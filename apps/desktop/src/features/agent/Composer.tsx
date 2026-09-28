import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useSelection } from '@/features/workspace/selection';
import { cn } from '@/lib/cn';
import { REVIEW_FOCUSES } from './agents';
import { useAgentStore } from './agent-store';
import { ChevronDownIcon, PlusIcon, ArrowUpIcon, StopIcon } from '@/components/ui/icon';
import { Button } from '@/components/ui/Button';
import { IconButton } from '@/components/ui/IconButton';
import { Kbd } from '@/components/ui/Kbd';
import { MenuHeading, MenuList, MenuRow } from '@/components/ui/Menu';
import { Popover } from '@/components/ui/Popover';
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
  const anchorRef = useRef<HTMLDivElement>(null);
  return (
    <>
      <div ref={anchorRef} className="flex">
        <Button size="sm" disabled={disabled} className="rounded-r-none" onClick={() => onReview('all')}>
          Review
        </Button>
        <Button
          size="sm"
          disabled={disabled}
          className="-ml-px rounded-l-none px-1"
          aria-label="Review focus"
          onClick={() => setOpen((value) => !value)}
        >
          <ChevronDownIcon size={12} />
        </Button>
      </div>
      <Popover open={open} onOpenChange={setOpen} anchorRef={anchorRef} side="top" className="w-[200px]">
        <MenuList>
          <MenuHeading>Review focus</MenuHeading>
          {REVIEW_FOCUSES.map((focus) => (
            <MenuRow
              key={focus.value}
              onSelect={() => {
                setOpen(false);
                onReview(focus.value);
              }}
            >
              {focus.label}
            </MenuRow>
          ))}
        </MenuList>
      </Popover>
    </>
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
        <Button size="sm" disabled={disabled || streaming} onClick={onResolveAll}>
          Resolve all
        </Button>
        <Button size="sm" disabled={disabled || streaming} onClick={onSummarize}>
          Summarize changes
        </Button>
      </div>
      <div
        className={cn(
          'rounded-lg border border-border bg-canvas transition-colors focus-within:border-accent',
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
                className="inline-flex h-6 items-center gap-1 rounded-md border border-dashed border-border-strong px-1.5 font-mono text-2xs text-fg-muted hover:border-accent hover:text-accent"
              >
                <PlusIcon size={12} />
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
          className="selectable block max-h-[200px] w-full resize-none bg-transparent px-2.5 py-2 text-sm outline-none placeholder:text-fg-subtle"
        />
        <div className="flex items-center gap-2 px-2 pb-1.5">
          <span className="min-w-0 flex-1 truncate text-2xs text-fg-subtle">
            {modeHint ?? (
              <>
                <Kbd>↵</Kbd> send · <Kbd>⇧↵</Kbd> newline
              </>
            )}
          </span>
          {streaming ? (
            <Button size="sm" variant="danger" onClick={onStop}>
              <StopIcon size={12} />
              Stop
            </Button>
          ) : (
            <IconButton
              label="Send (Enter)"
              disabled={!canSend}
              onClick={submit}
              size="sm"
              variant={canSend ? 'primary' : 'ghost'}
              tooltipSide="top"
            >
              <ArrowUpIcon size={14} />
            </IconButton>
          )}
        </div>
      </div>
    </div>
  );
}
