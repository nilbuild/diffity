import { useState, useCallback, useRef, useEffect, useLayoutEffect, useMemo } from 'react';
import { SuggestionTargetContext } from '../../features/suggestions/suggestion-block';
import { useQueries, useQueryClient } from '@tanstack/react-query';
import type { DiffFile } from '@/lib/diff-parser';
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
import { type ViewMode, getFilePath, getAutoCollapsedPaths, deferReason } from '../../lib/diff-utils';
import { buildFirstOpenThreadByFile, buildThreadCountsByFile } from '../../lib/comment-navigation';
import { focusFileElement, focusThreadElement } from '../../lib/dom-utils';
import { setFocusThread, useUi } from '../../lib/ui-store';
import { orderLikeSidebar } from '../../lib/file-tree';
import { contentsLabel, copyFileContents, copyFileDiff, copyRelativePath, handleCopyShortcut } from '../../lib/file-copy';
import { usePageActions, useViewFiles, type PaletteAction } from '../../features/palette/palette-store';
import { statusLetter } from '../tree/file-tree-item';
import { requestAskClaude } from '../../features/claude/ask-claude-review';
import { requestSendToClaude } from '../../features/claude/send-comments';
import { openPrInbox } from '../../features/palette/quick-open';
import { OtherViewThreads, OutsideThreads } from '../comments/outside-threads';
import { splitThreadsByView } from '../../lib/thread-views';
import { useUncommittedPaths } from '../layout/diff-context-bar';
import type { CommentThread, LineSelection } from '../comments/types';
import { DiffBar, hiddenFilesLabel } from './view-options';
import { repoBase } from '../../hooks/use-repo';
import { errorMessage, getRepoPath, parseCommitRef } from '../../lib/api';
import { enterLargeDiffScope } from '../../lib/large-diff';
import { readViewMemory, writeViewMemory } from '../../lib/view-memory';
import { readViewState, useViewState, writeViewState } from '../../lib/view-state';
import { MovedComposer, selectionInDiff } from '../comments/moved-composer';
import { Workspace } from '../layout/title-bar';
import { ReviewStateProvider } from '../../features/review/review-state';
import { useViewedFiles } from '../../hooks/use-viewed-files';
import type { SinceViewedInfo } from './since-viewed';
import { useGitHubPr, useOwnPr } from '../../hooks/use-repo-state';
import { prDiffRef, uncommittedTwin } from '../layout/ref-menu';
import { openCommitDialog } from '../../features/pr/commit-dialog';
import { BookIcon, ChangesIcon, ChevronDownIcon, ChevronUpIcon, CollapseAllIcon, CopyIcon, ExpandAllIcon, EyeOffIcon, GitHubIcon, GitPullRequestIcon, PushIcon, RefreshIcon, SendIcon, SparkleIcon, SplitViewIcon, UnifiedViewIcon } from '../ui/icon';
import { shortcutHint } from '../../lib/shortcuts';
import { FindBar } from '../../features/find/find-bar';
import { useFind, useFindSource, type FindSource } from '../../features/find/find-store';
import { diffFindLines } from '../../lib/find';
import { filePatchOptions } from '../../queries/diff';
import { loadHeldBackFile } from '../../lib/large-diff';
import { useHotkeys } from 'react-hotkeys-hook';
import { GuideSidebar, GuideSidebarEmpty } from '../../features/guide/guide-sidebar';
import { GuideReader } from '../../features/guide/guide-reader';
import { GuideRefContext, type GuideRef, type GuideRefs } from '../../features/guide/guide-refs';
import { focusGuideLine } from '../../features/guide/guide-focus';
import { GuideBarStatus, GuideStart } from '../../features/guide/guide-start';
import { isGuideStale, readingChapters, stepLabel } from '../../features/guide/guide-model';
import { deleteGuide, OVERVIEW_STEP, startGuide, useGuide, useGuideRun, type GuideStep } from '../../features/guide/use-guide';
import { setGuideOnScreen } from '../../features/guide/guide-on-screen';
import { useRunPick } from '../../features/claude/model-setting';
import { GENERAL_THREAD_FILE_PATH } from '../comments/types';

const NO_THREADS: CommentThread[] = [];

function patchData(results: { data?: DiffFile }[]) {
  return results.map((result) => result.data);
}

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

/** Expands the paths in `current` that are not in `seen`. */
function expandAdded(collapsed: Set<string>, seen: Set<string>, current: Set<string>) {
  const added = [...current].filter((path) => !seen.has(path) && collapsed.has(path));
  if (added.length === 0) {
    return collapsed;
  }
  const next = new Set(collapsed);
  for (const path of added) {
    next.delete(path);
  }
  return next;
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
  const [showIgnored, setShowIgnored] = useViewState(`diff:${refParam}:showIgnored`, false);
  const { data: rawDiff, error } = useDiff(hideWhitespace, refParam, showIgnored);
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
  const allThreads = reviewsEnabled && serverThreads ? serverThreads : NO_THREADS;
  const twin = uncommittedTwin(refParam);
  const uncommittedPaths = useUncommittedPaths();
  const diffPaths = useMemo(() => new Set(diff?.files.map(getFilePath) ?? []), [diff]);
  const { here: threads, elsewhere: otherViewThreads } = useMemo(
    () => (twin ? splitThreadsByView(allThreads, refParam, diffPaths, uncommittedPaths) : { here: allThreads, elsewhere: NO_THREADS }),
    [twin, allThreads, refParam, diffPaths, uncommittedPaths],
  );
  const commentCountsByFile = useMemo(() => buildThreadCountsByFile(threads), [threads]);
  const filesWithComments = useMemo(() => new Set(commentCountsByFile.keys()), [commentCountsByFile]);
  const [collapsedFiles, setCollapsedFiles] = useState<Set<string>>(() => collapsedFromToggles(diff?.files ?? [], filesWithComments, manuallyToggledRef.current));
  const initializedDiffRef = useRef<typeof diff>(diff);
  const commentedSeenRef = useRef(filesWithComments);
  const canRevert = !!info?.capabilities?.revert;
  const canEdit = !!info?.capabilities?.edit;
  const suggestionTarget = useMemo(() => ({ canEdit }), [canEdit]);
  const { isStale, resetStaleness } = useDiffStaleness(rawDiff?.fingerprint, refParam, showIgnored, !!info?.capabilities?.staleness);
  const { details: githubDetails } = useGitHubPr();
  const ownPr = useOwnPr();
  const { reviewedFiles, changedFiles, hashes, setReviewed, loading: viewedLoading } = useViewedFiles(sessionId, diff, refParam);
  const sinceViewedFiles = useMemo(() => {
    const map = new Map<string, SinceViewedInfo>();
    if (!sessionId) {
      return map;
    }
    for (const [path, changed] of changedFiles) {
      map.set(path, { sessionId, viewRef: refParam, canDiff: changed.canDiff, version: hashes.get(path) ?? '' });
    }
    return map;
  }, [sessionId, refParam, changedFiles, hashes]);
  const changedSinceViewed = useMemo(() => new Set(changedFiles.keys()), [changedFiles]);
  const changedSeenRef = useRef<Set<string>>(new Set());

  const repoPath = getRepoPath();
  const [mode, setMode] = useViewState<'files' | 'guide'>(`diff:${refParam}:mode`, 'files');
  const [guideStep, setGuideStep] = useViewState<GuideStep>(`diff:${refParam}:guideStep`, OVERVIEW_STEP);
  const { data: guide } = useGuide(reviewsEnabled ? sessionId : null);
  const guideRun = useGuideRun(repoPath, refParam);
  const reviewPick = useRunPick('review', repoPath);
  const chapters = useMemo(() => (guide && diff ? readingChapters(guide, diff.files) : []), [guide, diff]);
  const guideStale = !!guide && isGuideStale(guide, showIgnored ? undefined : rawDiff?.fingerprint, chapters);
  const guideMode = mode === 'guide' && reviewsEnabled;
  // The guide sits beside a story column, so it keeps its own unified/split choice, unified by default.
  const [guideViewMode, setGuideViewMode] = useViewState<ViewMode>('guide:viewMode', 'unified');
  const shownViewMode = guideMode ? guideViewMode : viewMode;
  const setShownViewMode = guideMode ? setGuideViewMode : setViewMode;
  const guideOpen = guideMode && !!guide && chapters.length > 0;
  const step = chapters.some((chapter) => chapter.key === guideStep) ? guideStep : OVERVIEW_STEP;
  const guidePr = githubDetails && refParam === prDiffRef(githubDetails) ? { title: githubDetails.pr.title, body: githubDetails.pr.body } : null;
  const rewriteGuide = guideRun ? null : () => startGuide(repoPath, refParam, sessionId, reviewPick, guidePr);

  /** Opens the chapter holding `path` and scrolls to the file (opening it when `expand`), or to one of its comments. */
  const revealInGuide = useCallback((path: string, threadId?: string, expand = false, line?: Pick<GuideRef, 'line' | 'side'>) => {
    if (path === GENERAL_THREAD_FILE_PATH) {
      setGuideStep(OVERVIEW_STEP);
      if (threadId) {
        focusThreadElement(threadId, 20);
      }
      return;
    }
    const chapter = chapters.find((item) => item.files.some((file) => getFilePath(file) === path));
    if (!chapter) {
      return;
    }
    setGuideStep(chapter.key);
    setActiveFile(path);
    if (expand) {
      setCollapsedFiles((prev) => {
        if (!prev.has(path)) {
          return prev;
        }
        const next = new Set(prev);
        next.delete(path);
        return next;
      });
    }
    if (threadId) {
      focusThreadElement(threadId, 20);
      return;
    }
    if (line?.line) {
      focusGuideLine({ path, line: line.line, side: line.side });
      return;
    }
    focusFileElement(path);
  }, [chapters, setGuideStep, setActiveFile]);

  const guideRefs = useMemo<GuideRefs>(() => {
    const paths = new Set(chapters.flatMap((chapter) => chapter.files.map((file) => getFilePath(file))));
    return {
      open: (ref) => revealInGuide(ref.path, undefined, true, ref),
      has: (path) => paths.has(path),
    };
  }, [chapters, revealInGuide]);

  useEffect(() => {
    if (!guideMode) {
      return;
    }
    setGuideOnScreen(repoPath, refParam);
    return () => setGuideOnScreen(null, null);
  }, [guideMode, repoPath, refParam]);

  useHotkeys('g', () => setMode(guideMode ? 'files' : 'guide'), { preventDefault: true, enabled: reviewsEnabled }, [guideMode]);

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

  const rawCommentActions = useCommentActions(sessionId, reviewsEnabled, refParam);
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
    setCollapsedFiles((prev) => expandAdded(prev, seen, filesWithComments));
  }, [filesWithComments]);

  useLayoutEffect(() => {
    const seen = changedSeenRef.current;
    changedSeenRef.current = changedSinceViewed;
    setCollapsedFiles((prev) => expandAdded(prev, seen, changedSinceViewed));
  }, [changedSinceViewed]);

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
    if (guideOpen) {
      const order = chapters.flatMap((chapter) => chapter.files.map((file) => getFilePath(file)));
      const shown = chapters.find((chapter) => chapter.key === step);
      const inShown = !!activeFile && !!shown?.files.some((file) => getFilePath(file) === activeFile);
      // Start from the chapter on screen when the last file visited is elsewhere.
      const current = inShown ? order.indexOf(activeFile) : shown ? order.indexOf(getFilePath(shown.files[0])) - 1 : -1;
      const target = order[Math.max(0, Math.min(order.length - 1, current + direction))];
      if (target) {
        revealInGuide(target);
      }
      return;
    }
    const nextIdx = Math.max(0, Math.min(diff.files.length - 1, currentFileIdx.current + direction));
    currentFileIdx.current = nextIdx;
    const path = getFilePath(diff.files[nextIdx]);
    diffViewRef.current?.scrollToFile(path);
  }, [diff, guideOpen, chapters, step, activeFile, revealInGuide]);

  const navigateHunk = useCallback((direction: 1 | -1) => {
    diffViewRef.current?.scrollToHunk(direction);
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
    onUnifiedView: () => setShownViewMode('unified'),
    onSplitView: () => setShownViewMode('split'),
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
    if (guideOpen) {
      revealInGuide(path);
      return;
    }
    setActiveFile(path);
    diffViewRef.current?.scrollToFile(path);
  }, [setActiveFile, guideOpen, revealInGuide]);

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
    if (guideOpen) {
      revealInGuide(filePath, threadId);
      return;
    }
    diffViewRef.current?.scrollToThread(threadId, filePath);
  }, [guideOpen, revealInGuide]);

  const [searchParams, setSearchParams] = useSearchParams();
  const targetThreadId = searchParams.get('thread');
  const targetFile = searchParams.get('file');
  const viewParam = searchParams.get('view');

  useEffect(() => {
    if (viewParam !== 'guide' && viewParam !== 'files') {
      return;
    }
    setMode(viewParam);
    const next = new URLSearchParams(searchParams);
    next.delete('view');
    setSearchParams(next, { replace: true });
  }, [viewParam, searchParams, setSearchParams, setMode]);

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
    if (!diffViewRef.current && !guideOpen) {
      focusThreadElement(thread.id);
      return;
    }
    requestAnimationFrame(() => handleScrollToThread(thread.id, thread.filePath));
  }, [targetThreadId, targetFile, diff, threads, threadsFetched, reviewsEnabled, searchParams, setSearchParams, handleScrollToThread, guideOpen]);

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
      { id: 'view-unified', title: 'Unified diff', group: 'View', hint: shortcutHint('view-unified'), icon: <UnifiedViewIcon size="sm" />, run: () => setShownViewMode('unified') },
      { id: 'view-split', title: 'Split diff', group: 'View', hint: shortcutHint('view-split'), icon: <SplitViewIcon size="sm" />, run: () => setShownViewMode('split') },
      { id: 'view-whitespace', title: hideWhitespace ? 'Show whitespace changes' : 'Hide whitespace changes', group: 'View', icon: <EyeOffIcon size="sm" />, run: () => setHideWhitespace(!hideWhitespace) },
      { id: 'view-collapse', title: 'Collapse all files', group: 'View', hint: shortcutHint('view-collapse'), icon: <CollapseAllIcon size="sm" />, run: () => setCollapsedFiles(new Set(diff?.files.map((file) => getFilePath(file)) ?? [])) },
      { id: 'view-expand', title: 'Expand all files', group: 'View', icon: <ExpandAllIcon size="sm" />, run: () => setCollapsedFiles(new Set()) },
      { id: 'file-next', title: 'Next file', group: 'View', hint: shortcutHint('file-next'), keywords: 'down', icon: <ChevronDownIcon size="sm" />, run: () => navigateFile(1) },
      { id: 'file-prev', title: 'Previous file', group: 'View', hint: shortcutHint('file-prev'), keywords: 'up', icon: <ChevronUpIcon size="sm" />, run: () => navigateFile(-1) },
      { id: 'claude-review', title: 'Ask Claude to review…', group: 'Actions', keywords: 'ai review', icon: <SparkleIcon size="sm" className="text-claude" />, run: () => requestAskClaude(refParam) },
      ...(reviewsEnabled ? [{
        id: 'guide',
        title: guideMode ? 'Show the diff' : guide ? 'Open the guide' : 'Write a guide…',
        group: 'View',
        hint: shortcutHint('guide'),
        keywords: 'walkthrough chapters story explain tour ai',
        icon: guideMode ? <ChangesIcon size="sm" /> : <BookIcon size="sm" />,
        run: () => setMode(guideMode ? 'files' : 'guide'),
      }] : []),
      { id: 'claude-send', title: 'Send comments to Claude…', group: 'Actions', keywords: 'ai resolve fix', icon: <SendIcon size="sm" className="text-claude" />, run: requestSendToClaude },
      { id: 'pr-inbox', title: 'Pull requests waiting on you…', group: 'Actions', keywords: 'inbox github review requested assigned prs', icon: <GitPullRequestIcon size="sm" />, run: openPrInbox },
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
  }, [hideWhitespace, diff, navigateFile, refParam, ownPr, githubDetails, activeFile, reviewsEnabled, guideMode, guide, setMode, setShownViewMode]);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      handleCopyShortcut(event, activeFile, refParam);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [activeFile, refParam]);
  usePageActions('diff', paletteActions);

  const findOpen = useFind((state) => state.open);
  const omittedFiles = useMemo(() => (findOpen && diff ? diff.files.filter((file) => file.patchOmitted) : []), [findOpen, diff]);
  const omittedPatches = useQueries({
    queries: omittedFiles.map((file) => filePatchOptions(file, hideWhitespace, refParam)),
    combine: patchData,
  });
  const activeFileRef = useRef(activeFile);
  activeFileRef.current = activeFile;
  const findSource = useMemo<FindSource | null>(() => {
    if (!diff || diff.files.length === 0) {
      return null;
    }
    const patched = new Map<string, DiffFile>();
    omittedFiles.forEach((file, index) => {
      const data = omittedPatches[index];
      if (data) {
        patched.set(getFilePath(file), data);
      }
    });
    return {
      label: 'changes',
      lines: diffFindLines(patched.size > 0 ? diff.files.map((file) => patched.get(getFilePath(file)) ?? file) : diff.files),
      pending: omittedFiles.length - patched.size,
      currentScope: () => activeFileRef.current,
      reveal: (match) => {
        const file = diff.files.find((item) => getFilePath(item) === match.scope);
        if (!file) {
          return;
        }
        setCollapsedFiles((prev) => {
          if (!prev.has(match.scope)) {
            return prev;
          }
          const next = new Set(prev);
          next.delete(match.scope);
          return next;
        });
        if (deferReason(file)) {
          loadHeldBackFile(match.scope);
        }
        if (guideOpen) {
          revealInGuide(match.scope);
          return;
        }
        diffViewRef.current?.revealFile(match.scope);
      },
    };
  }, [diff, omittedFiles, omittedPatches, guideOpen, revealInGuide]);
  useFindSource(findSource);

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
  const viewedCommit = parseCommitRef(refParam);
  const promoteBlocked = githubDetails && viewedCommit && !githubDetails.pr.headSha.startsWith(viewedCommit)
    ? `This commit isn't the latest commit of PR #${githubDetails.prNumber}, so comments on it can't be posted there. Review the PR diff instead.`
    : null;
  const composerMoved = pendingSelection !== null && !selectionInDiff(diff, pendingSelection);
  const allPaths = diff.files.map((file) => getFilePath(file));

  return (
    <ReviewStateProvider
      sessionId={reviewsEnabled ? sessionId : null}
      prMode={!!githubDetails && !ownPr}
      ownPrNumber={ownPr && githubDetails && refParam === prDiffRef(githubDetails) ? githubDetails.prNumber : null}
      promotePr={githubDetails?.prNumber ?? null}
      promoteBlocked={promoteBlocked}
    >
    <SuggestionTargetContext.Provider value={suggestionTarget}>
    <div className="flex flex-col h-screen bg-frame text-text font-sans">
      <Toolbar
        theme={theme}
        onToggleTheme={toggleTheme}
        onShowHelp={openShortcuts}
        diff={diff || undefined}
        diffRef={refParam}
        threads={allThreads}
        repoName={info?.name || null}
        branch={info?.branch || null}
        githubDetails={githubDetails}
        hasGitHubRemote={!!info?.github}
        sessionId={sessionId}
        focusedFile={activeFile}
      />
      <Workspace>
      <PrSession diffRef={refParam} threads={allThreads} />
      <GuideRefContext.Provider value={guideOpen ? guideRefs : null}>
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {guideOpen && guide && !isEmpty ? (
          <GuideSidebar
            guide={guide}
            chapters={chapters}
            step={step}
            onStep={setGuideStep}
            reviewedFiles={reviewedFiles}
            onReviewedChange={handleReviewedChange}
            onFileClick={(path) => revealInGuide(path, undefined, true)}
            onRewrite={rewriteGuide}
            onDelete={() => {
              if (sessionId) {
                setMode('files');
                void deleteGuide(sessionId).catch((err) => toast.error(errorMessage(err)));
              }
            }}
          />
        ) : guideMode && !isEmpty ? (
          <GuideSidebarEmpty writing={!!guideRun} />
        ) : (
        <Sidebar
          files={diff.files}
          activeFile={isEmpty ? null : activeFile}
          reviewedFiles={reviewedFiles}
          changedSinceViewed={changedSinceViewed}
          commentCountsByFile={commentCountsByFile}
          onFileClick={handleSidebarFileClick}
          onCommentedFileClick={handleSidebarCommentedFileClick}
          stats={isEmpty ? undefined : diff.stats}
          stateKey={`diff:${refParam}:sidebar`}
        />
        )}
        {isEmpty ? (
          <div className="flex flex-1 min-w-0 flex-col overflow-y-auto">
            <DiffEmptyState
              diffRef={refParam}
              hideWhitespace={hideWhitespace}
              onShowWhitespace={() => setHideWhitespace(false)}
              branch={info?.branch || null}
            />
            {(diff.hiddenFiles?.length ?? 0) > 0 && (
              <p className="mx-auto -mt-4 text-center text-xs text-text-muted">
                {hiddenFilesLabel(diff.hiddenFiles?.length ?? 0)}.{' '}
                <button className="cursor-pointer text-accent hover:underline" onClick={() => setShowIgnored(true)}>Show them</button>
              </p>
            )}
            {reviewsEnabled && (
              <>
                <OutsideThreads threads={threads} viewEmpty className="mt-8 mb-10 px-6" />
                {twin && <OtherViewThreads threads={otherViewThreads} twin={twin} className="-mt-6 mb-10 px-6" />}
              </>
            )}
            {composerMoved && pendingSelection && (
              <MovedComposer selection={pendingSelection} onSubmit={handleAddThread} onCancel={() => setPendingSelection(null)} />
            )}
          </div>
        ) : (
          <div className="relative flex flex-1 min-w-0 flex-col">
            <FindBar className="top-12" />
            {(!guideMode || guideOpen) && (
              <DiffBar
                viewMode={shownViewMode}
                onViewModeChange={setShownViewMode}
                hideWhitespace={hideWhitespace}
                onHideWhitespaceChange={setHideWhitespace}
                leading={guideOpen ? (
                  <span className="flex items-center gap-3 mr-1 min-w-0">
                    <span className="text-xs text-text-secondary tabular-nums shrink-0">{stepLabel(chapters, step)}</span>
                    <GuideBarStatus diffRef={refParam} stale={guideStale} onRewrite={rewriteGuide} />
                  </span>
                ) : undefined}
                ignored={{ hiddenCount: diff.hiddenFiles?.length ?? 0, showing: showIgnored, onShowingChange: setShowIgnored }}
                onExpandAll={() => setCollapsedFiles(new Set())}
                onCollapseAll={() => setCollapsedFiles(new Set(allPaths))}
                commentNav={
                  <CommentToolbarActions
                    threads={threads}
                    onScrollToThread={handleScrollToThread}
                    onDeleteAllComments={commentActions.deleteAllThreads}
                    formatForCopy={() => formatThreadsForCopy(threads, diff, refParam)}
                    extras={false}
                    keys={!guideOpen}
                  />
                }
                comments={{
                  count: threads.length,
                  formatForCopy: () => formatThreadsForCopy(threads, diff, refParam),
                  onDeleteAll: commentActions.deleteAllThreads,
                }}
              />
            )}
            {composerMoved && pendingSelection && (
              <MovedComposer selection={pendingSelection} onSubmit={handleAddThread} onCancel={() => setPendingSelection(null)} />
            )}
            {guideMode && !guideOpen && (
              <GuideStart diffRef={refParam} sessionId={sessionId} fileCount={diff.files.length} changedLines={diff.stats.totalAdditions + diff.stats.totalDeletions} pr={guidePr} />
            )}
            {guideOpen && guide && (
              <GuideReader
                guide={guide}
                chapters={chapters}
                step={step}
                onStep={setGuideStep}
                viewMode={shownViewMode}
                collapsedFiles={collapsedFiles}
                onToggleCollapse={handleToggleCollapse}
                reviewedFiles={reviewedFiles}
                onReviewedChange={handleReviewedChange}
                sinceViewedFiles={sinceViewedFiles}
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
                hideWhitespace={hideWhitespace}
                onFileClick={(path) => revealInGuide(path, undefined, true)}
              />
            )}
            {!guideMode && (
            <DiffView
              diff={diff}
              viewMode={viewMode}
              theme={theme}
              collapsedFiles={collapsedFiles}
              onToggleCollapse={handleToggleCollapse}
              reviewedFiles={reviewedFiles}
              onReviewedChange={handleReviewedChange}
              sinceViewedFiles={sinceViewedFiles}
              onActiveFileChange={handleActiveFileFromScroll}
              handle={diffViewRef}
              baseRef={refParam}
              canRevert={canRevert}
              onRevert={handleRevert}
              scrollRef={(node) => {
                mainRef.current = node;
              }}
              threads={threads}
              otherViewThreads={otherViewThreads}
              twin={twin}
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
            )}
          </div>
        )}
      </div>
      </GuideRefContext.Provider>
      </Workspace>
      <StatusBar
        diffRef={refParam}
        stale={isStale ? { onRefresh: handleRefreshDiff } : null}
      />
    </div>
    </SuggestionTargetContext.Provider>
    </ReviewStateProvider>
  );
}
