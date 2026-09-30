import { useState, useCallback, useRef, useEffect, useLayoutEffect, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { DiffFile } from '@diffity/parser';
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
import { PrSession, openPrDetails, openPrOnGitHub } from '../../features/pr/pr-session';
import { syncPrCommentsNow } from '../../features/pr/pr-checkout';
import { StatusBar } from '../layout/status-bar';
import { DiffEmptyState } from './diff-empty-state';
import { openShortcuts } from '../../lib/ui-store';
import { useDiffStaleness } from '../../hooks/use-diff-staleness';
import { type ViewMode, getFilePath, getAutoCollapsedPaths } from '../../lib/diff-utils';
import { buildFirstOpenThreadByFile, buildThreadCountsByFile } from '../../lib/comment-navigation';
import { focusThreadElement, getHunkHeaders, scrollToElement } from '../../lib/dom-utils';
import { setFocusThread, useUi } from '../../lib/ui-store';
import { orderLikeSidebar } from '../../lib/file-tree';
import { contentsLabel, copyFileContents, copyFileDiff, copyRelativePath, handleCopyShortcut } from '../../lib/file-copy';
import { usePageActions, useViewFiles, type PaletteAction } from '../../features/palette/palette-store';
import { statusLetter } from '../tree/file-tree-item';
import { requestAskClaude } from '../../features/claude/ask-claude-review';
import { requestSendToClaude } from '../../features/review/finish-review';
import { OutsideThreads } from '../comments/outside-threads';
import type { CommentThread, LineSelection } from '../comments/types';
import { DiffBar } from './view-options';
import { repoBase } from '../../hooks/use-repo';
import { getRepoPath } from '../../lib/api';
import { enterLargeDiffScope } from '../../lib/large-diff';
import { readViewMemory, writeViewMemory } from '../../lib/view-memory';
import { readViewState, useViewState, writeViewState } from '../../lib/view-state';
import { MovedComposer, selectionInDiff } from '../comments/moved-composer';
import { Workspace } from '../layout/title-bar';
import { ReviewStateProvider } from '../../features/review/review-state';
import { useViewedFiles } from '../../hooks/use-viewed-files';
import { useGitHubPr, useOwnPr } from '../../hooks/use-repo-state';
import { prDiffRef } from '../layout/ref-menu';
import { openCommitDialog } from '../../features/pr/commit-dialog';
import { ChevronDownIcon, ChevronUpIcon, CollapseAllIcon, CopyIcon, ExpandAllIcon, EyeOffIcon, GitHubIcon, GitPullRequestIcon, PushIcon, RefreshIcon, SendIcon, SparkleIcon, SplitViewIcon, UnifiedViewIcon } from '../ui/icon';
import { shortcutHint } from '../../lib/shortcuts';

const NO_THREADS: CommentThread[] = [];

/** Collapsed unless toggled: generated, lock and very large files, except those with comments. */
function defaultCollapsed(files: DiffFile[], commented: Set<string>) {
  const paths = getAutoCollapsedPaths(files);
  for (const path of commented) {
    paths.delete(path);
  }
  return paths;
}

function collapsedFromToggles(files: DiffFile[], commented: Set<string>, toggled: Set<string>) {
  const collapsed = defaultCollapsed(files, commented);
  for (const path of toggled) {
    if (collapsed.has(path)) {
      collapsed.delete(path);
    } else {
      collapsed.add(path);
    }
  }
  return collapsed;
}

function togglesFromCollapsed(files: DiffFile[], commented: Set<string>, collapsed: Set<string>) {
  const byDefault = defaultCollapsed(files, commented);
  const toggled = new Set<string>();
  for (const file of files) {
    const path = getFilePath(file);
    if (byDefault.has(path) !== collapsed.has(path)) {
      toggled.add(path);
    }
  }
  return toggled;
}

interface DiffPageProps {
  diffRef: string;
}

export function DiffPage(props: DiffPageProps) {
  const { diffRef: refParam } = props;

  const [viewMode, setViewMode] = useState<ViewMode>(() => (localStorage.getItem('diffity-view-mode') as ViewMode | null) ?? 'split');
  const [hideWhitespace, setHideWhitespace] = useViewState(`diff:${refParam}:hideWhitespace`, false);
  const { theme, toggleTheme } = useTheme();
  const { data: rawDiff, error } = useDiff(hideWhitespace, refParam);
  useLayoutEffect(() => {
    enterLargeDiffScope(`${getRepoPath()}\u0000${refParam}`);
  }, [refParam]);
  const flat = useUi((state) => state.sidebarFlat);
  const diff = useMemo(() => (rawDiff ? { ...rawDiff, files: orderLikeSidebar(rawDiff.files, flat) } : rawDiff), [rawDiff, flat]);
  const { data: info } = useInfo(refParam);
  const [activeFile, setActiveFile] = useViewState<string | null>(`diff:${refParam}:activeFile`, null);
  const manuallyToggledRef = useRef<Set<string>>(new Set(readViewMemory<string[]>(refParam, 'toggled', [])));
  const [pendingSelection, setPendingSelection] = useState<LineSelection | null>(() => readViewMemory<LineSelection | null>(refParam, 'composer', null));
  const location = useLocation();
  const navigate = useNavigate();
  const mainRef = useRef<HTMLElement | null>(null);
  const diffViewRef = useRef<DiffViewHandle>(null);
  const currentFileIdx = useRef(0);

  const reviewsEnabled = !!info?.capabilities?.reviews;
  const sessionId = info?.sessionId ?? null;
  const { data: serverThreads, isFetched: threadsFetched } = useReviewThreads(reviewsEnabled ? sessionId : null);
  const threads = reviewsEnabled && serverThreads ? serverThreads : NO_THREADS;
  const commentCountsByFile = useMemo(() => buildThreadCountsByFile(threads), [threads]);
  const filesWithComments = useMemo(() => new Set(commentCountsByFile.keys()), [commentCountsByFile]);
  const [collapsedFiles, setCollapsedFiles] = useState<Set<string>>(() => collapsedFromToggles(diff?.files ?? [], filesWithComments, manuallyToggledRef.current));
  const initializedDiffRef = useRef<typeof diff>(diff);
  const commentedSeenRef = useRef(filesWithComments);
  const canRevert = !!info?.capabilities?.revert;
  const { isStale, resetStaleness } = useDiffStaleness(refParam, !!info?.capabilities?.staleness);
  const { details: githubDetails } = useGitHubPr();
  const ownPr = useOwnPr();
  const { reviewedFiles, setReviewed, loading: viewedLoading } = useViewedFiles(sessionId, diff);

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

  const rawCommentActions = useCommentActions(sessionId, reviewsEnabled);
  const commentActions = useMemo(() => rawCommentActions, Object.values(rawCommentActions));

  const firstOpenThreadByFile = useMemo(() => {
    const fileOrder = diff?.files.map(file => getFilePath(file)) ?? [];
    return buildFirstOpenThreadByFile(threads, fileOrder);
  }, [diff, threads]);

  const handleAddThread = useCallback((...args: Parameters<typeof commentActions.addThread>) => {
    commentActions.addThread(...args);
    setPendingSelection(null);
  }, [commentActions]);

  useLayoutEffect(() => {
    if (!diff || diff === initializedDiffRef.current) {
      return;
    }
    initializedDiffRef.current = diff;
    setCollapsedFiles(collapsedFromToggles(diff.files, filesWithComments, manuallyToggledRef.current));
  }, [diff]);

  useLayoutEffect(() => {
    const seen = commentedSeenRef.current;
    commentedSeenRef.current = filesWithComments;
    const added = [...filesWithComments].filter((path) => !seen.has(path));
    if (added.length === 0) {
      return;
    }
    setCollapsedFiles((prev) => {
      if (!added.some((path) => prev.has(path))) {
        return prev;
      }
      const next = new Set(prev);
      for (const path of added) {
        next.delete(path);
      }
      return next;
    });
  }, [filesWithComments]);

  useEffect(() => {
    if (!diff) {
      return;
    }
    const toggled = togglesFromCollapsed(diff.files, commentedSeenRef.current, collapsedFiles);
    manuallyToggledRef.current = toggled;
    writeViewMemory(refParam, 'toggled', toggled.size > 0 ? [...toggled] : null);
  }, [collapsedFiles]);

  const handleToggleCollapse = useCallback((path: string) => {
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

  const initialScrollTop = useMemo(() => readViewState<number | undefined>(`diff:${refParam}:scrollTop`, undefined) ?? readViewMemory<number>(refParam, 'scrollTop', 0), [refParam]);
  const scrollSaveTimer = useRef<number | null>(null);
  const handleScrollTop = useCallback((top: number) => {
    writeViewState(`diff:${refParam}:scrollTop`, top);
    if (scrollSaveTimer.current) {
      window.clearTimeout(scrollSaveTimer.current);
    }
    scrollSaveTimer.current = window.setTimeout(() => writeViewMemory(refParam, 'scrollTop', Math.round(top)), 150);
  }, [refParam]);

  useEffect(() => () => {
    if (scrollSaveTimer.current) {
      window.clearTimeout(scrollSaveTimer.current);
    }
  }, []);

  const handleSidebarFileClick = useCallback((path: string) => {
    setActiveFile(path);
    diffViewRef.current?.scrollToFile(path);
  }, [setActiveFile]);

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

  const paletteFiles = useMemo(() => diff ? diff.files.map((file) => {
    const path = getFilePath(file);
    return {
      path,
      status: statusLetter(file.status).letter,
      additions: file.additions,
      deletions: file.deletions,
      comments: commentCountsByFile.get(path) ?? 0,
      viewed: reviewedFiles.has(path),
    };
  }) : null, [diff, commentCountsByFile, reviewedFiles]);
  useViewFiles(paletteFiles, handleSidebarFileClick);

  const paletteActions = useMemo<PaletteAction[]>(() => {
    const list: PaletteAction[] = [
      { id: 'view-unified', title: 'Unified diff', group: 'View', hint: shortcutHint('view-unified'), icon: <UnifiedViewIcon size="sm" />, run: () => setViewMode('unified') },
      { id: 'view-split', title: 'Split diff', group: 'View', hint: shortcutHint('view-split'), icon: <SplitViewIcon size="sm" />, run: () => setViewMode('split') },
      { id: 'view-whitespace', title: hideWhitespace ? 'Show whitespace changes' : 'Hide whitespace changes', group: 'View', icon: <EyeOffIcon size="sm" />, run: () => setHideWhitespace(!hideWhitespace) },
      { id: 'view-collapse', title: 'Collapse all files', group: 'View', hint: shortcutHint('view-collapse'), icon: <CollapseAllIcon size="sm" />, run: () => setCollapsedFiles(new Set(diff?.files.map((file) => getFilePath(file)) ?? [])) },
      { id: 'view-expand', title: 'Expand all files', group: 'View', icon: <ExpandAllIcon size="sm" />, run: () => setCollapsedFiles(new Set()) },
      { id: 'file-next', title: 'Next file', group: 'View', hint: shortcutHint('file-next'), keywords: 'down', icon: <ChevronDownIcon size="sm" />, run: () => navigateFile(1) },
      { id: 'file-prev', title: 'Previous file', group: 'View', hint: shortcutHint('file-prev'), keywords: 'up', icon: <ChevronUpIcon size="sm" />, run: () => navigateFile(-1) },
      { id: 'claude-review', title: 'Ask Claude to review…', group: 'Actions', keywords: 'ai review', icon: <SparkleIcon size="sm" className="text-claude" />, run: () => requestAskClaude(refParam) },
      { id: 'claude-send', title: 'Send comments to Claude…', group: 'Actions', keywords: 'ai resolve fix', icon: <SendIcon size="sm" className="text-claude" />, run: requestSendToClaude },
    ];
    if (activeFile) {
      const file = diff?.files.find((item) => getFilePath(item) === activeFile);
      list.push(
        { id: 'copy-path', title: `Copy path of ${activeFile.split('/').pop()}`, group: 'Actions', hint: shortcutHint('copy-path'), icon: <CopyIcon size="sm" />, run: () => copyRelativePath(activeFile) },
        { id: 'copy-contents', title: `${contentsLabel(refParam)} of ${activeFile.split('/').pop()}`, group: 'Actions', hint: shortcutHint('copy-contents'), icon: <CopyIcon size="sm" />, run: () => void copyFileContents(activeFile, refParam) },
      );
      if (file) {
        list.push({ id: 'copy-diff', title: `Copy diff of ${activeFile.split('/').pop()}`, group: 'Actions', icon: <CopyIcon size="sm" />, run: () => copyFileDiff(file) });
      }
    }
    if (githubDetails && refParam === prDiffRef(githubDetails)) {
      const pr = githubDetails.pr;
      list.push(
        { id: 'pr-details', title: `Pull request #${pr.number} details`, group: 'Actions', keywords: 'pr description checks branches', icon: <GitPullRequestIcon size="sm" />, run: openPrDetails },
        { id: 'pr-github', title: `Open PR #${pr.number} on GitHub`, group: 'Actions', keywords: 'pull request browser', icon: <GitHubIcon size="sm" />, run: () => openPrOnGitHub(pr) },
        { id: 'pr-sync', title: 'Sync PR comments now', group: 'Actions', keywords: 'pull github review threads refresh', icon: <RefreshIcon size="sm" />, run: () => void syncPrCommentsNow(getRepoPath(), pr) },
      );
    }
    if (ownPr && githubDetails) {
      list.push({ id: 'commit-push', title: `Commit & push to PR #${githubDetails.prNumber}`, group: 'Actions', icon: <PushIcon size="sm" />, run: () => openCommitDialog(githubDetails.prNumber) });
    }
    return list;
  }, [hideWhitespace, diff, navigateFile, refParam, ownPr, githubDetails, activeFile]);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      handleCopyShortcut(event, activeFile, refParam);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [activeFile, refParam]);
  usePageActions('diff', paletteActions);

  const handleActiveFileFromScroll = useCallback((path: string) => {
    setActiveFile(path);
  }, [setActiveFile]);

  useEffect(() => {
    if (!diff || !activeFile) {
      return;
    }
    const index = diff.files.findIndex((file) => getFilePath(file) === activeFile);
    if (index >= 0) {
      currentFileIdx.current = index;
    }
  }, [diff, activeFile]);

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
  if (threadsLoading || viewedLoading) {
    return <DiffSkeleton />;
  }

  const isEmpty = diff.files.length === 0;
  const composerMoved = pendingSelection !== null && !selectionInDiff(diff, pendingSelection);
  const allPaths = diff.files.map((file) => getFilePath(file));

  return (
    <ReviewStateProvider sessionId={reviewsEnabled ? sessionId : null} prMode={!!githubDetails && !ownPr} ownPrNumber={ownPr && githubDetails && refParam === prDiffRef(githubDetails) ? githubDetails.prNumber : null}>
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
      <PrSession diffRef={refParam} threads={threads} />
      <div className="flex flex-1 min-h-0 overflow-hidden">
        <Sidebar
          files={diff.files}
          activeFile={isEmpty ? null : activeFile}
          reviewedFiles={reviewedFiles}
          commentCountsByFile={commentCountsByFile}
          onFileClick={handleSidebarFileClick}
          onCommentedFileClick={handleSidebarCommentedFileClick}
          stats={isEmpty ? undefined : diff.stats}
          stateKey={`diff:${refParam}:sidebar`}
        />
        {isEmpty ? (
          <div className="flex flex-1 min-w-0 flex-col overflow-y-auto">
            <DiffEmptyState
              diffRef={refParam}
              hideWhitespace={hideWhitespace}
              onShowWhitespace={() => setHideWhitespace(false)}
              branch={info?.branch || null}
            />
            {reviewsEnabled && (
              <OutsideThreads
                threads={threads}
                commentActions={commentActions}
                viewEmpty
                className="mx-auto mt-8 mb-10 w-full max-w-[760px] px-6"
              />
            )}
            {composerMoved && pendingSelection && (
              <MovedComposer selection={pendingSelection} onSubmit={handleAddThread} onCancel={() => setPendingSelection(null)} />
            )}
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
              onExpandAll={() => setCollapsedFiles(new Set())}
              onCollapseAll={() => setCollapsedFiles(new Set(allPaths))}
              commentNav={
                <CommentToolbarActions
                  threads={threads}
                  onScrollToThread={handleScrollToThread}
                  onDeleteAllComments={commentActions.deleteAllThreads}
                  formatForCopy={() => formatThreadsForCopy(threads, diff, refParam)}
                  extras={false}
                />
              }
              comments={{
                count: threads.length,
                formatForCopy: () => formatThreadsForCopy(threads, diff, refParam),
                onDeleteAll: commentActions.deleteAllThreads,
              }}
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
              initialScrollTop={initialScrollTop}
              onScrollTopChange={handleScrollTop}
              hideWhitespace={hideWhitespace}
              memoryKey={`diff:${refParam}:${hideWhitespace}`}
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
