import { useMemo, useRef, useState, useCallback, useImperativeHandle, useEffect, useLayoutEffect } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import type { ParsedDiff } from '@diffity/parser';
import { FileBlock } from './file-block';
import { ConfirmDialog } from '../ui/confirm-dialog';
import { buttonGhost } from '../ui/button-styles';
import { cn } from '../../lib/cn';
import { deferReason, getRowCount } from '../../lib/diff-utils';
import { loadAllHeldBackFiles, useLargeDiff } from '../../lib/large-diff';
import { DiffContextHeader } from '../layout/diff-context-bar';
import { GeneralComments } from '../comments/general-comments';
import { OutsideThreads } from '../comments/outside-threads';
import { GENERAL_THREAD_FILE_PATH } from '../comments/types';
import { useHighlighter } from '../../hooks/use-highlighter';
import { type ViewMode, getFilePath } from '../../lib/diff-utils';
import type { DiffFile } from '@diffity/parser';
import type { CommentThread, LineSelection } from '../comments/types';
import type { CommentActions } from '../../hooks/use-comment-actions';

function flashThreadElement(element: Element) {
  element.dispatchEvent(new CustomEvent('diffity:focus-thread', { bubbles: false }));
  element.classList.remove('flash-thread');
  void (element as HTMLElement).offsetWidth;
  element.classList.add('flash-thread');
}

export interface DiffViewHandle {
  scrollToFile: (path: string) => void;
  scrollToThread: (threadId: string, filePath: string) => void;
}

const VIRTUALIZER_OVERSCAN = 3;
const FILE_HEADER_HEIGHT = 56;
const EMPTY_CONTENT_HEIGHT = 100;
const LINE_HEIGHT = 22;
const HUNK_HEADER_HEIGHT = 32;
const FILE_BLOCK_PADDING = 16;
const LIST_TOP_PADDING = 16;
const HELD_BACK_HEIGHT = FILE_HEADER_HEIGHT + 56;

interface DiffViewProps {
  diff: ParsedDiff;
  viewMode: ViewMode;
  theme: 'light' | 'dark';
  collapsedFiles: Set<string>;
  onToggleCollapse: (path: string) => void;
  reviewedFiles: Set<string>;
  onReviewedChange: (path: string, reviewed: boolean) => void;
  onActiveFileChange?: (path: string) => void;
  scrollRef?: React.RefCallback<HTMLElement>;
  handle?: React.Ref<DiffViewHandle>;
  baseRef?: string;
  canRevert?: boolean;
  onRevert?: () => void;
  threads: CommentThread[];
  commentsEnabled: boolean;
  commentActions: CommentActions;
  onAddThread: CommentActions['addThread'];
  pendingSelection: LineSelection | null;
  onPendingSelectionChange: (selection: LineSelection | null) => void;
  /** Restored before the first paint so coming back to a view does not jump. */
  initialScrollTop?: number;
  onScrollTopChange?: (top: number) => void;
  hideWhitespace?: boolean;
}

function estimateFileHeight(file: DiffFile, collapsed: boolean, heldBack: boolean): number {
  if (collapsed) {
    return FILE_HEADER_HEIGHT;
  }
  if (heldBack) {
    return HELD_BACK_HEIGHT;
  }
  if (file.isBinary || file.hunks.length === 0) {
    return EMPTY_CONTENT_HEIGHT;
  }
  return FILE_HEADER_HEIGHT + getRowCount(file) * LINE_HEIGHT + file.hunks.length * HUNK_HEADER_HEIGHT + FILE_BLOCK_PADDING;
}

function LargeDiffNotice(props: { files: DiffFile[] }) {
  const { files } = props;
  const [confirming, setConfirming] = useState(false);
  const rows = files.reduce((sum, file) => sum + getRowCount(file), 0);

  return (
    <div className="flex items-center gap-2 h-9 px-3 rounded-lg border border-border bg-bg-secondary text-[13px] text-text-secondary">
      <span className="w-1.5 h-1.5 rounded-full bg-modified shrink-0" aria-hidden />
      <span className="min-w-0 flex-1 truncate">
        Large diff: {files.length} file{files.length === 1 ? ' is' : 's are'} collapsed (lock, generated, minified or very large)
      </span>
      <button onClick={() => setConfirming(true)} className={cn(buttonGhost, 'h-6 px-2 text-xs text-text')}>
        Expand all
      </button>
      {confirming && (
        <ConfirmDialog
          title={`Load ${files.length} collapsed file${files.length === 1 ? '' : 's'}?`}
          message={`That renders about ${rows.toLocaleString()} more changed lines. Diffity may get slow while they load.`}
          confirmLabel="Load all"
          onConfirm={() => {
            setConfirming(false);
            loadAllHeldBackFiles();
          }}
          onCancel={() => setConfirming(false)}
        />
      )}
    </div>
  );
}

export function DiffView(props: DiffViewProps) {
  const {
    diff, viewMode, theme, collapsedFiles, onToggleCollapse,
    reviewedFiles, onReviewedChange, onActiveFileChange, scrollRef,
    handle, baseRef, canRevert, onRevert,
    threads, commentsEnabled, commentActions, onAddThread,
    pendingSelection, onPendingSelectionChange, initialScrollTop = 0, onScrollTopChange, hideWhitespace = false,
  } = props;
  const { highlight } = useHighlighter();
  const scrollElementRef = useRef<HTMLElement>(null);

  useLayoutEffect(() => {
    if (scrollElementRef.current && initialScrollTop > 0) {
      scrollElementRef.current.scrollTop = initialScrollTop;
    }
  }, []);

  const outsideThreads = useMemo(() => {
    const paths = new Set(diff.files.map((file) => getFilePath(file)));
    return threads.filter((thread) => thread.filePath !== GENERAL_THREAD_FILE_PATH && !paths.has(thread.filePath));
  }, [diff.files, threads]);

  const highlighters = useMemo(() => {
    const map = new Map<string, (code: string) => ReturnType<typeof highlight>>();
    for (const file of diff.files) {
      const filePath = getFilePath(file);
      map.set(filePath, (code: string) => highlight(code, filePath, theme));
    }
    return map;
  }, [diff, highlight, theme]);

  const heldBackPaths = useMemo(() => {
    const threadPaths = new Set(threads.map((thread) => thread.filePath));
    const paths = new Set<string>();
    for (const file of diff.files) {
      const path = getFilePath(file);
      if (deferReason(file) && !threadPaths.has(path)) {
        paths.add(path);
      }
    }
    return paths;
  }, [diff.files, threads]);
  const loadedAll = useLargeDiff((state) => state.all);
  const loadedPaths = useLargeDiff((state) => state.loaded);
  const stillHeldBack = useMemo(
    () => (loadedAll ? [] : diff.files.filter((file) => heldBackPaths.has(getFilePath(file)) && !loadedPaths.has(getFilePath(file)))),
    [diff.files, heldBackPaths, loadedAll, loadedPaths],
  );

  const headerRef = useRef<HTMLDivElement>(null);
  const [scrollMargin, setScrollMargin] = useState(0);
  useLayoutEffect(() => {
    const header = headerRef.current;
    if (!header) {
      return;
    }
    const update = () => setScrollMargin(header.offsetHeight + LIST_TOP_PADDING);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(header);
    return () => observer.disconnect();
  }, []);

  const virtualizer = useVirtualizer({
    initialOffset: initialScrollTop,
    scrollMargin,
    count: diff.files.length,
    getScrollElement: () => scrollElementRef.current,
    estimateSize: (index) => {
      const path = getFilePath(diff.files[index]);
      return estimateFileHeight(diff.files[index], collapsedFiles.has(path), heldBackPaths.has(path) && !loadedAll && !loadedPaths.has(path));
    },
    overscan: VIRTUALIZER_OVERSCAN,
  });

  const scrollTargetRef = useRef<string | null>(null);
  const [highlightedFile, setHighlightedFile] = useState<string | null>(null);
  const handleHighlightEnd = useCallback((path: string) => {
    setHighlightedFile((current) => (current === path ? null : current));
  }, []);

  const [pendingThreadScroll, setPendingThreadScroll] = useState<string | null>(null);

  const settleScrollToElement = useCallback((selector: string, align: ScrollLogicalPosition, onFound?: (el: Element) => void) => {
    let disposed = false;
    const scrollEl = scrollElementRef.current;

    const doScroll = () => {
      const element = document.querySelector(selector);
      if (!element) {
        return false;
      }
      requestAnimationFrame(() => {
        if (!disposed) {
          element.scrollIntoView({ behavior: 'instant', block: align });
          onFound?.(element);
        }
      });
      return true;
    };

    if (doScroll()) {
      return () => { disposed = true; };
    }

    let observer: MutationObserver | null = null;
    if (scrollEl) {
      observer = new MutationObserver(() => {
        if (doScroll()) {
          observer?.disconnect();
        }
      });
    }

    observer?.observe(scrollEl!, { childList: true, subtree: true });

    const retryTimers = [50, 150, 300, 500].map((delay) =>
      setTimeout(() => {
        if (!disposed && doScroll()) {
          observer?.disconnect();
        }
      }, delay)
    );

    const timeout = setTimeout(() => {
      disposed = true;
      observer?.disconnect();
    }, 2000);

    return () => {
      disposed = true;
      observer?.disconnect();
      clearTimeout(timeout);
      for (const timer of retryTimers) {
        clearTimeout(timer);
      }
    };
  }, []);

  useImperativeHandle(handle, () => ({
    scrollToFile: (path: string) => {
      const index = diff.files.findIndex((f) => getFilePath(f) === path);
      if (index >= 0) {
        scrollTargetRef.current = path;
        setHighlightedFile(path);
        virtualizer.scrollToIndex(index, { align: 'start' });
        settleScrollToElement(`#file-${CSS.escape(encodeURIComponent(path))}`, 'start');
      }
    },
    scrollToThread: (threadId: string, filePath: string) => {
      const element = document.querySelector(`[data-thread-id="${threadId}"]`);
      if (element) {
        requestAnimationFrame(() => {
          element.scrollIntoView({ behavior: 'instant', block: 'center' });
          flashThreadElement(element);
        });
        return;
      }

      const index = diff.files.findIndex((f) => getFilePath(f) === filePath);
      if (index >= 0) {
        scrollTargetRef.current = filePath;
        virtualizer.scrollToIndex(index, { align: 'start' });
      }
      setPendingThreadScroll(threadId);
    },
  }), [diff.files, virtualizer, settleScrollToElement]);

  useEffect(() => {
    if (!pendingThreadScroll) {
      return;
    }

    const threadId = pendingThreadScroll;

    return settleScrollToElement(
      `[data-thread-id="${threadId}"]`,
      'center',
      (element) => {
        setPendingThreadScroll(null);
        flashThreadElement(element);
      },
    );
  }, [pendingThreadScroll, settleScrollToElement]);

  const getTopVisibleFile = useCallback((): string | null => {
    const visibleItems = virtualizer.getVirtualItems();
    if (visibleItems.length === 0) {
      return null;
    }

    const scrollEl = scrollElementRef.current;
    if (!scrollEl) {
      return null;
    }

    const scrollTop = scrollEl.scrollTop;
    for (const item of visibleItems) {
      if (item.end > scrollTop) {
        return getFilePath(diff.files[item.index]);
      }
    }

    return getFilePath(diff.files[visibleItems[0].index]);
  }, [virtualizer, diff.files]);

  const handleScroll = useCallback(() => {
    if (scrollElementRef.current) {
      onScrollTopChange?.(scrollElementRef.current.scrollTop);
    }
    if (!onActiveFileChange) {
      return;
    }

    const topFile = getTopVisibleFile();
    if (!topFile) {
      return;
    }

    if (scrollTargetRef.current) {
      if (topFile === scrollTargetRef.current) {
        scrollTargetRef.current = null;
      }
      return;
    }

    onActiveFileChange(topFile);
  }, [getTopVisibleFile, onActiveFileChange, onScrollTopChange]);

  const items = virtualizer.getVirtualItems();
  const [paddingTop, paddingBottom] = items.length > 0
    ? [
        items[0].start - scrollMargin,
        virtualizer.getTotalSize() - (items[items.length - 1].end - scrollMargin),
      ]
    : [0, 0];

  return (
    <main
      ref={(node) => {
        scrollElementRef.current = node;
        if (scrollRef) {
          scrollRef(node);
        }
      }}
      onScroll={handleScroll}
      className="flex-1 overflow-y-auto pb-12"
    >
      <div ref={headerRef} className="flex flex-col gap-4 px-5 pt-4 empty:hidden">
        {baseRef && <DiffContextHeader diffRef={baseRef} />}
        {stillHeldBack.length > 0 && <LargeDiffNotice files={stillHeldBack} />}
      {commentsEnabled && (
        <>
          <GeneralComments
            threads={threads}
            commentActions={commentActions}
          />
          <OutsideThreads
            threads={outsideThreads}
            commentActions={commentActions}
            className="rounded-lg border border-border"
          />
        </>
      )}
      </div>
      <div className="pt-4">
      <div style={{ paddingTop, paddingBottom }}>
        {items.map((virtualItem) => {
          const file = diff.files[virtualItem.index];
          const filePath = getFilePath(file);
          return (
            <div
              key={filePath + '-' + virtualItem.index}
              data-index={virtualItem.index}
              ref={virtualizer.measureElement}
              className="px-5 pb-4"
            >
              <FileBlock
                highlighted={highlightedFile === filePath}
                onHighlightEnd={handleHighlightEnd}
                hideWhitespace={hideWhitespace}
                file={file}
                viewMode={viewMode}
                collapsed={collapsedFiles.has(filePath)}
                onToggleCollapse={onToggleCollapse}
                reviewed={reviewedFiles.has(filePath)}
                onReviewedChange={onReviewedChange}
                highlightLine={highlighters.get(filePath)}
                baseRef={baseRef}
                canRevert={canRevert}
                onRevert={onRevert}
                threads={threads}
                commentsEnabled={commentsEnabled}
                commentActions={commentActions}
                onAddThread={onAddThread}
                pendingSelection={pendingSelection}
                onPendingSelectionChange={onPendingSelectionChange}
              />
            </div>
          );
        })}
      </div>
      </div>
    </main>
  );
}
