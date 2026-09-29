import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useLocation, useNavigate, useSearchParams } from 'react-router';
import { toast } from 'sonner';
import { useDiff } from '../../hooks/use-diff';
import { useInfo } from '../../hooks/use-info';
import { useTheme } from '../../hooks/use-theme';
import { useKeyboard } from '../../hooks/use-keyboard';
import { useReviewThreads } from '../../hooks/use-review-threads';
import { useCommentActions } from '../../hooks/use-comment-actions';
import { Toolbar, formatThreadsForCopy } from '../layout/toolbar';
import { CommentToolbarActions } from '../comments/comment-toolbar-actions';
import { DiffView, type DiffViewHandle } from './diff-view';
import { Sidebar } from '../layout/sidebar';
import { DiffSkeleton, hideStaticSplash } from '../layout/skeleton';
import { PrBar } from '../../features/pr/pr-bar';
import { StatusBar } from '../layout/status-bar';
import { DiffEmptyState } from './diff-empty-state';
import { openShortcuts } from '../../lib/ui-store';
import { useDiffStaleness } from '../../hooks/use-diff-staleness';
import { type ViewMode, getFilePath, getAutoCollapsedPaths } from '../../lib/diff-utils';
import { buildFirstOpenThreadByFile, buildThreadCountsByFile } from '../../lib/comment-navigation';
import { focusThreadElement, getHunkHeaders, scrollToElement } from '../../lib/dom-utils';
import { setFocusThread } from '../../lib/ui-store';
import { OutsideThreads } from '../comments/outside-threads';
import type { LineSelection } from '../comments/types';
import { DiffBar } from './view-options';
import { repoBase } from '../../hooks/use-repo';
import { getRepoPath } from '../../lib/api';
import { readViewMemory, writeViewMemory } from '../../lib/view-memory';
import { MovedComposer, selectionInDiff } from '../comments/moved-composer';
import { Workspace } from '../layout/title-bar';
import { ReviewStateProvider } from '../../features/review/review-state';
import { useViewedFiles } from '../../hooks/use-viewed-files';
import { useGitHubPr } from '../../hooks/use-repo-state';

interface DiffPageProps {
  diffRef: string;
}

export function DiffPage(props: DiffPageProps) {
  const { diffRef: refParam } = props;

  const [viewMode, setViewMode] = useState<ViewMode>(() => (localStorage.getItem('diffity-view-mode') as ViewMode | null) ?? 'split');
  const [hideWhitespace, setHideWhitespace] = useState(false);
  const { theme, toggleTheme } = useTheme();
  const { data: diff, error } = useDiff(hideWhitespace, refParam);
  const { data: info } = useInfo(refParam);
  const [activeFile, setActiveFile] = useState<string | null>(null);
  const [collapsedFiles, setCollapsedFiles] = useState<Set<string>>(new Set());
  const manuallyToggledRef = useRef<Set<string>>(new Set(readViewMemory<string[]>(refParam, 'toggled', [])));
  const [pendingSelection, setPendingSelection] = useState<LineSelection | null>(() => readViewMemory<LineSelection | null>(refParam, 'composer', null));
  const scrollRestoredRef = useRef(false);
  const location = useLocation();
  const navigate = useNavigate();
  const mainRef = useRef<HTMLElement | null>(null);
  const diffViewRef = useRef<DiffViewHandle>(null);
  const currentFileIdx = useRef(0);
  const initializedDiffRef = useRef<typeof diff>(null);

  const reviewsEnabled = !!info?.capabilities?.reviews;
  const sessionId = info?.sessionId ?? null;
  const canRevert = !!info?.capabilities?.revert;
  const { isStale, resetStaleness } = useDiffStaleness(refParam, !!info?.capabilities?.staleness);
  const { details: githubDetails } = useGitHubPr();
  const { reviewedFiles, setReviewed } = useViewedFiles(sessionId, diff);

  useEffect(() => {
    localStorage.setItem('diffity-view-mode', viewMode);
  }, [viewMode]);

  useEffect(() => {
    hideStaticSplash();
  }, []);

  useEffect(() => {
    writeViewMemory(refParam, 'composer', pendingSelection);
  }, [refParam, pendingSelection]);

  useEffect(() => {
    const fresh = (location.state as { fresh?: boolean } | null)?.fresh;
    if (!fresh || !diff) {
      return;
    }
    if (diff.files.length === 0 && refParam === 'work') {
      navigate(`${repoBase(getRepoPath())}/overview`, { replace: true });
      return;
    }
    navigate(`${location.pathname}${location.search}`, { replace: true, state: null });
  }, [location, diff, refParam, navigate]);

  const { data: serverThreads, isFetched: threadsFetched } = useReviewThreads(reviewsEnabled ? sessionId : null);
  const threads = reviewsEnabled && serverThreads ? serverThreads : [];
  const commentActions = useCommentActions(sessionId, reviewsEnabled);
  const commentCountsByFile = useMemo(() => buildThreadCountsByFile(threads), [threads]);

  const filesWithComments = useMemo(() => {
    return new Set(commentCountsByFile.keys());
  }, [commentCountsByFile]);

  const firstOpenThreadByFile = useMemo(() => {
    const fileOrder = diff?.files.map(file => getFilePath(file)) ?? [];
    return buildFirstOpenThreadByFile(threads, fileOrder);
  }, [diff, threads]);

  const handleAddThread = useCallback((...args: Parameters<typeof commentActions.addThread>) => {
    commentActions.addThread(...args);
    setPendingSelection(null);
  }, [commentActions]);

  useEffect(() => {
    if (!diff || diff === initializedDiffRef.current) {
      return;
    }
    initializedDiffRef.current = diff;

    const autoCollapsed = getAutoCollapsedPaths(diff.files);
    for (const path of filesWithComments) {
      autoCollapsed.delete(path);
    }
    for (const path of manuallyToggledRef.current) {
      if (autoCollapsed.has(path)) {
        autoCollapsed.delete(path);
      } else {
        autoCollapsed.add(path);
      }
    }
    setCollapsedFiles(autoCollapsed);
  }, [diff]);

  useEffect(() => {
    if (filesWithComments.size === 0) {
      return;
    }
    setCollapsedFiles((prev) => {
      let changed = false;
      const next = new Set(prev);
      for (const path of filesWithComments) {
        if (next.has(path)) {
          next.delete(path);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [filesWithComments]);

  const handleToggleCollapse = useCallback((path: string) => {
    const toggled = manuallyToggledRef.current;
    if (toggled.has(path)) {
      toggled.delete(path);
    } else {
      toggled.add(path);
    }
    writeViewMemory(refParam, 'toggled', [...toggled]);
    setCollapsedFiles((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  }, []);

  const handleReviewedChange = useCallback((path: string, reviewed: boolean) => {
    setReviewed(path, reviewed);
    if (reviewed) {
      setCollapsedFiles((prev) => {
        const next = new Set(prev);
        next.add(path);
        return next;
      });
    } else {
      setCollapsedFiles((prev) => {
        const next = new Set(prev);
        next.delete(path);
        return next;
      });
    }
  }, [setReviewed]);

  const getCurrentFilePath = useCallback((): string | null => {
    if (!diff) {
      return null;
    }
    return getFilePath(diff.files[currentFileIdx.current]);
  }, [diff]);

  const navigateFile = useCallback((direction: number) => {
    if (!diff) {
      return;
    }
    const nextIdx = Math.max(0, Math.min(diff.files.length - 1, currentFileIdx.current + direction));
    currentFileIdx.current = nextIdx;
    const path = getFilePath(diff.files[nextIdx]);
    diffViewRef.current?.scrollToFile(path);
  }, [diff]);

  const navigateHunk = useCallback((direction: number) => {
    const hunks = getHunkHeaders();
    if (hunks.length === 0) {
      return;
    }
    let target = direction > 0 ? hunks[0] : hunks[hunks.length - 1];

    for (let i = 0; i < hunks.length; i++) {
      const rect = hunks[i].getBoundingClientRect();
      if (direction > 0 && rect.top > 100) {
        target = hunks[i];
        break;
      }
      if (direction < 0 && rect.top < -10) {
        target = hunks[i];
      }
    }

    scrollToElement(target);
  }, []);

  useKeyboard({
    onNextFile: () => navigateFile(1),
    onPrevFile: () => navigateFile(-1),
    onNextHunk: () => navigateHunk(1),
    onPrevHunk: () => navigateHunk(-1),
    onToggleCollapse: () => {
      const path = getCurrentFilePath();
      if (path) {
        handleToggleCollapse(path);
      }
    },
    onCollapseAll: () => {
      if (!diff) {
        return;
      }
      const allPaths = diff.files.map((f) => getFilePath(f));
      const anyExpanded = allPaths.some((p) => !collapsedFiles.has(p));
      manuallyToggledRef.current = new Set();
      if (anyExpanded) {
        setCollapsedFiles(new Set(allPaths));
      } else {
        setCollapsedFiles(new Set());
      }
    },
    onToggleReviewed: () => {
      const path = getCurrentFilePath();
      if (!path) {
        return;
      }
      const wasReviewed = reviewedFiles.has(path);
      handleReviewedChange(path, !wasReviewed);
      if (!wasReviewed) {
        navigateFile(1);
      }
    },
    onUnifiedView: () => setViewMode('unified'),
    onSplitView: () => setViewMode('split'),
    onFocusSearch: () => {
      const input = document.querySelector(
        'input[placeholder="Filter files"]',
      ) as HTMLInputElement;
      if (input) {
        input.focus();
      }
    },
    onEscape: () => undefined,
  });

  const queryClient = useQueryClient();

  const handleRevert = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['diff'] });
  }, [queryClient]);

  const handleRefreshDiff = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['diff'] });
    resetStaleness();
  }, [queryClient, resetStaleness]);

  const composing = pendingSelection !== null;
  useEffect(() => {
    if (!isStale || composing) {
      return;
    }
    const timer = window.setTimeout(handleRefreshDiff, 400);
    return () => window.clearTimeout(timer);
  }, [isStale, composing, handleRefreshDiff]);

  useEffect(() => {
    if (scrollRestoredRef.current || !diff || diff.files.length === 0) {
      return;
    }
    scrollRestoredRef.current = true;
    const saved = readViewMemory<string | null>(refParam, 'anchor', null);
    if (!saved || saved === getFilePath(diff.files[0]) || !diff.files.some((file) => getFilePath(file) === saved)) {
      return;
    }
    requestAnimationFrame(() => diffViewRef.current?.scrollToFile(saved));
  }, [diff, refParam]);

  const handleSidebarFileClick = useCallback((path: string) => {
    setActiveFile(path);
    diffViewRef.current?.scrollToFile(path);
  }, []);

  const handleScrollToThread = useCallback((threadId: string, filePath: string) => {
    setActiveFile(filePath);
    setCollapsedFiles((prev) => {
      if (!prev.has(filePath)) {
        return prev;
      }
      const next = new Set(prev);
      next.delete(filePath);
      return next;
    });
    diffViewRef.current?.scrollToThread(threadId, filePath);
  }, []);

  const [searchParams, setSearchParams] = useSearchParams();
  const targetThreadId = searchParams.get('thread');
  const targetFile = searchParams.get('file');

  useEffect(() => {
    if (!targetThreadId && !targetFile) {
      return;
    }
    if (!diff || (reviewsEnabled && !threadsFetched)) {
      return;
    }
    const next = new URLSearchParams(searchParams);
    next.delete('thread');
    next.delete('file');
    setSearchParams(next, { replace: true });

    if (!targetThreadId && targetFile) {
      requestAnimationFrame(() => diffViewRef.current?.scrollToFile(targetFile));
      return;
    }
    const thread = threads.find((item) => item.id === targetThreadId);
    if (!thread) {
      toast.info('That comment no longer exists');
      return;
    }
    setFocusThread(thread.id);
    if (!diffViewRef.current) {
      focusThreadElement(thread.id);
      return;
    }
    requestAnimationFrame(() => handleScrollToThread(thread.id, thread.filePath));
  }, [targetThreadId, targetFile, diff, threads, threadsFetched, reviewsEnabled, searchParams, setSearchParams, handleScrollToThread]);

  const handleSidebarCommentedFileClick = useCallback((path: string) => {
    const threadId = firstOpenThreadByFile.get(path);
    if (!threadId) {
      handleSidebarFileClick(path);
      return;
    }
    handleScrollToThread(threadId, path);
  }, [firstOpenThreadByFile, handleSidebarFileClick, handleScrollToThread]);

  const handleActiveFileFromScroll = useCallback((path: string) => {
    setActiveFile(path);
    writeViewMemory(refParam, 'anchor', path);
  }, [refParam]);

  if (error) {
    return (
      <div className="flex flex-col min-h-screen bg-bg text-text font-sans">
        <div className="flex flex-col items-center justify-center p-12 text-deleted text-center">
          <h2 className="text-xl mb-2">Failed to load diff</h2>
          <p className="text-text-secondary">{error}</p>
        </div>
      </div>
    );
  }

  const threadsLoading = reviewsEnabled && !threadsFetched;
  if (threadsLoading) {
    return <DiffSkeleton />;
  }

  const isEmpty = diff.files.length === 0;
  const composerMoved = pendingSelection !== null && !selectionInDiff(diff, pendingSelection);
  const allPaths = diff.files.map((file) => getFilePath(file));

  return (
    <ReviewStateProvider sessionId={reviewsEnabled ? sessionId : null} prMode={!!githubDetails}>
    <div className="flex flex-col h-screen bg-frame text-text font-sans">
      <Toolbar
        theme={theme}
        onToggleTheme={toggleTheme}
        onShowHelp={openShortcuts}
        diff={diff || undefined}
        diffRef={refParam}
        threads={threads}
        repoName={info?.name || null}
        branch={info?.branch || null}
        githubDetails={githubDetails}
        hasGitHubRemote={!!info?.github}
        sessionId={sessionId}
        focusedFile={activeFile}
      />
      <Workspace>
      <PrBar diffRef={refParam} threads={threads} />
      <div className="flex flex-1 min-h-0 overflow-hidden">
        <Sidebar
          files={diff.files}
          activeFile={isEmpty ? null : activeFile}
          reviewedFiles={reviewedFiles}
          commentCountsByFile={commentCountsByFile}
          onFileClick={handleSidebarFileClick}
          onCommentedFileClick={handleSidebarCommentedFileClick}
          stats={isEmpty ? undefined : diff.stats}
        />
        {isEmpty ? (
          <div className="flex flex-1 min-w-0 flex-col overflow-y-auto">
            {reviewsEnabled && (
              <OutsideThreads
                threads={threads}
                commentActions={commentActions}
                viewEmpty
                className="mx-auto mt-4 w-full max-w-2xl rounded-lg border border-border"
              />
            )}
            {composerMoved && pendingSelection && (
              <MovedComposer selection={pendingSelection} onSubmit={handleAddThread} onCancel={() => setPendingSelection(null)} />
            )}
            <DiffEmptyState
              diffRef={refParam}
              hideWhitespace={hideWhitespace}
              onShowWhitespace={() => setHideWhitespace(false)}
              branch={info?.branch || null}
            />
          </div>
        ) : (
          <div className="flex flex-1 min-w-0 flex-col">
            <DiffBar
              viewMode={viewMode}
              onViewModeChange={setViewMode}
              hideWhitespace={hideWhitespace}
              onHideWhitespaceChange={setHideWhitespace}
              fileCount={diff.files.length}
              viewedCount={allPaths.filter((path) => reviewedFiles.has(path)).length}
              onExpandAll={() => {
                manuallyToggledRef.current = new Set();
                setCollapsedFiles(new Set());
              }}
              onCollapseAll={() => {
                manuallyToggledRef.current = new Set();
                setCollapsedFiles(new Set(allPaths));
              }}
              commentNav={
                <CommentToolbarActions
                  threads={threads}
                  onScrollToThread={handleScrollToThread}
                  onDeleteAllComments={commentActions.deleteAllThreads}
                  formatForCopy={() => formatThreadsForCopy(threads, diff, refParam)}
                />
              }
            />
            {composerMoved && pendingSelection && (
              <MovedComposer selection={pendingSelection} onSubmit={handleAddThread} onCancel={() => setPendingSelection(null)} />
            )}
            <DiffView
              diff={diff}
              viewMode={viewMode}
              theme={theme}
              collapsedFiles={collapsedFiles}
              onToggleCollapse={handleToggleCollapse}
              reviewedFiles={reviewedFiles}
              onReviewedChange={handleReviewedChange}
              onActiveFileChange={handleActiveFileFromScroll}
              handle={diffViewRef}
              baseRef={refParam}
              canRevert={canRevert}
              onRevert={handleRevert}
              scrollRef={(node) => {
                mainRef.current = node;
              }}
              threads={threads}
              commentsEnabled={reviewsEnabled}
              commentActions={commentActions}
              onAddThread={handleAddThread}
              pendingSelection={pendingSelection}
              onPendingSelectionChange={setPendingSelection}
            />
          </div>
        )}
      </div>
      </Workspace>
      <StatusBar
        diffRef={refParam}
        sessionId={reviewsEnabled ? sessionId : null}
        stale={isStale ? { onRefresh: handleRefreshDiff } : null}
      />
    </div>
    </ReviewStateProvider>
  );
}
