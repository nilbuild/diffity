import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { useSelection } from '@/features/workspace/selection';
import { cn } from '@/lib/cn';
import { modKey } from '@/lib/platform';
import { REVIEW_FOCUSES } from './agents';
import { useAgentStore } from './agent-store';
import {
  ArrowUpIcon,
  CheckCircleIcon,
  ChevronDownIcon,
  PlusIcon,
  SparklesIcon,
  StopIcon,
  SummaryIcon,
} from '@/components/ui/icon';
import { Button } from '@/components/ui/Button';
import { IconButton } from '@/components/ui/IconButton';
import { Kbd } from '@/components/ui/Kbd';
import { MenuHeading, MenuList, MenuRow } from '@/components/ui/Menu';
import { Popover } from '@/components/ui/Popover';
import { useTooltip } from '@/components/ui/Tooltip';
import { ContextChipView, chipLabel } from './TimelineRows';

export interface ComposerProps {
  agentName: string;
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
  const main = useTooltip('Review the changes and leave comments', 'top');
  const focus = useTooltip('Review with a focus…', 'top');
  return (
    <>
      <div ref={anchorRef} className="flex">
        <Button
          size="sm"
          variant="ghost"
          disabled={disabled}
          className="rounded-r-none pr-1.5"
          onClick={() => onReview('all')}
          {...main.anchorProps}
        >
          <SparklesIcon size={12} className="text-accent" />
          Review
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={disabled}
          className={cn('rounded-l-none px-1', open && 'bg-hover text-fg')}
          aria-label="Review focus"
          onClick={() => setOpen((value) => !value)}
          {...focus.anchorProps}
        >
          <ChevronDownIcon size={12} />
        </Button>
      </div>
      {main.tooltip}
      {focus.tooltip}
      <Popover open={open} onOpenChange={setOpen} anchorRef={anchorRef} side="top" className="w-[200px]">
        <MenuList>
          <MenuHeading>Review focus</MenuHeading>
          {REVIEW_FOCUSES.map((item) => (
            <MenuRow
              key={item.value}
              onSelect={() => {
                setOpen(false);
                onReview(item.value);
              }}
            >
              {item.label}
            </MenuRow>
          ))}
        </MenuList>
      </Popover>
    </>
  );
}

function ActionButton(props: {
  label: string;
  tooltip: string;
  icon: ReactNode;
  disabled: boolean;
  onClick: () => void;
}) {
  const { label, tooltip, icon, disabled, onClick } = props;
  const tip = useTooltip(tooltip, 'top');
  return (
    <>
      <Button size="sm" variant="ghost" disabled={disabled} onClick={onClick} {...tip.anchorProps}>
        {icon}
        {label}
      </Button>
      {tip.tooltip}
    </>
  );
}

export function Composer(props: ComposerProps) {
  const { agentName, disabled, disabledReason, streaming, modeHint, onSend, onStop, onReview, onResolveAll, onSummarize } =
    props;
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
  const actionsDisabled = disabled || streaming;
  const showChips = attached.length > 0 || (selection !== null && !selectionAttached);

  const submit = () => {
    if (!canSend) {
      return;
    }
    onSend(text.trim());
    setText('');
  };

  return (
    <div className="shrink-0 px-3 pt-1 pb-3">
      <div
        className={cn(
          'rounded-lg border bg-canvas transition-colors',
          streaming ? 'border-border' : 'border-border hover:border-border-strong focus-within:border-accent hover:focus-within:border-accent',
          disabled && 'opacity-70',
        )}
      >
        {showChips && (
          <div className="flex flex-wrap gap-1 px-2 pt-2">
            {attached.map((chip, index) => (
              <ContextChipView key={`${chip.filePath}-${index}`} chip={chip} onRemove={() => detach(index)} />
            ))}
            {selection && !selectionAttached && (
              <button
                type="button"
                onClick={() => attach(selection)}
                title={`Attach current selection (${modKey}L)`}
                className="inline-flex h-6 cursor-default items-center gap-1 rounded-md border border-dashed border-border-strong px-1.5 font-mono text-2xs text-fg-muted hover:border-accent hover:text-accent"
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
          placeholder={disabledReason ?? `Ask ${agentName} about these changes…`}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Escape' && streaming) {
              event.preventDefault();
              onStop();
              return;
            }
            if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) {
              return;
            }
            event.preventDefault();
            submit();
          }}
          className="selectable block max-h-[200px] w-full resize-none bg-transparent px-3 pt-2.5 pb-1 text-sm text-fg outline-none placeholder:text-fg-subtle disabled:cursor-not-allowed"
        />
        <div className="flex items-center gap-0.5 px-1.5 pb-1.5">
          <ReviewButton disabled={actionsDisabled} onReview={onReview} />
          <ActionButton
            label="Resolve all"
            tooltip="Address every open comment thread"
            icon={<CheckCircleIcon size={12} />}
            disabled={actionsDisabled}
            onClick={onResolveAll}
          />
          <ActionButton
            label="Summarize"
            tooltip="Summarize these changes"
            icon={<SummaryIcon size={12} />}
            disabled={actionsDisabled}
            onClick={onSummarize}
          />
          <div className="ml-auto flex shrink-0 items-center gap-1.5 pl-1">
            {streaming ? (
              <Button size="sm" onClick={onStop} className="pl-1.5" title="Stop (Esc)">
                <StopIcon size={12} className="text-danger" />
                Stop
              </Button>
            ) : (
              <IconButton
                label="Send"
                shortcut="↵"
                disabled={!canSend}
                onClick={submit}
                size="sm"
                variant={canSend ? 'primary' : 'ghost'}
                tooltipSide="top"
                className={cn(!canSend && 'bg-muted text-fg-subtle')}
              >
                <ArrowUpIcon size={14} />
              </IconButton>
            )}
          </div>
        </div>
      </div>
      <div className="mt-1.5 flex h-4 items-center gap-2 px-1 text-2xs text-fg-subtle">
        <span className="min-w-0 flex-1 truncate">
          {modeHint ?? (
            <>
              <Kbd>↵</Kbd> send · <Kbd>{modKey}L</Kbd> add selection
            </>
          )}
        </span>
        {streaming && (
          <span className="shrink-0">
            <Kbd>Esc</Kbd> stop
          </span>
        )}
      </div>
    </div>
  );
}
