import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { Markdown } from '@/components/markdown/Markdown';
import { MenuList, MenuRow } from '@/components/ui/Menu';
import { Popover } from '@/components/ui/Popover';
import { AtIcon, SparklesIcon } from '@/components/ui/icon';
import { cn } from '@/lib/cn';
import { modKey } from '@/lib/platform';

export interface MentionSuggestion {
  handle: string;
  name: string;
  description: string;
}

export const MENTION_SUGGESTIONS: MentionSuggestion[] = [
  { handle: 'claude', name: 'Claude Code', description: 'Answers questions and makes the requested changes' },
];

export interface MarkdownEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
  minHeight?: number;
  maxHeight?: number;
  /** Rendered at the right of the Write/Preview tab strip. */
  headerExtra?: ReactNode;
  onSubmit?: () => void;
  onCancel?: () => void;
  textareaRef?: RefObject<HTMLTextAreaElement | null>;
  className?: string;
}

interface MentionState {
  start: number;
  query: string;
  top: number;
  left: number;
}

const MIRROR_PROPS = [
  'boxSizing',
  'width',
  'paddingTop',
  'paddingRight',
  'paddingBottom',
  'paddingLeft',
  'borderTopWidth',
  'borderRightWidth',
  'borderBottomWidth',
  'borderLeftWidth',
  'fontFamily',
  'fontSize',
  'fontWeight',
  'lineHeight',
  'letterSpacing',
  'tabSize',
  'whiteSpace',
  'wordBreak',
  'overflowWrap',
] as const;

function caretOffset(el: HTMLTextAreaElement, index: number): { top: number; left: number } {
  const mirror = document.createElement('div');
  const style = window.getComputedStyle(el);
  for (const prop of MIRROR_PROPS) {
    mirror.style[prop] = style[prop];
  }
  mirror.style.position = 'absolute';
  mirror.style.visibility = 'hidden';
  mirror.style.whiteSpace = 'pre-wrap';
  mirror.style.overflowWrap = 'break-word';
  mirror.textContent = el.value.slice(0, index);
  const marker = document.createElement('span');
  marker.textContent = '​';
  mirror.appendChild(marker);
  document.body.appendChild(mirror);
  const top = marker.offsetTop + marker.offsetHeight - el.scrollTop;
  const left = marker.offsetLeft - el.scrollLeft;
  mirror.remove();
  return { top, left };
}

function detectMention(el: HTMLTextAreaElement): MentionState | null {
  if (el.selectionStart !== el.selectionEnd) {
    return null;
  }
  const before = el.value.slice(0, el.selectionStart);
  const match = /(^|[\s(])@([\w-]*)$/.exec(before);
  if (!match) {
    return null;
  }
  const query = match[2].toLowerCase();
  if (!MENTION_SUGGESTIONS.some((s) => s.handle.startsWith(query))) {
    return null;
  }
  const start = before.length - match[2].length - 1;
  return { start, query, ...caretOffset(el, start) };
}

export function MarkdownEditor(props: MarkdownEditorProps) {
  const {
    value,
    onChange,
    placeholder = 'Leave a comment',
    autoFocus = true,
    minHeight = 72,
    maxHeight = 320,
    headerExtra,
    onSubmit,
    onCancel,
    className,
  } = props;
  const [tab, setTab] = useState<'write' | 'preview'>('write');
  const [mention, setMention] = useState<MentionState | null>(null);
  const [highlight, setHighlight] = useState(0);
  const localRef = useRef<HTMLTextAreaElement>(null);
  const ref = props.textareaRef ?? localRef;
  const anchorRef = useRef<HTMLSpanElement>(null);
  const suggestions = mention ? MENTION_SUGGESTIONS.filter((s) => s.handle.startsWith(mention.query)) : [];

  useEffect(() => {
    if (!autoFocus) {
      return;
    }
    const el = ref.current;
    if (!el) {
      return;
    }
    el.focus({ preventScroll: true });
    el.setSelectionRange(el.value.length, el.value.length);
    const frame = requestAnimationFrame(() => el.scrollIntoView({ block: 'nearest' }));
    return () => cancelAnimationFrame(frame);
  }, [autoFocus, ref]);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || tab !== 'write') {
      return;
    }
    el.style.height = 'auto';
    el.style.height = `${Math.max(minHeight, Math.min(el.scrollHeight + 2, maxHeight))}px`;
  }, [value, tab, minHeight, maxHeight, ref]);

  const refreshMention = () => {
    const el = ref.current;
    if (!el) {
      return;
    }
    const next = detectMention(el);
    setMention(next);
    if (!next) {
      setHighlight(0);
    }
  };

  const insert = (suggestion: MentionSuggestion) => {
    const el = ref.current;
    if (!el || !mention) {
      return;
    }
    const caret = el.selectionStart;
    const after = value.slice(caret);
    const text = `@${suggestion.handle}${after.startsWith(' ') ? '' : ' '}`;
    const next = value.slice(0, mention.start) + text + after;
    onChange(next);
    setMention(null);
    const position = mention.start + text.length;
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(position, position);
    });
  };

  const insertAt = () => {
    const el = ref.current;
    if (!el) {
      return;
    }
    setTab('write');
    const caret = el.selectionStart;
    const needsSpace = caret > 0 && !/\s/.test(value[caret - 1] ?? '');
    const text = `${needsSpace ? ' ' : ''}@claude `;
    onChange(value.slice(0, caret) + text + value.slice(caret));
    const position = caret + text.length;
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(position, position);
    });
  };

  return (
    <div
      className={cn('flex flex-col overflow-hidden rounded-md border border-border bg-canvas focus-within:border-accent', className)}
      onKeyDown={(event) => event.stopPropagation()}
    >
      <div className="flex h-8 shrink-0 items-center gap-1 border-b border-border bg-panel pr-1.5 pl-1">
        <EditorTab active={tab === 'write'} onClick={() => setTab('write')}>
          Write
        </EditorTab>
        <EditorTab active={tab === 'preview'} onClick={() => setTab('preview')}>
          Preview
        </EditorTab>
        <div className="ml-auto flex min-w-0 items-center gap-1">
          {headerExtra}
          <button
            type="button"
            title="Mention Claude"
            aria-label="Mention Claude"
            onClick={insertAt}
            className="inline-flex size-6 shrink-0 cursor-default items-center justify-center rounded-md text-fg-muted hover:bg-hover hover:text-fg"
          >
            <AtIcon size={14} />
          </button>
        </div>
      </div>
      <div className="relative">
        {tab === 'write' ? (
          <textarea
            ref={ref}
            value={value}
            placeholder={placeholder}
            onChange={(event) => {
              onChange(event.target.value);
              requestAnimationFrame(refreshMention);
            }}
            onSelect={refreshMention}
            onBlur={() => window.setTimeout(() => setMention(null), 150)}
            onKeyDown={(event) => {
              if (mention && suggestions.length > 0) {
                if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                  event.preventDefault();
                  const delta = event.key === 'ArrowDown' ? 1 : -1;
                  setHighlight((h) => (h + delta + suggestions.length) % suggestions.length);
                  return;
                }
                if ((event.key === 'Enter' && !event.metaKey && !event.ctrlKey) || event.key === 'Tab') {
                  event.preventDefault();
                  insert(suggestions[Math.min(highlight, suggestions.length - 1)]);
                  return;
                }
              }
              if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
                event.preventDefault();
                onSubmit?.();
                return;
              }
              if (event.key === 'Escape') {
                event.preventDefault();
                onCancel?.();
              }
            }}
            className="selectable block w-full resize-none bg-transparent px-2.5 py-2 text-sm text-fg outline-none placeholder:text-fg-subtle"
            style={{ minHeight }}
          />
        ) : (
          <div className="overflow-auto px-3 py-2" style={{ minHeight, maxHeight }}>
            {value.trim() ? (
              <Markdown compact mentions>
                {value}
              </Markdown>
            ) : (
              <span className="text-sm text-fg-subtle">Nothing to preview</span>
            )}
          </div>
        )}
        <span
          ref={anchorRef}
          className="pointer-events-none absolute size-0"
          style={{ top: mention?.top ?? 0, left: mention?.left ?? 0 }}
        />
      </div>
      <Popover
        open={mention !== null && suggestions.length > 0 && tab === 'write'}
        onOpenChange={(open) => {
          if (!open) {
            setMention(null);
          }
        }}
        anchorRef={anchorRef}
        className="w-[280px]"
      >
        <div onMouseDown={(event) => event.preventDefault()}>
        <MenuList className="select-none">
          <div className="px-2 pt-1 pb-1 text-2xs font-medium text-fg-subtle">Mention an agent</div>
          {suggestions.map((suggestion, index) => (
            <MenuRow
              key={suggestion.handle}
              icon={
                <span className="inline-flex size-5 items-center justify-center rounded-full bg-accent-solid text-accent-fg">
                  <SparklesIcon size={12} />
                </span>
              }
              description={suggestion.description}
              hint={`@${suggestion.handle}`}
              className={cn(index === highlight && 'bg-hover')}
              onSelect={() => insert(suggestion)}
            >
              {suggestion.name}
            </MenuRow>
          ))}
        </MenuList>
        </div>
      </Popover>
    </div>
  );
}

function EditorTab(props: { active: boolean; onClick: () => void; children: ReactNode }) {
  const { active, onClick, children } = props;
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'h-6 cursor-default rounded-md border px-2 text-xs font-medium',
        active ? 'border-border bg-canvas text-fg' : 'border-transparent text-fg-muted hover:bg-hover hover:text-fg',
      )}
    >
      {children}
    </button>
  );
}

export function submitHint(label: string) {
  return `${modKey}↵ ${label}`;
}
