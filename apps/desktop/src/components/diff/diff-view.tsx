import { useMemo, useRef, useState, useCallback, useImperativeHandle, useEffect } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import type { ParsedDiff } from '@diffity/parser';
import { FileBlock, LARGE_DIFF_LINE_THRESHOLD } from './file-block';
import { GeneralComments } from '../comments/general-comments';
import { useHighlighter } from '../../hooks/use-highlighter';
import { type ViewMode, getFilePath } from '../../lib/diff-utils';
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
const LINE_HEIGHT = 24;
const HUNK_HEADER_HEIGHT = 32;
const FILE_BLOCK_PADDING = 16;

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
}

function estimateFileHeight(file: { hunks: { lines: { length: number } }[]; isBinary: boolean }, collapsed: boolean): number {
  if (collapsed) {
    return FILE_HEADER_HEIGHT;
  }
  if (file.isBinary || file.hunks.length === 0) {
    return EMPTY_CONTENT_HEIGHT;
  }
  let lineCount = 0;
  for (const hunk of file.hunks) {
    lineCount += hunk.lines.length;
  }
  if (lineCount >= LARGE_DIFF_LINE_THRESHOLD) {
    return EMPTY_CONTENT_HEIGHT;
  }
  return FILE_HEADER_HEIGHT + lineCount * LINE_HEIGHT + file.hunks.length * HUNK_HEADER_HEIGHT + FILE_BLOCK_PADDING;
}

export function DiffView(props: DiffViewProps) {
  const {
    diff, viewMode, theme, collapsedFiles, onToggleCollapse,
    reviewedFiles, onReviewedChange, onActiveFileChange, scrollRef,
    handle, baseRef, canRevert, onRevert,
    threads, commentsEnabled, commentActions, onAddThread,
    pendingSelection, onPendingSelectionChange,
  } = props;
  const { highlight } = useHighlighter();
  const scrollElementRef = useRef<HTMLElement>(null);

  const highlighters = useMemo(() => {
    const map = new Map<string, (code: string) => ReturnType<typeof highlight>>();
    for (const file of diff.files) {
      const filePath = getFilePath(file);
      map.set(filePath, (code: string) => highlight(code, filePath, theme));
    }
    return map;
  }, [diff, highlight, theme]);

  const virtualizer = useVirtualizer({
    count: diff.files.length,
    getScrollElement: () => scrollElementRef.current,
    estimateSize: (index) => estimateFileHeight(diff.files[index], collapsedFiles.has(getFilePath(diff.files[index]))),
    overscan: VIRTUALIZER_OVERSCAN,
  });

  const scrollTargetRef = useRef<string | null>(null);
  const [highlightedFile, setHighlightedFile] = useState<string | null>(null);

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
        setPendingThreadScroll(threadId);
      }
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
  }, [getTopVisibleFile, onActiveFileChange]);

  const items = virtualizer.getVirtualItems();
  const [paddingTop, paddingBottom] = items.length > 0
    ? [
        items[0].start,
        virtualizer.getTotalSize() - items[items.length - 1].end,
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
      {commentsEnabled && (
        <GeneralComments
          threads={threads}
          commentActions={commentActions}
        />
      )}
      <div className="py-2" style={{ paddingTop, paddingBottom }}>
        {items.map((virtualItem) => {
          const file = diff.files[virtualItem.index];
          const filePath = getFilePath(file);
          return (
            <div
              key={filePath + '-' + virtualItem.index}
              data-index={virtualItem.index}
              ref={virtualizer.measureElement}
            >
              <FileBlock
                highlighted={highlightedFile === filePath}
                onHighlightEnd={() => {
                  if (highlightedFile === filePath) {
                    setHighlightedFile(null);
                  }
                }}
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
    </main>
  );
}
