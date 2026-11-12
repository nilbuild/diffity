import { hashString } from '../../lib/hash';
import { useState, useEffect, useMemo, useCallback, useRef, memo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { DiffHunk } from '@/lib/diff-parser';
import type { DiffFile, DiffLine as DiffLineType } from '@/lib/diff-parser';
import type { SyntaxToken } from '../../lib/syntax-token';
import { getLang, type CodeHighlighter } from '../../hooks/use-highlighter';
import { highlightInWorker } from '../../lib/highlight-client';
import type { CommentAuthor, CommentSide, LineSelection, SubmitOptions } from '../comments/types';
import { type ViewMode, getFilePath, buildChangeGroupPatch, extractLinesFromDiff, extractLinesFromExpandedLines, deferReason, getRowCount, sliceHunk, sliceRowCount, SLICE_ROW_THRESHOLD } from '../../lib/diff-utils';
import { revertHunk as apiRevertHunk, revertFile as apiRevertFile, openInEditor, errorMessage, fetchFileVersions } from '../../lib/api';
import { filePatchOptions } from '../../queries/diff';
import { buildSyntaxMap, HIGHLIGHT_MAX_ROWS, planSyntaxSources, runInSteps, tokenizeSources, type SideTokens } from '../../lib/syntax-lines';
import { loadHeldBackFile, useHeldBackLoaded } from '../../lib/large-diff';
import { LazySlice } from './lazy-slice';
import { useGuideFocusLine } from '../../features/guide/guide-focus';
import { Spinner } from '../icons/spinner';
import { buttonOutline } from '../ui/button-styles';
import { cn } from '../../lib/cn';
import { openComments } from '../../lib/ui-store';
import { toast } from 'sonner';
import { isRenderableFile } from '../../lib/file-types';
import { RichDiffViewer } from './rich-diff-viewer';
import { ConfirmDialog } from '../ui/confirm-dialog';
import { computeGaps, createContextLines, getExpandRange, type ExpandableGap } from '../../lib/context-expansion';
import { fileContentOptions } from '../../queries/file';
import type { CommentActions } from '../../hooks/use-comment-actions';
import type { CommentThread } from '../comments/types';
import { GENERAL_THREAD_FILE_PATH, DEFAULT_AUTHOR } from '../comments/types';
import { useLineSelection } from '../../hooks/use-line-selection';
import { useThemeStore } from '../../hooks/use-theme';
import { DiffStats } from './diff-stats';
import { Badge } from '../ui/badge';
import { IconButton } from '../ui/icon-button';
import { StatusBadge } from '../ui/status-badge';
import { PathLabel } from '../ui/path-label';
import { HunkWithGap } from './hunk-with-gap';
import { ThreadBadge } from '../ui/thread-badge';
import { buildExpansionSyntaxMap, renderExpansionRows } from './render-expansion-rows';
import { ExpandRow } from './expand-row';
import { useViewState } from '../../lib/view-state';
import { FileComments, fileDraftKey } from '../comments/file-comments';
import { hasDraft } from '../comments/comment-form';
import { useReviewState } from '../../features/review/review-state';
import { ChevronIcon, CodeIcon, CommentIcon, CopyIcon, EditorIcon, EllipsisIcon, FileIcon, FileTextIcon, GitCompareIcon, UndoIcon } from '../ui/icon';
import { MenuItem, MenuSeparator, Popover, useMenu } from '../ui/popover';
import { contentsLabel, copyAbsolutePath, copyFileContents, copyFileDiff, copyRelativePath } from '../../lib/file-copy';
import { useEditorName } from '../../hooks/use-editor-name';
import { useCurrentFindKey } from '../../features/find/find-store';
import { diffLineKey } from '../../lib/find';
import { SinceViewedBadge, SinceViewedDiff, type SinceViewedInfo } from './since-viewed';
import { CodeScrollbar } from './code-scroll';
import { useTypography } from '../../lib/typography';
import { chord } from '../../lib/shortcuts';

/** Cards that scroll straight past are never highlighted: work starts once a card has stayed mounted this long. */
const HIGHLIGHT_DELAY_MS = 120;
/** How often lines the worker finished are handed to the view while it is still going. */
const HIGHLIGHT_PROGRESS_MS = 400;

export interface FileBlockProps {
  file: DiffFile;
  viewMode: ViewMode;
  collapsed: boolean;
  onToggleCollapse: (path: string) => void;
  reviewed: boolean;
  onReviewedChange: (path: string, reviewed: boolean) => void;
  highlightCode?: CodeHighlighter;
  baseRef?: string;
  canRevert?: boolean;
  onRevert?: () => void;
  threads: CommentThread[];
  commentsEnabled: boolean;
  commentActions: CommentActions;
  onAddThread: CommentActions['addThread'];
  pendingSelection: LineSelection | null;
  onPendingSelectionChange: (selection: LineSelection | null) => void;
  highlighted?: boolean;
  onHighlightEnd?: (path: string) => void;
  hideWhitespace?: boolean;
  /** Set when the file changed after it was marked viewed. */
  sinceViewed?: SinceViewedInfo | null;
}

interface FileCardProps extends FileBlockProps {
  heldBack: { reason: string; rows: number; onLoad: () => void } | null;
  loadingPatch: boolean;
}

interface GapExpansion {
  fromTop: number;
  fromBottom: number;
  linesFromTop: DiffLineType[];
  linesFromBottom: DiffLineType[];
}

const syntaxCache = new Map<string, Map<string, SyntaxToken[]>>();

/** Identifies the diff's lines by content: an edit that keeps the line count must not reuse the old tokens. */
function diffShapeKey(file: DiffFile): string {
  const contents: string[] = [];
  for (const hunk of file.hunks) {
    for (const line of hunk.lines) {
      contents.push(line.content);
    }
  }
  return `${getFilePath(file)}:${contents.length}:${hashString(contents.join('\n'))}`;
}

function rememberSyntax(key: string, map: Map<string, SyntaxToken[]>) {
  if (syntaxCache.size > 300) {
    const first = syntaxCache.keys().next().value;
    if (first !== undefined) {
      syntaxCache.delete(first);
    }
  }
  syntaxCache.set(key, map);
}

interface FileCardMenuProps {
  file: DiffFile;
  path: string;
  viewRef: string;
  editorName: string;
  onOpenInEditor: (() => void) | null;
  onRevert: (() => void) | null;
}

function FileCardMenu(props: FileCardMenuProps) {
  const { file, path, viewRef, editorName, onOpenInEditor, onRevert } = props;
  const menu = useMenu();
  const deleted = file.status === 'deleted';
  const run = (action: () => void) => () => {
    menu.close();
    action();
  };

  return (
    <>
      <button
        ref={menu.anchorRef}
        onClick={menu.toggle}
        className="w-6 h-6 inline-flex items-center justify-center rounded-md text-text-secondary hover:text-text hover:bg-hover transition-colors cursor-pointer"
        title="More file actions: open in editor, copy, revert"
        aria-label="More file actions"
        aria-expanded={menu.open}
      >
        <EllipsisIcon size="sm" />
      </button>
      <Popover open={menu.open} onClose={menu.close} anchorRef={menu.anchorRef} align="end" width={250}>
        {onOpenInEditor && (
          <>
            <MenuItem icon={<EditorIcon size="sm" />} label={`Open in ${editorName}`} onSelect={run(onOpenInEditor)} />
            <MenuSeparator />
          </>
        )}
        <MenuItem icon={<CopyIcon size="sm" />} label="Copy relative path" hint={chord('C', { alt: true })} onSelect={run(() => copyRelativePath(path))} />
        <MenuItem icon={<CopyIcon size="sm" />} label="Copy absolute path" onSelect={run(() => copyAbsolutePath(path))} />
        <MenuSeparator />
        <MenuItem
          icon={<FileTextIcon size="sm" />}
          label={file.isBinary ? 'Copy file contents (binary file)' : deleted ? 'Copy file contents (deleted here)' : contentsLabel(viewRef)}
          hint={file.isBinary || deleted ? undefined : chord('C', { alt: true, shift: true })}
          disabled={file.isBinary || deleted}
          onSelect={run(() => void copyFileContents(path, viewRef))}
        />
        <MenuItem icon={<GitCompareIcon size="sm" />} label={file.isBinary ? 'Copy diff (binary file)' : 'Copy diff'} disabled={file.isBinary} onSelect={run(() => copyFileDiff(file))} />
        {onRevert && (
          <>
            <MenuSeparator />
            <MenuItem icon={<UndoIcon size="sm" />} label="Revert file…" onSelect={run(onRevert)} />
          </>
        )}
      </Popover>
    </>
  );
}

/**
 * One file of the diff. Lock, generated, minified and large files are held back behind "Load diff" (unless they carry
 * comments); files the backend sent without hunks (`patchOmitted`) fetch them once loaded.
 */
export const FileBlock = memo(function FileBlock(props: FileBlockProps) {
  const { file, collapsed, threads, baseRef, hideWhitespace = false } = props;
  const filePath = getFilePath(file);
  const reason = useMemo(() => deferReason(file), [file]);
  const loaded = useHeldBackLoaded(filePath);
  const hasThreads = useMemo(() => threads.some((thread) => thread.filePath === filePath), [threads, filePath]);
  const heldBack = !!reason && !loaded && !hasThreads;
  const patch = useQuery({
    ...filePatchOptions(file, hideWhitespace, baseRef),
    enabled: !!file.patchOmitted && !heldBack && !collapsed,
  });
  const effectiveFile = file.patchOmitted && patch.data ? patch.data : file;

  return (
    <FileCard
      {...props}
      file={effectiveFile}
      heldBack={heldBack && reason ? { reason, rows: getRowCount(file), onLoad: () => loadHeldBackFile(filePath) } : null}
      loadingPatch={!!file.patchOmitted && !heldBack && !patch.data}
    />
  );
});

function FileCard(props: FileCardProps) {
  const {
    file, viewMode, collapsed, onToggleCollapse, reviewed, onReviewedChange, highlightCode, baseRef, canRevert, onRevert,
    threads: allThreads, commentsEnabled, commentActions, onAddThread: rawAddThread, pendingSelection, onPendingSelectionChange,
    highlighted, onHighlightEnd, heldBack, loadingPatch, sinceViewed,
  } = props;
  const [showSinceViewed, setShowSinceViewed] = useState(false);
  const tableRef = useRef<HTMLTableElement>(null);
  const wrapLines = useTypography((state) => state.wrapLines);

  const rendersLines = !collapsed && !heldBack && !loadingPatch && !file.isBinary && file.hunks.length > 0;
  const filePath = getFilePath(file);
  const hunkShape = useMemo(() => file.hunks.map((hunk) => `${hunk.oldStart},${hunk.oldCount},${hunk.newStart},${hunk.newCount}`).join(';'), [file.hunks]);
  const [expansions, setExpansions] = useViewState<Map<string, GapExpansion>>(`diff:${baseRef ?? 'work'}:expanded:${filePath}:${hunkShape}`, () => new Map());
  const [loadingGap, setLoadingGap] = useState<{ id: string; direction: 'up' | 'down' | 'all' } | null>(null);

  const showRename = file.status === 'renamed' && file.oldPath !== file.newPath;
  const isNewFile = file.status === 'added';

  const queryClient = useQueryClient();
  const fileContentPath = file.oldPath || filePath;
  const fileLineCount = file.oldFileLineCount ?? null;


  const [confirmRevertChange, setConfirmRevertChange] = useState<{ hunk: DiffHunk; startIndex: number; endIndex: number } | null>(null);
  const [confirmRevertFile, setConfirmRevertFile] = useState(false);
  const renderable = !file.isBinary && isRenderableFile(filePath);
  const [richView, setRichView] = useState(false);

  const handleRevertFile = useCallback(async () => {
    setConfirmRevertFile(false);
    const id = toast.loading(`Reverting ${filePath}…`);
    try {
      await apiRevertFile(filePath);
      toast.success(`Reverted ${filePath}`, { id });
      onRevert?.();
    } catch (error) {
      toast.error('Could not revert the file', { id, description: errorMessage(error) });
    }
  }, [filePath, onRevert]);

  const editorName = useEditorName();
  const handleOpenInEditor = useCallback(() => {
    const firstLine = file.hunks[0]?.newStart;
    openInEditor(filePath, file.status === 'deleted' ? undefined : firstLine).catch((error) => {
      toast.error('Could not open the editor', { description: errorMessage(error) });
    });
  }, [file, filePath]);

  const handleRevertChange = useCallback(async (info: { hunk: DiffHunk; startIndex: number; endIndex: number }) => {
    setConfirmRevertChange(null);
    const patch = buildChangeGroupPatch(file, info.hunk, info.startIndex, info.endIndex);
    const id = toast.loading('Undoing change…');
    try {
      await apiRevertHunk(patch);
      toast.success('Change undone', { id });
      onRevert?.();
    } catch (error) {
      toast.error('Could not undo the change', { id, description: errorMessage(error) });
    }
  }, [file, onRevert]);


  const { addReply, resolveThread, unresolveThread, editComment, deleteComment, deleteThread } = commentActions;

  const allExpandedLines = useMemo(() => {
    const lines: DiffLineType[] = [];
    for (const [, expansion] of expansions) {
      lines.push(...expansion.linesFromTop, ...expansion.linesFromBottom);
    }
    return lines;
  }, [expansions]);

  const getOriginalCode = useCallback((side: CommentSide, startLine: number, endLine: number) => {
    const fromHunks = extractLinesFromDiff(file.hunks, side, startLine, endLine);
    if (fromHunks) {
      return fromHunks;
    }
    return extractLinesFromExpandedLines(allExpandedLines, side, startLine, endLine);
  }, [file.hunks, allExpandedLines]);

  const addThread = useCallback((fp: string, side: CommentSide, startLine: number, endLine: number, body: string, author: CommentAuthor, options?: SubmitOptions) => {
    let anchorContent = extractLinesFromDiff(file.hunks, side, startLine, endLine);
    if (!anchorContent) {
      anchorContent = extractLinesFromExpandedLines(allExpandedLines, side, startLine, endLine);
    }
    rawAddThread(fp, side, startLine, endLine, body, author, anchorContent || undefined, options);
  }, [rawAddThread, file.hunks, allExpandedLines]);

  const { allFileThreads, wholeFileThreads } = useMemo(() => {
    const threads = allThreads.filter(t => t.filePath === filePath && t.filePath !== GENERAL_THREAD_FILE_PATH);
    return {
      allFileThreads: threads.filter(t => t.startLine !== 0),
      wholeFileThreads: threads.filter(t => t.startLine === 0),
    };
  }, [allThreads, filePath]);
  const { sessionId: reviewSessionId } = useReviewState();
  const [showFileForm, setShowFileForm] = useViewState(`diff:${baseRef ?? 'work'}:file-form:${filePath}`, () => hasDraft(reviewSessionId, fileDraftKey(filePath)));

  const { anchoredThreads: fileThreads, orphanedThreads } = useMemo(() => {
    const diffLineNumbers = new Set<string>();
    const addLines = (lines: DiffLineType[]) => {
      for (const line of lines) {
        if (line.oldLineNumber !== null) {
          diffLineNumbers.add(`old:${line.oldLineNumber}`);
        }
        if (line.newLineNumber !== null) {
          diffLineNumbers.add(`new:${line.newLineNumber}`);
        }
      }
    };
    for (const hunk of file.hunks) {
      addLines(hunk.lines);
    }
    addLines(allExpandedLines);

    const anchored: typeof allFileThreads = [];
    const orphaned: typeof allFileThreads = [];
    for (const thread of allFileThreads) {
      let isInDiff = false;
      for (let line = thread.startLine; line <= thread.endLine; line++) {
        if (diffLineNumbers.has(`${thread.side}:${line}`)) {
          isInDiff = true;
          break;
        }
      }

      if (isInDiff) {
        anchored.push(thread);
      } else {
        orphaned.push(thread);
      }
    }

    return { anchoredThreads: anchored, orphanedThreads: orphaned };
  }, [allFileThreads, file.hunks, allExpandedLines]);

  const handleSelectionComplete = useCallback((selection: LineSelection) => {
    if (!commentsEnabled) {
      return;
    }
    onPendingSelectionChange(selection);
  }, [onPendingSelectionChange, commentsEnabled]);

  const { isLineInSelection, handleLineMouseDown, handleLineMouseEnter } = useLineSelection({
    filePath,
    onSelectionComplete: handleSelectionComplete,
  });

  const handleCommentClickFn = useCallback((line: number, side: CommentSide) => {
    onPendingSelectionChange({
      filePath,
      side,
      startLine: line,
      endLine: line,
    });
  }, [filePath, onPendingSelectionChange]);

  const handleCommentClick = commentsEnabled ? handleCommentClickFn : undefined;

  const handleCancelPending = useCallback(() => {
    onPendingSelectionChange(null);
  }, [onPendingSelectionChange]);

  const isLineSelected = useCallback((line: number, side: CommentSide) => {
    if (isLineInSelection(line, side)) {
      return true;
    }
    if (pendingSelection && pendingSelection.filePath === filePath && pendingSelection.side === side) {
      return line >= pendingSelection.startLine && line <= pendingSelection.endLine;
    }
    for (const thread of fileThreads) {
      if (thread.side === side && line >= thread.startLine && line <= thread.endLine && thread.status === 'open') {
        return true;
      }
    }
    return false;
  }, [isLineInSelection, pendingSelection, filePath, fileThreads]);


  const resolvedTheme = useThemeStore((state) => state.theme);
  const shapeKey = useMemo(() => diffShapeKey(file), [file]);
  const cacheKey = `${shapeKey}:${resolvedTheme}`;
  const [syntaxMap, setSyntaxMap] = useState<Map<string, SyntaxToken[]> | undefined>(() => (highlightCode ? syntaxCache.get(cacheKey) : undefined));

  const versionsWanted = !!highlightCode && rendersLines && file.status !== 'added' && file.status !== 'deleted'
    && (file.oldFileLineCount ?? 0) <= HIGHLIGHT_MAX_ROWS && !syntaxCache.has(cacheKey);
  const versions = useQuery({
    queryKey: ['file-versions', filePath, file.oldPath, baseRef ?? null, 'syntax', shapeKey],
    queryFn: () => fetchFileVersions(filePath, file.oldPath, baseRef),
    enabled: versionsWanted,
    staleTime: Infinity,
  });
  const versionsSettled = !versionsWanted || versions.isSuccess || versions.isError;

  useEffect(() => {
    if (!highlightCode || !rendersLines) {
      return;
    }
    const cached = syntaxCache.get(cacheKey);
    if (cached) {
      setSyntaxMap(cached);
      return;
    }
    if (!versionsSettled || getRowCount(file) > HIGHLIGHT_MAX_ROWS) {
      return;
    }

    const plan = planSyntaxSources(file.hunks, versions.data ?? null, HIGHLIGHT_MAX_ROWS);
    const tokens: SideTokens = { old: new Map(), new: new Map() };
    const showProgress = () => setSyntaxMap(buildSyntaxMap(file.hunks, tokens, plan.fullNew));
    const finish = () => {
      const map = buildSyntaxMap(file.hunks, tokens, plan.fullNew);
      rememberSyntax(cacheKey, map);
      setSyntaxMap(map);
    };
    const highlightInline = (delayMs: number) => runInSteps(tokenizeSources(plan.sources, highlightCode, tokens), delayMs, showProgress, finish);
    const lang = getLang(filePath);
    if (!lang) {
      return highlightInline(HIGHLIGHT_DELAY_MS);
    }
    // The worker keeps tokenizing off the main thread, so scrolling never waits on it; inline is the fallback.
    let cancel = () => {};
    let lastProgress = 0;
    const timer = window.setTimeout(() => {
      const cancelWorker = highlightInWorker(lang, resolvedTheme, plan.sources, tokens, () => {
        const now = performance.now();
        if (now - lastProgress > HIGHLIGHT_PROGRESS_MS) {
          lastProgress = now;
          showProgress();
        }
      }, (ok) => {
        if (ok) {
          finish();
          return;
        }
        cancel = highlightInline(0);
      });
      cancel = cancelWorker ?? highlightInline(0);
    }, HIGHLIGHT_DELAY_MS);
    return () => {
      window.clearTimeout(timer);
      cancel();
    };
  }, [file, filePath, highlightCode, cacheKey, resolvedTheme, rendersLines, versionsSettled, versions.data]);

  const gaps = useMemo(() => {
    if (isNewFile) {
      return [];
    }
    return computeGaps(file.hunks, fileLineCount);
  }, [file.hunks, fileLineCount, isNewFile]);

  const gapMap = useMemo(() => {
    const map = new Map<string, ExpandableGap>();
    for (const gap of gaps) {
      map.set(gap.id, gap);
    }
    return map;
  }, [gaps]);

  const handleExpand = useCallback(async (gap: ExpandableGap, direction: 'up' | 'down' | 'all') => {
    setLoadingGap({ id: gap.id, direction });

    const lines = await queryClient.ensureQueryData(
      fileContentOptions(fileContentPath, true, baseRef)
    );

    setExpansions(prev => {
      const next = new Map(prev);
      const existing = next.get(gap.id) || { fromTop: 0, fromBottom: 0, linesFromTop: [], linesFromBottom: [] };
      const newOffset = gap.newStart - gap.oldStart;
      const range = getExpandRange(gap, direction, existing);

      if (!range) {
        return prev;
      }

      const contextLines = createContextLines(lines, range.oldStart, range.oldEnd, newOffset);

      if (direction === 'all') {
        next.set(gap.id, {
          fromTop: gap.oldEnd - gap.oldStart + 1,
          fromBottom: 0,
          linesFromTop: contextLines,
          linesFromBottom: [],
        });
      } else if (direction === 'down') {
        const newExpansion = {
          ...existing,
          fromTop: existing.fromTop + (range.oldEnd - range.oldStart + 1),
          linesFromTop: [...existing.linesFromTop, ...contextLines],
        };
        next.set(gap.id, newExpansion);
      } else {
        const newExpansion = {
          ...existing,
          fromBottom: existing.fromBottom + (range.oldEnd - range.oldStart + 1),
          linesFromBottom: [...contextLines, ...existing.linesFromBottom],
        };
        next.set(gap.id, newExpansion);
      }

      return next;
    });

    setLoadingGap(null);
  }, [fileContentPath, queryClient, baseRef, setExpansions]);

  const getGapRemaining = useCallback((gap: ExpandableGap): { total: number; up: number; down: number } => {
    const expansion = expansions.get(gap.id);
    if (!expansion) {
      return { total: gap.totalLines, up: gap.totalLines, down: gap.totalLines };
    }
    const total = Math.max(0, gap.totalLines - expansion.fromTop - expansion.fromBottom);
    const up = Math.max(0, gap.totalLines - expansion.fromTop);
    const down = Math.max(0, gap.totalLines - expansion.fromBottom);
    return { total, up, down };
  }, [expansions]);

  const getExpandControlsForHunk = useCallback((hunkIndex: number) => {
    let gap: ExpandableGap | undefined;
    let position: 'top' | 'between' = 'between';

    if (hunkIndex === 0) {
      gap = gapMap.get('top');
      position = 'top';
    } else {
      gap = gapMap.get(`between-${hunkIndex - 1}`);
      position = 'between';
    }

    if (!gap) {
      return undefined;
    }

    const remaining = getGapRemaining(gap);
    const wasExpanded = expansions.has(gap.id);

    return {
      position,
      remainingLines: remaining.total,
      remainingUp: remaining.up,
      remainingDown: remaining.down,
      loadingDirection: loadingGap?.id === gap.id ? loadingGap.direction : null,
      wasExpanded,
      onExpand: (dir: 'up' | 'down' | 'all') => handleExpand(gap, dir),
    };
  }, [gapMap, getGapRemaining, loadingGap, handleExpand, expansions]);

  const slicedView = useMemo(() => getRowCount(file) > SLICE_ROW_THRESHOLD, [file]);
  const hunkUnits = useMemo(() => file.hunks.flatMap((hunk, index) => {
    const parts = slicedView ? sliceHunk(hunk) : [hunk];
    return parts.map((part, n) => ({ hunk: part, index, first: n === 0, key: `${index}-${n}` }));
  }), [file, slicedView]);
  const pinnedLines = useMemo(() => {
    const set = new Set<string>();
    for (const thread of fileThreads) {
      set.add(`${thread.side}:${thread.endLine}`);
    }
    if (pendingSelection && pendingSelection.filePath === filePath) {
      set.add(`${pendingSelection.side}:${pendingSelection.endLine}`);
    }
    return set;
  }, [fileThreads, pendingSelection, filePath]);
  const findKey = useCurrentFindKey(filePath);
  const guideLine = useGuideFocusLine(filePath);
  const isPinnedSlice = (hunk: DiffHunk) => (pinnedLines.size > 0 || findKey !== null || guideLine !== null) && hunk.lines.some((line) =>
    (line.oldLineNumber !== null && pinnedLines.has(`old:${line.oldLineNumber}`)) || (line.newLineNumber !== null && pinnedLines.has(`new:${line.newLineNumber}`))
    || (findKey !== null && diffLineKey(line) === findKey)
    || (guideLine !== null && ((line.oldLineNumber !== null && guideLine === `old:${line.oldLineNumber}`) || (line.newLineNumber !== null && guideLine === `new:${line.newLineNumber}`))));

  const total = file.additions + file.deletions;
  const addBlocks = total > 0 ? Math.round((file.additions / total) * Math.min(5, total)) : 0;
  const delBlocks = total > 0 ? Math.min(5, total) - addBlocks : 0;
  const neutralBlocks = 5 - addBlocks - delBlocks;

  const bottomGap = gapMap.get('bottom');
  const bottomRemaining = bottomGap ? getGapRemaining(bottomGap).total : 0;

  const filePendingSelection = pendingSelection && pendingSelection.filePath === filePath ? pendingSelection : null;

  return (
    <div
      className={`border rounded-lg overflow-clip scroll-mt-4 ${highlighted ? 'animate-flash-highlight-border' : 'border-border'}`}
      id={`file-${encodeURIComponent(filePath)}`}
      data-find-scope={filePath}
      onAnimationEnd={() => onHighlightEnd?.(filePath)}
    >
      <div
        className={`group flex items-center gap-2 h-9 pl-2 pr-3 text-xs sticky top-0 z-10 ${collapsed ? '' : 'shadow-sticky'} ${highlighted ? 'animate-flash-highlight' : 'bg-bg-secondary'}`}
      >
        <IconButton
          className="w-5 h-5 shrink-0"
          onClick={() => onToggleCollapse(filePath)}
          title={collapsed ? 'Expand' : 'Collapse'}
        >
          <ChevronIcon expanded={!collapsed} />
        </IconButton>
        <button
          className="flex min-w-0 font-mono text-[calc(var(--code-size)-0.5px)] text-left cursor-pointer hover:[&_span]:text-text transition-colors"
          onClick={() => onToggleCollapse(filePath)}
        >
          {showRename ? (
            <span className="flex min-w-0 whitespace-pre">
              <PathLabel path={file.oldPath} className="line-through shrink-[100]" nameClassName="text-text-muted" />
              <span className="shrink-0 text-text-muted"> → </span>
              <PathLabel path={file.newPath} nameClassName="font-medium" />
            </span>
          ) : (
            <PathLabel path={filePath} nameClassName="font-medium" />
          )}
        </button>
        {file.status !== 'modified' && <StatusBadge status={file.status} />}
        {file.isBinary && <Badge className="bg-bg-tertiary text-text-muted">Binary</Badge>}
        {sinceViewed && (
          <SinceViewedBadge
            canDiff={sinceViewed.canDiff}
            open={showSinceViewed}
            onToggle={() => {
              setShowSinceViewed(!showSinceViewed);
              if (collapsed) {
                onToggleCollapse(filePath);
              }
            }}
          />
        )}
        <div className="ml-auto flex items-center gap-2.5 shrink-0">
          <div className="flex items-center opacity-0 group-hover:opacity-100 focus-within:opacity-100 has-[[aria-expanded=true]]:opacity-100 transition-opacity">
            <FileCardMenu
              file={file}
              path={filePath}
              viewRef={baseRef ?? 'work'}
              editorName={editorName}
              onOpenInEditor={file.status !== 'deleted' ? handleOpenInEditor : null}
              onRevert={canRevert ? () => setConfirmRevertFile(true) : null}
            />
          </div>
          {renderable && (
            <button
              onClick={() => setRichView(!richView)}
              className={`inline-flex items-center gap-1 h-6 px-2 rounded-md text-xs transition-colors cursor-pointer ${richView ? 'bg-selected text-text' : 'text-text-secondary hover:text-text hover:bg-hover'}`}
              title={richView ? 'Show source diff' : 'Show rich diff'}
            >
              {richView ? <CodeIcon className="w-3 h-3" /> : <FileIcon className="w-3 h-3" />}
              {richView ? 'Source' : 'Preview'}
            </button>
          )}
          {commentsEnabled && (
            <button
              onClick={() => {
                setShowFileForm(true);
                if (collapsed) {
                  onToggleCollapse(filePath);
                }
              }}
              className={cn(
                'inline-flex items-center gap-1 h-6 px-1.5 rounded-md text-xs text-text-secondary hover:text-text hover:bg-hover transition-colors cursor-pointer',
                fileThreads.length + wholeFileThreads.length === 0 && 'opacity-0 group-hover:opacity-100 focus-visible:opacity-100',
              )}
              title="Comment on this file"
              aria-label="Comment on this file"
            >
              <CommentIcon className="w-3.5 h-3.5" />
              {fileThreads.length + wholeFileThreads.length > 0 && fileThreads.length + wholeFileThreads.length}
            </button>
          )}
          {orphanedThreads.length > 0 && (
            <button
              onClick={openComments}
              className="cursor-pointer"
              title="Comments on lines that are no longer in this diff. Open them in the Comments panel."
            >
              <ThreadBadge variant="outdated" size="sm">
                {orphanedThreads.length} outdated
              </ThreadBadge>
            </button>
          )}
          <div className="flex items-center gap-1.5">
            <DiffStats additions={file.additions} deletions={file.deletions} />
            <div className="flex gap-px">
              {Array.from({ length: addBlocks }).map((_, i) => (
                <span key={`a${i}`} className="w-1.5 h-1.5 rounded-sm bg-diff-added" />
              ))}
              {Array.from({ length: delBlocks }).map((_, i) => (
                <span key={`d${i}`} className="w-1.5 h-1.5 rounded-sm bg-diff-deleted" />
              ))}
              {Array.from({ length: neutralBlocks }).map((_, i) => (
                <span key={`n${i}`} className="w-1.5 h-1.5 rounded-sm bg-border" />
              ))}
            </div>
          </div>
          <label className="flex items-center gap-1.5 h-6 px-1.5 -mr-1.5 rounded-md text-xs text-text-secondary cursor-pointer select-none hover:text-text hover:bg-hover transition-colors">
            <input
              type="checkbox"
              checked={reviewed}
              onChange={() => onReviewedChange(filePath, !reviewed)}
              className="accent-accent cursor-pointer w-3.5 h-3.5"
            />
            Viewed
          </label>
        </div>
      </div>
      {!collapsed && (
        <div>
          {commentsEnabled && (
            <FileComments
              filePath={filePath}
              threads={wholeFileThreads}
              commentActions={commentActions}
              showForm={showFileForm}
              onAdd={(body, options) => rawAddThread(filePath, 'new', 0, 0, body, DEFAULT_AUTHOR, undefined, options)}
              onCloseForm={() => setShowFileForm(false)}
            />
          )}
          {sinceViewed?.canDiff && showSinceViewed && (
            <SinceViewedDiff
              sessionId={sinceViewed.sessionId}
              viewRef={sinceViewed.viewRef}
              filePath={filePath}
              version={sinceViewed.version}
              viewMode={viewMode}
              onClose={() => setShowSinceViewed(false)}
            />
          )}
          {richView && renderable ? (
            <RichDiffViewer filePath={filePath} oldPath={file.oldPath} status={file.status} baseRef={baseRef} />
          ) : heldBack ? (
            <div className="flex items-center justify-center gap-3 h-14 px-4 text-[13px] text-text-muted">
              <span>{heldBack.reason} · {heldBack.rows.toLocaleString()} changed line{heldBack.rows === 1 ? '' : 's'} hidden</span>
              <button className={cn(buttonOutline, 'h-6 px-2 text-xs')} onClick={heldBack.onLoad}>
                Load diff
              </button>
            </div>
          ) : loadingPatch ? (
            <div className="flex items-center justify-center gap-2 h-14 px-4 text-[13px] text-text-muted">
              <Spinner className="h-3.5 w-3.5" />
              Loading diff…
            </div>
          ) : file.isBinary ? (
            <div className="p-4 text-center text-text-muted italic">Binary file not shown</div>
          ) : file.hunks.length === 0 ? (
            <div className="p-4 text-center text-text-muted italic">
              {file.oldMode && file.newMode
                ? `File mode changed from ${file.oldMode} to ${file.newMode}`
                : 'No content changes'}
            </div>
          ) : (
            <>
            <table ref={tableRef} className="w-full border-collapse table-fixed">
              {viewMode === 'split' ? (
                <colgroup>
                  <col className="w-(--gutter-w)" />
                  <col className="w-[calc(50%-var(--gutter-w))]" />
                  <col className="w-(--gutter-w)" />
                  <col />
                </colgroup>
              ) : (
                <colgroup>
                  <col className="w-(--gutter-w)" />
                  <col className="w-(--gutter-w)" />
                  <col className="w-5" />
                  <col />
                </colgroup>
              )}
              {hunkUnits.map((unit) => {
                const i = unit.index;
                const betweenGap = unit.first && i > 0 ? gapMap.get(`between-${i - 1}`) : undefined;
                const betweenExpansion = betweenGap ? expansions.get(betweenGap.id) : undefined;
                const topExpansion = unit.first && i === 0 ? expansions.get('top') : undefined;
                const block = (
                  <HunkWithGap
                    key={unit.key}
                    hunk={unit.hunk}
                    viewMode={viewMode}
                    syntaxMap={syntaxMap}
                    expandControls={unit.first ? getExpandControlsForHunk(i) : undefined}
                    topExpansionLines={unit.first && i === 0 ? [...(topExpansion?.linesFromTop ?? []), ...(topExpansion?.linesFromBottom ?? [])] : undefined}
                    gapExpansion={betweenExpansion}
                    gapId={betweenGap?.id}
                    highlightCode={highlightCode}
                    threads={fileThreads}
                    pendingSelection={filePendingSelection}
                    currentAuthor={DEFAULT_AUTHOR}
                    isLineSelected={isLineSelected}
                    onLineMouseDown={handleLineMouseDown}
                    onLineMouseEnter={handleLineMouseEnter}
                    onCommentClick={handleCommentClick}
                    onAddThread={addThread}
                    onReply={addReply}
                    onResolve={resolveThread}
                    onUnresolve={unresolveThread}
                    onEditComment={editComment}
                    onDeleteComment={deleteComment}
                    onDeleteThread={deleteThread}
                    onCancelPending={handleCancelPending}
                    filePath={filePath}
                    onRevertChange={canRevert ? (h: DiffHunk, startIndex: number, endIndex: number) => setConfirmRevertChange({ hunk: h, startIndex, endIndex }) : undefined}
                    getOriginalCode={getOriginalCode}
                  />
                );
                if (!slicedView) {
                  return block;
                }
                return (
                  <LazySlice key={unit.key} rows={sliceRowCount(unit.hunk.lines, viewMode === 'split') + (unit.first ? 1 : 0)} pinned={isPinnedSlice(unit.hunk)}>
                    {block}
                  </LazySlice>
                );
              })}
              {bottomGap && (() => {
                const bottomExpansion = expansions.get('bottom');
                const bottomLines = [
                  ...(bottomExpansion?.linesFromTop ?? []),
                  ...(bottomExpansion?.linesFromBottom ?? []),
                ];
                const bottomSyntaxMap = buildExpansionSyntaxMap(bottomLines, syntaxMap, highlightCode);
                const bottomCommentProps = {
                  isLineSelected, onLineMouseDown: handleLineMouseDown, onLineMouseEnter: handleLineMouseEnter,
                  onCommentClick: handleCommentClick, threads: fileThreads, pendingSelection: filePendingSelection,
                  currentAuthor: DEFAULT_AUTHOR, onAddThread: addThread, onReply: addReply,
                  onResolve: resolveThread, onUnresolve: unresolveThread, onEditComment: editComment, onDeleteComment: deleteComment,
                  onDeleteThread: deleteThread, onCancelPending: handleCancelPending, filePath,
                  getOriginalCode,
                };
                return (
                  <tbody>
                    {bottomExpansion?.linesFromTop && bottomExpansion.linesFromTop.length > 0 &&
                      renderExpansionRows(bottomExpansion.linesFromTop, viewMode, 'bottom-top', bottomSyntaxMap, bottomCommentProps)}
                    <ExpandRow
                      position="bottom"
                      remainingLines={bottomRemaining}
                      loading={loadingGap?.id === 'bottom'}
                      onExpand={(dir) => handleExpand(bottomGap, dir)}
                    />
                    {bottomExpansion?.linesFromBottom && bottomExpansion.linesFromBottom.length > 0 &&
                      renderExpansionRows(bottomExpansion.linesFromBottom, viewMode, 'bottom-bot', bottomSyntaxMap, bottomCommentProps)}
                  </tbody>
                );
              })()}
            </table>
            <CodeScrollbar tableRef={tableRef} enabled={!wrapLines} />
            </>
          )}
        </div>
      )}
      {confirmRevertFile && (
        <ConfirmDialog
          title="Revert file"
          message={`This will discard all changes to ${filePath}. This cannot be undone.`}
          confirmLabel="Revert"
          onConfirm={handleRevertFile}
          onCancel={() => setConfirmRevertFile(false)}
        />
      )}
      {confirmRevertChange && (
        <ConfirmDialog
          title="Undo change"
          message="This will undo the selected change. This cannot be undone."
          onConfirm={() => handleRevertChange(confirmRevertChange)}
          onCancel={() => setConfirmRevertChange(null)}
        />
      )}
    </div>
  );
}
