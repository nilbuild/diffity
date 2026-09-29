import { forwardRef, useImperativeHandle, useRef, useState } from 'react';
import { cn } from '../../lib/cn';
import { splitMentions } from '../../lib/mentions';
import { SparkleIcon } from '../ui/icon';

interface MentionTextareaProps {
  value: string;
  onChange: (value: string) => void;
  onKeyDown?: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  placeholder?: string;
  rows?: number;
  className?: string;
}

interface MentionQuery {
  start: number;
  end: number;
}

const MENTION_TARGET = 'claude';

const BACKDROP_RESET = 'absolute inset-0 m-0 overflow-hidden whitespace-pre-wrap break-words pointer-events-none select-none text-transparent resize-none placeholder:text-transparent';

function MentionBackdrop(props: { value: string; className?: string; backdropRef: React.RefObject<HTMLDivElement | null> }) {
  const { value, className, backdropRef } = props;

  return (
    <div ref={backdropRef} aria-hidden className={cn(className, BACKDROP_RESET)}>
      {splitMentions(value).map((part, index) => {
        if (!part.mention) {
          return <span key={index}>{part.text}</span>;
        }
        return (
          <mark key={index} className="rounded bg-accent/15 text-transparent ring-1 ring-accent/30">
            {part.text}
          </mark>
        );
      })}
      {'\n'}
    </div>
  );
}

function findMentionQuery(value: string, caret: number): MentionQuery | null {
  const before = value.slice(0, caret);
  const match = /(^|[\s(])@([\w-]*)$/.exec(before);
  if (!match) {
    return null;
  }
  const typed = match[2].toLowerCase();
  if (!MENTION_TARGET.startsWith(typed) || typed === MENTION_TARGET) {
    return null;
  }
  return { start: caret - typed.length - 1, end: caret };
}

export const MentionTextarea = forwardRef<HTMLTextAreaElement, MentionTextareaProps>(function MentionTextarea(props, ref) {
  const { value, onChange, onKeyDown, placeholder, rows, className } = props;
  const innerRef = useRef<HTMLTextAreaElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState<MentionQuery | null>(null);

  useImperativeHandle(ref, () => innerRef.current as HTMLTextAreaElement);

  const refreshQuery = (next: string, caret: number) => {
    setQuery(findMentionQuery(next, caret));
  };

  const accept = () => {
    if (!query) {
      return;
    }
    const insert = `@${MENTION_TARGET} `;
    const next = value.slice(0, query.start) + insert + value.slice(query.end);
    onChange(next);
    setQuery(null);
    const caret = query.start + insert.length;
    requestAnimationFrame(() => {
      const el = innerRef.current;
      if (!el) {
        return;
      }
      el.focus();
      el.setSelectionRange(caret, caret);
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (query && (e.key === 'Enter' || e.key === 'Tab') && !e.metaKey && !e.ctrlKey) {
      e.preventDefault();
      accept();
      return;
    }
    if (query && e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      setQuery(null);
      return;
    }
    onKeyDown?.(e);
  };

  const syncScroll = () => {
    const el = innerRef.current;
    const backdrop = backdropRef.current;
    if (!el || !backdrop) {
      return;
    }
    backdrop.scrollTop = el.scrollTop;
  };

  return (
    <div className="relative">
      <MentionBackdrop value={value} className={className} backdropRef={backdropRef} />
      <textarea
        ref={innerRef}
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          refreshQuery(e.target.value, e.target.selectionStart);
        }}
        onKeyDown={handleKeyDown}
        onClick={(e) => refreshQuery(value, e.currentTarget.selectionStart)}
        onBlur={() => setQuery(null)}
        onScroll={syncScroll}
        placeholder={placeholder}
        rows={rows}
        className={cn(className, 'relative bg-transparent')}
      />
      {query && (
        <div className="absolute left-2 top-full -mt-1 z-30 w-60 py-1 bg-overlay rounded-lg ring-1 ring-overlay-border">
          <button
            type="button"
            onMouseDown={(e) => {
              e.preventDefault();
              accept();
            }}
            className="flex items-center gap-2.5 w-full px-3 py-1.5 text-xs text-text bg-hover cursor-pointer text-left"
          >
            <SparkleIcon className="w-3.5 h-3.5 text-accent" />
            <span className="font-semibold">@claude</span>
            <span className="text-text-muted truncate">Ask Claude Code</span>
          </button>
        </div>
      )}
    </div>
  );
});
