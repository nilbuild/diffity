import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { useLoaderData, useNavigate } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useDiff } from '../../hooks/use-diff';
import { useInfo } from '../../hooks/use-info';
import { useTheme } from '../../hooks/use-theme';
import { useKeyboard } from '../../hooks/use-keyboard';
import { useReviewThreads } from '../../hooks/use-review-threads';
import { useCommentActions } from '../../hooks/use-comment-actions';
import { Toolbar } from '../layout/toolbar';
import { DiffView, type DiffViewHandle } from './diff-view';
import { Sidebar } from '../layout/sidebar';
import { ShortcutModal } from '../layout/shortcut-modal';
import { StaleDiffBanner } from '../layout/stale-diff-banner';
import { CheckCircleIcon } from '../icons/check-circle-icon';
import { PageLoader } from '../layout/skeleton';
import { useDiffStaleness } from '../../hooks/use-diff-staleness';
import { type ViewMode, getFilePath, getAutoCollapsedPaths } from '../../lib/diff-utils';
import { buildFirstOpenThreadByFile, buildThreadCountsByFile } from '../../lib/comment-navigation';
import { getHunkHeaders, scrollToElement } from '../../lib/dom-utils';
import { fetchGitHubDetails, type GitHubDetails } from '../../lib/api';
import type { LineSelection } from '../comments/types';
import { isThreadResolved } from '../comments/types';
import { TourPanel } from '../tree/tour-panel';
import { tourOptions } from '../../queries/tree';

interface DiffPageProps {
  tourId?: string;
  tourStepIndex?: number;
  initialRef?: string;
}

export function DiffPage(props: DiffPageProps = {}) {
  const { ref: refParam, theme: initialTheme, view: initialViewMode } = useLoaderData<{
    ref: string;
    theme: 'light' | 'dark' | null;
    view: 'split' | 'unified' | null;
  }>();
  const activeRef = props.initialRef ?? refParam;
  const navigate = useNavigate();

  const [viewMode, setViewMode] = useState<ViewMode>(initialViewMode || 'split');
  const [hideWhitespace, setHideWhitespace] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const { theme, toggleTheme } = useTheme(initialTheme);
  const { data: diff, error } = useDiff(hideWhitespace, activeRef);
  const { data: info } = useInfo(activeRef);
  const [activeFile, setActiveFile] = useState<string | null>(null);
  const [reviewedFiles, setReviewedFiles] = useState<Set<string>>(new Set());
  const [collapsedFiles, setCollapsedFiles] = useState<Set<string>>(new Set());
  const manuallyToggledRef = useRef<Set<string>>(new Set());
  const [pendingSelection, setPendingSelection] = useState<LineSelection | null>(null);
  const mainRef = useRef<HTMLElement | null>(null);
  const diffViewRef = useRef<DiffViewHandle>(null);
  const currentFileIdx = useRef(0);
  const initializedDiffRef = useRef<typeof diff>(null);
  const tourStepIndex = props.tourStepIndex ?? 0;
  const [tourOverrideHighlight, setTourOverrideHighlight] = useState<LineSelection | null>(null);
  const { data: tourData } = useQuery({
    ...tourOptions(props.tourId!),
    enabled: !!props.tourId,
  });
  const currentTourStep = tourStepIndex > 0 ? tourData?.steps[tourStepIndex - 1] : undefined;
  const tourHighlight = useMemo<LineSelection | null>(() => {
    if (!currentTourStep) {
      return null;
    }
    return tourOverrideHighlight ?? {
      filePath: currentTourStep.filePath,
      side: currentTourStep.side,
      startLine: currentTourStep.startLine,
      endLine: currentTourStep.endLine,
    };
  }, [currentTourStep, tourOverrideHighlight]);

  const reviewsEnabled = !!info?.capabilities?.reviews;
  const sessionId = info?.sessionId ?? null;
  const canRevert = !!info?.capabilities?.revert;
  const { isStale, resetStaleness } = useDiffStaleness(refParam, !!info?.capabilities?.staleness);
  const [githubDetails, setGithubDetails] = useState<GitHubDetails | null>(null);

  useEffect(() => {
    if (!info?.github) {
      return;
    }
    fetchGitHubDetails()
      .then(data => setGithubDetails(data))
      .catch(() => {});
  }, [info?.github]);

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
    setTourOverrideHighlight(null);
  }, [props.tourId, tourStepIndex]);

  useEffect(() => {
    if (!tourHighlight) {
      return;
    }
    setActiveFile(tourHighlight.filePath);
    setCollapsedFiles((previous) => {
      if (!previous.has(tourHighlight.filePath)) {
        return previous;
      }
      const next = new Set(previous);
      next.delete(tourHighlight.filePath);
      return next;
    });
    requestAnimationFrame(() => {
      diffViewRef.current?.scrollToLine(
        tourHighlight.filePath,
        tourHighlight.side,
        tourHighlight.startLine,
      );
    });
  }, [tourHighlight]);

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
    setReviewedFiles((prev) => {
      const next = new Set(prev);
      if (reviewed) {
        next.add(path);
      } else {
        next.delete(path);
      }
      return next;
    });
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
  }, []);

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
    onShowHelp: () => setShowHelp(true),
    onFocusSearch: () => {
      const input = document.querySelector(
        'input[placeholder="Filter files..."]',
      ) as HTMLInputElement;
      if (input) {
        input.focus();
      }
    },
    onEscape: () => setShowHelp(false),
  });

  const queryClient = useQueryClient();

  const handleRevert = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['diff'] });
  }, [queryClient]);

  const handleRefreshDiff = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['diff'] });
    resetStaleness();
  }, [queryClient, resetStaleness]);

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
  }, []);

  const handleTourStepChange = useCallback((index: number) => {
    if (props.tourId) {
      navigate(`/tour/${props.tourId}/${index}`);
    }
  }, [navigate, props.tourId]);

  const handleTourClose = useCallback(() => {
    navigate(`/diff?ref=${encodeURIComponent(activeRef)}`);
  }, [activeRef, navigate]);

  const handleTourFileLine = useCallback((path: string, startLine: number, endLine: number) => {
    const side = currentTourStep?.side ?? 'new';
    setTourOverrideHighlight({ filePath: path, side, startLine, endLine });
    diffViewRef.current?.scrollToLine(path, side, startLine);
  }, [currentTourStep]);

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
    return <PageLoader />;
  }

  if (diff.files.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-bg text-text font-sans gap-2">
        <div className="text-added opacity-40 mb-1">
          <CheckCircleIcon />
        </div>
        <h2 className="text-base font-medium text-text-secondary">No changes found</h2>
        <p className="text-xs text-text-muted">There are no differences to display.</p>
        <div className="mt-4 flex flex-col gap-1.5 items-center">
          <p className="text-xs text-text-muted mb-1">Try one of these</p>
          <code className="inline-block px-3 py-1 bg-bg-secondary border border-border rounded-md font-mono text-xs text-text">
            diffity HEAD~1
          </code>
          <code className="inline-block px-3 py-1 bg-bg-secondary border border-border rounded-md font-mono text-xs text-text">
            diffity main..feature
          </code>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-bg text-text font-sans">
      <Toolbar
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        hideWhitespace={hideWhitespace}
        onHideWhitespaceChange={setHideWhitespace}
        theme={theme}
        onToggleTheme={toggleTheme}
        onShowHelp={() => setShowHelp(true)}
        diff={diff || undefined}
        diffRef={activeRef}
        threads={threads}
        onDeleteAllComments={commentActions.deleteAllThreads}
        onScrollToThread={handleScrollToThread}
        repoName={info?.name || null}
        branch={info?.branch || null}
        description={info?.description || null}
        githubDetails={githubDetails}
        sessionId={sessionId}
        onGitHubPulled={() => queryClient.invalidateQueries({ queryKey: ['threads'] })}
      />
      {isStale && <StaleDiffBanner onRefresh={handleRefreshDiff} />}
      <div className="flex flex-1 overflow-hidden">
        <Sidebar
          files={diff?.files || []}
          activeFile={activeFile}
          reviewedFiles={reviewedFiles}
          commentCountsByFile={commentCountsByFile}
          onFileClick={handleSidebarFileClick}
          onCommentedFileClick={handleSidebarCommentedFileClick}
        />
        {diff ? (
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
            tourHighlight={tourHighlight}
            onPendingSelectionChange={setPendingSelection}
          />
        ) : null}
        {tourData && props.tourId && (
          <TourPanel
            tour={tourData}
            currentStepIndex={tourStepIndex}
            onStepChange={handleTourStepChange}
            onClose={handleTourClose}
            onNavigateToFile={handleSidebarFileClick}
            onNavigateToFileLine={handleTourFileLine}
            onScrollToHighlight={() => {
              if (tourHighlight) {
                diffViewRef.current?.scrollToLine(
                  tourHighlight.filePath,
                  tourHighlight.side,
                  tourHighlight.startLine,
                );
              }
            }}
            onSubHighlight={(startLine, endLine) => {
              if (tourHighlight) {
                setTourOverrideHighlight({ ...tourHighlight, startLine, endLine });
              }
            }}
            filePaths={diff.files.map((file) => getFilePath(file))}
          />
        )}
      </div>
      {showHelp && <ShortcutModal onClose={() => setShowHelp(false)} />}
    </div>
  );
}
