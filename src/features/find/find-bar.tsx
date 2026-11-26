import { useEffect, useMemo, useRef } from 'react';
import { cn } from '../../lib/cn';
import { chord, shortcutHint } from '../../lib/shortcuts';
import { carryCurrent, FIND_MATCH_LIMIT, firstMatchFrom, rangeFor, searchLines, textSegments, type FindMatch } from '../../lib/find';
import { usePageActions, type PaletteAction } from '../palette/palette-store';
import { ChevronDownIcon, ChevronUpIcon, SearchIcon, XIcon } from '../../components/ui/icon';
import { OptionToggle } from '../../components/ui/option-toggle';
import { closeFind, openFind, stepFind, useFind } from './find-store';

const SEARCH_DEBOUNCE_MS = 120;
const MATCH_HIGHLIGHT = 'diffity-find';
const CURRENT_HIGHLIGHT = 'diffity-find-current';
/** Rows closer than this to the top of the scroller count as hidden under the sticky file header. */
const TOP_OFFSET = 56;
const EMPTY_ACTIONS: PaletteAction[] = [];

function isTyping(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) {
    return false;
  }
  return el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable;
}

function lineSelector(scope: string, key: string): string {
  return `[data-find-scope="${CSS.escape(scope)}"] [data-find-line="${CSS.escape(key)}"]`;
}

function scrollParent(element: Element): HTMLElement | null {
  return element.closest('main');
}

function inView(element: Element): boolean {
  const rect = element.getBoundingClientRect();
  const parent = scrollParent(element);
  const bounds = parent ? parent.getBoundingClientRect() : { top: 0, bottom: window.innerHeight };
  return rect.top >= bounds.top + TOP_OFFSET && rect.bottom <= bounds.bottom - 16;
}

/** Waits (up to ~2s) for the match's row to mount after a reveal, then keeps it centred while the layout settles. */
/** Unwrapped diff lines scroll sideways; asks the match's file to bring it into view (see CodeScrollbar). */
function revealSideways(element: Element, match: FindMatch) {
  const range = rangeFor(textSegments(element), match.start, match.end);
  if (!range) {
    return;
  }
  const { left, right } = range.getBoundingClientRect();
  element.dispatchEvent(new CustomEvent('diffity:reveal-range', { bubbles: true, detail: { left, right } }));
}

function settleOnMatch(match: FindMatch): () => void {
  let disposed = false;
  let frame = 0;
  let foundAt = 0;
  const started = performance.now();

  const tick = () => {
    if (disposed) {
      return;
    }
    const now = performance.now();
    const element = document.querySelector(lineSelector(match.scope, match.key));
    if (element) {
      foundAt = foundAt || now;
      if (!inView(element)) {
        element.scrollIntoView({ behavior: 'instant', block: 'center' });
      }
      revealSideways(element, match);
      if (now - foundAt > 500) {
        return;
      }
    } else if (now - started > 2000) {
      return;
    }
    frame = requestAnimationFrame(tick);
  };
  frame = requestAnimationFrame(tick);
  return () => {
    disposed = true;
    cancelAnimationFrame(frame);
  };
}

/** WebKit does not repaint when the highlight registry changes; nudging an attribute on the root makes it. */
function repaint() {
  const root = document.documentElement;
  root.setAttribute('data-find-paint', root.getAttribute('data-find-paint') === 'a' ? 'b' : 'a');
}

function clearHighlights() {
  if (typeof CSS === 'undefined' || !CSS.highlights) {
    return;
  }
  for (const name of [MATCH_HIGHLIGHT, CURRENT_HIGHLIGHT]) {
    CSS.highlights.get(name)?.clear();
    CSS.highlights.delete(name);
  }
  repaint();
}

/** Paints every match in the rows that are mounted right now (virtualised rows are painted as they mount). */
function paint(byLine: Map<string, FindMatch[]>, scopes: Set<string>, current: FindMatch | null) {
  if (typeof CSS === 'undefined' || !CSS.highlights) {
    return;
  }
  const all: Range[] = [];
  const emphasised: Range[] = [];
  for (const scopeElement of document.querySelectorAll('[data-find-scope]')) {
    const scope = scopeElement.getAttribute('data-find-scope') ?? '';
    if (!scopes.has(scope)) {
      continue;
    }
    for (const lineElement of scopeElement.querySelectorAll('[data-find-line]')) {
      const key = lineElement.getAttribute('data-find-line') ?? '';
      const matches = byLine.get(`${scope}\u0000${key}`);
      if (!matches) {
        continue;
      }
      const segments = textSegments(lineElement);
      for (const match of matches) {
        const range = rangeFor(segments, match.start, match.end);
        if (!range) {
          continue;
        }
        if (match === current) {
          emphasised.push(range);
        } else {
          all.push(range);
        }
      }
    }
  }
  const currentHighlight = new Highlight(...emphasised);
  currentHighlight.priority = 1;
  CSS.highlights.set(MATCH_HIGHLIGHT, new Highlight(...all));
  CSS.highlights.set(CURRENT_HIGHLIGHT, currentHighlight);
  repaint();
}

/** Search, reveal, painting and keys for find; always mounted. Pages place the bar itself with `FindBar`. */
export function FindHost() {
  const source = useFind((state) => state.source);
  const open = useFind((state) => state.open);
  const query = useFind((state) => state.query);
  const caseSensitive = useFind((state) => state.caseSensitive);
  const wholeWord = useFind((state) => state.wholeWord);
  const regex = useFind((state) => state.regex);
  const matches = useFind((state) => state.matches);
  const current = useFind((state) => state.current);
  const revealTick = useFind((state) => state.revealTick);
  const searchedRef = useRef<string | null>(null);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const mod = event.metaKey || event.ctrlKey;
      const key = event.key.toLowerCase();
      if (mod && !event.altKey && !event.shiftKey && key === 'f') {
        event.preventDefault();
        openFind();
        return;
      }
      if (mod && !event.altKey && key === 'g' && useFind.getState().open) {
        event.preventDefault();
        stepFind(event.shiftKey ? -1 : 1);
        return;
      }
      if (event.key === 'Escape' && useFind.getState().open && !isTyping(event.target)) {
        closeFind();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const actions = useMemo<PaletteAction[]>(() => {
    if (!source) {
      return EMPTY_ACTIONS;
    }
    return [{
      id: 'find',
      title: source.label === 'file' ? 'Find in file' : 'Find in changes',
      group: 'View',
      hint: shortcutHint('find'),
      keywords: 'search text',
      icon: <SearchIcon size="sm" />,
      run: () => window.setTimeout(openFind, 0),
    }];
  }, [source]);
  usePageActions('find', actions);

  useEffect(() => {
    if (!open || !source) {
      searchedRef.current = null;
      return;
    }
    const signature = `${caseSensitive ? 1 : 0}${wholeWord ? 1 : 0}${regex ? 1 : 0}${query}`;
    const run = () => {
      const result = searchLines(source.lines, query, { caseSensitive, wholeWord, regex });
      const state = useFind.getState();
      const previous = state.matches[state.current] ?? null;
      const fresh = searchedRef.current !== signature;
      searchedRef.current = signature;
      let next = fresh ? -1 : carryCurrent(previous, result.matches);
      let reveal = fresh;
      if (next < 0 && result.matches.length > 0) {
        next = firstMatchFrom(source.lines, result.matches, source.currentScope?.() ?? null);
        reveal = reveal || state.current < 0;
      }
      useFind.setState({
        matches: result.matches,
        truncated: result.truncated,
        error: result.error ?? null,
        current: next,
        revealTick: reveal && next >= 0 ? state.revealTick + 1 : state.revealTick,
      });
    };
    const timer = window.setTimeout(run, searchedRef.current === null || !query ? 0 : SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [open, source, query, caseSensitive, wholeWord, regex]);

  useEffect(() => {
    if (revealTick === 0) {
      return;
    }
    const state = useFind.getState();
    const match = state.matches[state.current];
    if (!match || !state.source) {
      return;
    }
    state.source.reveal(match);
    return settleOnMatch(match);
  }, [revealTick]);

  useEffect(() => {
    if (!open || matches.length === 0) {
      clearHighlights();
      return;
    }
    const byLine = new Map<string, FindMatch[]>();
    const scopes = new Set<string>();
    for (const match of matches) {
      const id = `${match.scope}\u0000${match.key}`;
      const list = byLine.get(id);
      if (list) {
        list.push(match);
      } else {
        byLine.set(id, [match]);
      }
      scopes.add(match.scope);
    }
    const currentMatch = matches[current] ?? null;
    let frame = 0;
    const schedule = () => {
      if (frame) {
        return;
      }
      frame = requestAnimationFrame(() => {
        frame = 0;
        paint(byLine, scopes, currentMatch);
      });
    };
    schedule();
    const observer = new MutationObserver(schedule);
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [open, matches, current]);

  useEffect(() => clearHighlights, []);

  return null;
}

function status(query: string, count: number, current: number, truncated: boolean, busy: boolean, invalid: boolean): string {
  if (!query) {
    return '';
  }
  if (invalid) {
    return 'Invalid';
  }
  if (busy && count === 0) {
    return 'Searching…';
  }
  if (count === 0) {
    return 'No results';
  }
  return `${current >= 0 ? (current + 1).toLocaleString() : '–'} of ${count.toLocaleString()}${truncated ? '+' : ''}`;
}

/** The ⌘F bar, placed by the page (absolutely, inside a relative box above its scroller). */
export function FindBar(props: { className?: string }) {
  const { className } = props;
  const open = useFind((state) => state.open);
  const source = useFind((state) => state.source);
  const query = useFind((state) => state.query);
  const caseSensitive = useFind((state) => state.caseSensitive);
  const wholeWord = useFind((state) => state.wholeWord);
  const regex = useFind((state) => state.regex);
  const error = useFind((state) => state.error);
  const count = useFind((state) => state.matches.length);
  const current = useFind((state) => state.current);
  const truncated = useFind((state) => state.truncated);
  const focusTick = useFind((state) => state.focusTick);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) {
      return;
    }
    const frame = requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });
    return () => cancelAnimationFrame(frame);
  }, [open, focusTick]);

  if (!open || !source) {
    return null;
  }

  const busy = (source.pending ?? 0) > 0;
  const invalid = !!error && !!query;
  const label = status(query, count, current, truncated, busy, invalid);

  return (
    <div
      role="search"
      className={cn(
        'absolute right-6 z-30 flex max-w-[calc(100%-48px)] flex-col rounded-lg border border-overlay-border bg-overlay shadow-overlay',
        className,
      )}
    >
      <div className="flex h-9 items-center gap-1 pl-2.5 pr-1">
        <SearchIcon size="sm" className="shrink-0 text-text-muted" />
        <input
          ref={inputRef}
          value={query}
          onChange={(event) => useFind.setState({ query: event.target.value })}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              stepFind(event.shiftKey ? -1 : 1);
              return;
            }
            if (event.key === 'Escape') {
              event.preventDefault();
              event.stopPropagation();
              closeFind();
            }
          }}
          placeholder={source.label === 'file' ? 'Find in file' : 'Find in changes'}
          aria-label={source.label === 'file' ? 'Find in file' : 'Find in changes'}
          spellCheck={false}
          autoComplete="off"
          aria-invalid={invalid}
          className={cn('h-7 w-56 min-w-16 shrink bg-transparent px-1 text-[13px] text-text placeholder:text-text-muted focus:outline-none', regex && 'font-mono text-xs')}
        />
        <span className={cn('min-w-[72px] shrink-0 whitespace-nowrap text-right text-xs tabular-nums', invalid ? 'text-deleted' : 'text-text-muted')} aria-live="polite">
          {label}
        </span>
        <span className="ml-1 flex items-center gap-0.5">
          <OptionToggle label="Aa" title="Match case" active={caseSensitive} onToggle={() => useFind.setState({ caseSensitive: !caseSensitive })} />
          <OptionToggle label={<span className="underline underline-offset-2">ab</span>} title="Match whole word" active={wholeWord} onToggle={() => useFind.setState({ wholeWord: !wholeWord })} />
          <OptionToggle label=".*" title="Use regular expression" active={regex} onToggle={() => useFind.setState({ regex: !regex })} />
        </span>
        <button
          type="button"
          onClick={() => stepFind(-1)}
          disabled={count === 0}
          title={`Previous match (⇧↵, ${chord('G', { shift: true })})`}
          aria-label="Previous match"
          className="flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded-md text-text-muted hover:bg-hover hover:text-text disabled:cursor-default disabled:opacity-40 disabled:hover:bg-transparent"
        >
          <ChevronUpIcon size="sm" />
        </button>
        <button
          type="button"
          onClick={() => stepFind(1)}
          disabled={count === 0}
          title={`Next match (↵, ${chord('G')})`}
          aria-label="Next match"
          className="flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded-md text-text-muted hover:bg-hover hover:text-text disabled:cursor-default disabled:opacity-40 disabled:hover:bg-transparent"
        >
          <ChevronDownIcon size="sm" />
        </button>
        <button
          type="button"
          onClick={closeFind}
          title="Close (Esc)"
          aria-label="Close find"
          className="flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded-md text-text-muted hover:bg-hover hover:text-text"
        >
          <XIcon size="sm" />
        </button>
      </div>
      {invalid && (
        <p className="border-t border-border-muted px-3 py-1.5 text-[11.5px] text-deleted">{error}</p>
      )}
      {!invalid && (truncated || (busy && query)) && (
        <p className="border-t border-border-muted px-3 py-1.5 text-[11.5px] text-text-muted">
          {truncated ? `Showing the first ${FIND_MATCH_LIMIT.toLocaleString()} matches. Type more to narrow it down.` : `Loading ${source.pending} large file${source.pending === 1 ? '' : 's'} to search…`}
        </p>
      )}
    </div>
  );
}
