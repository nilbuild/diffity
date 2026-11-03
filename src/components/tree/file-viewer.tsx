import { forwardRef, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { canHighlight, useHighlighter } from '../../hooks/use-highlighter';
import { useLineSelection } from '../../hooks/use-line-selection';
import type { CommentThread as CommentThreadType, CommentAuthor, LineSelection, SubmitOptions } from '../comments/types';
import type { CommentActions } from '../../hooks/use-comment-actions';
import { CommentThread } from '../comments/comment-thread';
import { CommentForm } from '../comments/comment-form';
import { CommentLineNumber } from '../comments/comment-line-number';
import { cn } from '../../lib/cn';
import { useViewState } from '../../lib/view-state';
import { useFindSource, type FindSource } from '../../features/find/find-store';
import { fileFindLines } from '../../lib/find';
import { fileSource, HIGHLIGHT_MAX_ROWS, runInSteps, tokenizeSources, type SideTokens } from '../../lib/syntax-lines';
import type { SyntaxToken } from '../../lib/syntax-token';
import { codeLineHeight } from '../../lib/typography';

interface FileViewerProps {
  filePath: string;
  content: string[];
  theme: 'light' | 'dark';
  threads: CommentThreadType[];
  commentActions: CommentActions;
  sessionId: string | null;
}

export interface FileViewerHandle {
  /** Scrolls the thread's line into view; false when the thread is not on this file. */
  revealThread: (threadId: string) => boolean;
  /** Scrolls a line to the middle and marks it; false until the file's content is loaded. */
  revealLine: (line: number) => boolean;
}

const CURRENT_AUTHOR: CommentAuthor = { name: 'You', type: 'user' };
const THREAD_HEIGHT_ESTIMATE = 120;
const FORM_HEIGHT_ESTIMATE = 160;
const OVERSCAN = 30;
/** Longer lines are cut off until expanded: a single huge text run is slow to lay out. */
const LINE_DISPLAY_MAX = 2000;
const TAB_WIDTH = 8;

/** Finished tokens per file content (one map per theme), dropped with the content they were made from. */
const syntaxCache = new WeakMap<string[], Map<string, Map<number, SyntaxToken[]>>>();

function useFileSyntax(filePath: string, content: string[], theme: 'light' | 'dark') {
  const { tokenize, languageReady } = useHighlighter();
  const ready = languageReady(filePath);
  const highlightable = canHighlight(filePath);
  const tooLarge = highlightable && content.length > HIGHLIGHT_MAX_ROWS;
  const [tokens, setTokens] = useState<Map<number, SyntaxToken[]> | null>(() => syntaxCache.get(content)?.get(theme) ?? null);
  const [, setVersion] = useState(0);

  useEffect(() => {
    if (!ready || !highlightable || tooLarge) {
      setTokens(null);
      return;
    }
    const cached = syntaxCache.get(content)?.get(theme);
    if (cached) {
      setTokens(cached);
      return;
    }
    const into: SideTokens = { old: new Map(), new: new Map() };
    setTokens(into.new);
    const work = tokenizeSources([fileSource('new', content)], (code, state) => tokenize(code, filePath, theme, state), into);
    return runInSteps(work, 0, () => setVersion((version) => version + 1), () => {
      const byTheme = syntaxCache.get(content) ?? new Map<string, Map<number, SyntaxToken[]>>();
      byTheme.set(theme, into.new);
      syntaxCache.set(content, byTheme);
      setVersion((version) => version + 1);
    });
  }, [ready, highlightable, tooLarge, content, filePath, theme, tokenize]);

  return { tokens, highlightOff: tooLarge };
}

function displayColumns(text: string): number {
  let tabs = 0;
  for (let index = text.indexOf('\t'); index !== -1; index = text.indexOf('\t', index + 1)) {
    tabs++;
  }
  return text.length + tabs * (TAB_WIDTH - 1);
}

export const FileViewer = forwardRef<FileViewerHandle, FileViewerProps>(function FileViewer(props, ref) {
  const {
    filePath,
    content,
    theme,
    threads,
    commentActions,
    sessionId,
  } = props;

  const [pendingSelection, setPendingSelection] = useViewState<LineSelection | null>(`tree:composer:${filePath}`, null);
  const { tokens, highlightOff } = useFileSyntax(filePath, content, theme);
  const tableRef = useRef<HTMLTableElement>(null);
  const [scrollElement, setScrollElement] = useState<HTMLElement | null>(null);
  const [scrollMargin, setScrollMargin] = useState(0);
  const [expandedLines, setExpandedLines] = useState<Set<number>>(() => new Set());

  useLayoutEffect(() => {
    const table = tableRef.current;
    const scroller = table?.closest('main');
    if (!table || !scroller) {
      return;
    }
    setScrollElement(scroller);
    const update = () => {
      const offset = table.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop;
      setScrollMargin(Math.round(offset));
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(scroller);
    for (const child of Array.from(scroller.children)) {
      observer.observe(child);
    }
    return () => observer.disconnect();
  }, []);

  const fileThreads = useMemo(() => {
    return threads.filter(t => t.filePath === filePath);
  }, [threads, filePath]);

  const threadsByLine = useMemo(() => {
    const map = new Map<number, CommentThreadType[]>();
    for (const thread of fileThreads) {
      const existing = map.get(thread.endLine) ?? [];
      existing.push(thread);
      map.set(thread.endLine, existing);
    }
    return map;
  }, [fileThreads]);

  const pendingEndLine = pendingSelection && pendingSelection.filePath === filePath ? pendingSelection.endLine : null;

  const virtualizer = useVirtualizer({
    count: content.length,
    getScrollElement: () => scrollElement,
    estimateSize: (index) => {
      const lineNum = index + 1;
      const threadCount = threadsByLine.get(lineNum)?.length ?? 0;
      return codeLineHeight() + threadCount * THREAD_HEIGHT_ESTIMATE + (pendingEndLine === lineNum ? FORM_HEIGHT_ESTIMATE : 0);
    },
    scrollMargin,
    overscan: OVERSCAN,
  });

  const revealLine = useCallback((lineNum: number) => {
    const index = Math.min(Math.max(lineNum - 1, 0), content.length - 1);
    virtualizer.scrollToIndex(index, { align: 'center' });
  }, [virtualizer, content.length]);

  useImperativeHandle(ref, () => ({
    revealThread: (threadId: string) => {
      const thread = fileThreads.find((t) => t.id === threadId);
      if (!thread) {
        return false;
      }
      revealLine(thread.endLine);
      return true;
    },
    revealLine: (line: number) => {
      if (content.length === 0) {
        return false;
      }
      revealLine(line);
      document.querySelectorAll('tr.guide-line-focus').forEach((row) => row.classList.remove('guide-line-focus'));
      // The row mounts once the virtualiser has scrolled there.
      let frames = 20;
      const mark = () => {
        const row = tableRef.current?.querySelector(`[data-find-line="${line}"]`)?.closest('tr');
        if (row) {
          row.classList.add('guide-line-focus');
          return;
        }
        if (frames-- > 0) {
          requestAnimationFrame(mark);
        }
      };
      requestAnimationFrame(mark);
      return true;
    },
  }), [fileThreads, revealLine, content.length]);

  const findSource = useMemo<FindSource>(() => ({
    label: 'file',
    lines: fileFindLines(filePath, content),
    reveal: (match) => revealLine(Number(match.key)),
  }), [filePath, content, revealLine]);
  useFindSource(findSource);

  const maxColumns = useMemo(() => {
    let max = 0;
    for (let i = 0; i < content.length; i++) {
      const text = content[i];
      const shown = text.length > LINE_DISPLAY_MAX && !expandedLines.has(i + 1) ? LINE_DISPLAY_MAX + 40 : displayColumns(text);
      max = Math.max(max, shown);
    }
    return max;
  }, [content, expandedLines]);

  const expandLine = useCallback((lineNum: number) => {
    setExpandedLines((prev) => new Set(prev).add(lineNum));
  }, []);

  const onSelectionComplete = useCallback((selection: LineSelection) => {
    setPendingSelection(selection);
  }, [setPendingSelection]);

  const {
    handleLineMouseDown,
    handleLineMouseEnter,
    isLineInSelection,
  } = useLineSelection({ filePath, onSelectionComplete });

  const isLineSelected = useCallback((lineNum: number) => {
    if (isLineInSelection(lineNum, 'new')) {
      return true;
    }
    if (pendingSelection && pendingSelection.filePath === filePath && pendingSelection.side === 'new') {
      if (lineNum >= pendingSelection.startLine && lineNum <= pendingSelection.endLine) {
        return true;
      }
    }
    for (const thread of fileThreads) {
      if (thread.status === 'open' && lineNum >= thread.startLine && lineNum <= thread.endLine) {
        return true;
      }
    }
    return false;
  }, [isLineInSelection, pendingSelection, filePath, fileThreads]);

  const handleAddThread = useCallback((body: string, options: SubmitOptions) => {
    if (!pendingSelection || !sessionId) {
      return;
    }

    const anchorContent = content.slice(
      pendingSelection.startLine - 1,
      pendingSelection.endLine,
    ).join('\n');

    commentActions.addThread(
      filePath,
      'new',
      pendingSelection.startLine,
      pendingSelection.endLine,
      body,
      CURRENT_AUTHOR,
      anchorContent,
      options,
    );
    setPendingSelection(null);
  }, [pendingSelection, sessionId, content, filePath, commentActions, setPendingSelection]);

  const handleCommentClick = useCallback((lineNum: number) => {
    setPendingSelection({
      filePath,
      side: 'new',
      startLine: lineNum,
      endLine: lineNum,
    });
  }, [filePath, setPendingSelection]);

  const getOriginalCode = useCallback((startLine: number, endLine: number) => {
    return content.slice(startLine - 1, endLine).join('\n');
  }, [content]);

  const renderLineCode = (lineNum: number) => {
    const text = content[lineNum - 1];
    if (text.length > LINE_DISPLAY_MAX && !expandedLines.has(lineNum)) {
      return (
        <>
          {text.slice(0, LINE_DISPLAY_MAX)}
          <button
            className='ml-2 px-1.5 rounded bg-hover font-sans text-[11px] text-text-muted hover:text-text cursor-pointer'
            onClick={() => expandLine(lineNum)}
          >
            … {(text.length - LINE_DISPLAY_MAX).toLocaleString()} more characters
          </button>
        </>
      );
    }
    const lineTokens = tokens?.get(lineNum);
    if (!lineTokens) {
      return text;
    }
    return lineTokens.map((token, j) => (
      <span key={j} style={{ color: token.color }}>{token.text}</span>
    ));
  };

  const renderLine = (lineNum: number) => {
    const selected = isLineSelected(lineNum);
    const lineThreads = threadsByLine.get(lineNum);
    const showForm = pendingSelection && pendingEndLine === lineNum;

    return (
      <>
        <tr className='group/row'>
          <CommentLineNumber
            lineNumber={lineNum}
            isSelected={selected}
            onMouseDown={() => handleLineMouseDown(lineNum, 'new')}
            onMouseEnter={() => handleLineMouseEnter(lineNum, 'new')}
            onCommentClick={() => handleCommentClick(lineNum)}
            showCommentButton={true}
          />
          <td
            data-find-line={lineNum}
            className={cn(
              'px-4 py-0 code-text whitespace-pre',
              selected && 'bg-diff-comment-bg',
            )}
          >
            {renderLineCode(lineNum)}
          </td>
        </tr>
        {lineThreads?.map((thread) => (
          <CommentThread
            key={thread.id}
            thread={thread}
            onReply={commentActions.addReply}
            onResolve={commentActions.resolveThread}
            onUnresolve={commentActions.unresolveThread}
            onEditComment={commentActions.editComment}
            onDeleteComment={commentActions.deleteComment}
            onDeleteThread={commentActions.deleteThread}
            currentAuthor={CURRENT_AUTHOR}
            colSpan={2}
            currentCode={getOriginalCode(thread.startLine, thread.endLine)}
          />
        ))}
        {showForm && (
          <tr>
            <td colSpan={2} className='px-4 py-2'>
              <div className='max-w-[700px]'>
                <CommentForm
                  onSubmit={handleAddThread}
                  onCancel={() => setPendingSelection(null)}
                  lineLabel={pendingSelection.startLine === pendingSelection.endLine
                    ? `Line ${pendingSelection.startLine}`
                    : `Lines ${pendingSelection.startLine}–${pendingSelection.endLine}`}
                  reviewable
                />
              </div>
            </td>
          </tr>
        )}
      </>
    );
  };

  const items = virtualizer.getVirtualItems();
  const [paddingTop, paddingBottom] = items.length > 0
    ? [
        items[0].start - scrollMargin,
        virtualizer.getTotalSize() - (items[items.length - 1].end - scrollMargin),
      ]
    : [0, 0];

  return (
    <div data-find-scope={filePath} className='border border-border rounded-lg overflow-x-auto'>
      {highlightOff && (
        <div className='sticky left-0 px-4 py-1.5 border-b border-border text-xs text-text-muted'>
          Syntax highlighting is off for files over {HIGHLIGHT_MAX_ROWS.toLocaleString()} lines
        </div>
      )}
      <table ref={tableRef} className='w-full border-collapse'>
        <tbody>
          <tr style={{ height: paddingTop }}>
            <td className='w-(--gutter-w) min-w-(--gutter-w) p-0' />
            <td className='code-text p-0' style={{ minWidth: `calc(${maxColumns}ch + 2rem)` }} />
          </tr>
        </tbody>
        {items.map((item) => (
          <tbody key={item.index} data-index={item.index} ref={virtualizer.measureElement}>
            {renderLine(item.index + 1)}
          </tbody>
        ))}
        <tbody>
          <tr style={{ height: paddingBottom }}>
            <td colSpan={2} className='p-0' />
          </tr>
        </tbody>
      </table>
    </div>
  );
});
