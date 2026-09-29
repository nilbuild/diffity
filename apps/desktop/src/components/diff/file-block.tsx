import { useState, useEffect, useMemo, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { DiffHunk } from '@diffity/parser';
import type { DiffFile, DiffLine as DiffLineType } from '@diffity/parser';
import type { SyntaxToken } from '../../lib/syntax-token';
import type { HighlightedTokens } from '../../hooks/use-highlighter';
import type { CommentAuthor, CommentSide, LineSelection, SubmitOptions } from '../comments/types';
import { type ViewMode, getFilePath, buildChangeGroupPatch, extractLinesFromDiff, extractLinesFromExpandedLines } from '../../lib/diff-utils';
import { revertHunk as apiRevertHunk, revertFile as apiRevertFile, openInEditor, errorMessage } from '../../lib/api';
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
import { useCopy } from '../../hooks/use-copy';
import { DiffStats } from './diff-stats';
import { Badge } from '../ui/badge';
import { IconButton } from '../ui/icon-button';
import { StatusBadge } from '../ui/status-badge';
import { PathLabel } from '../ui/path-label';
import { HunkWithGap } from './hunk-with-gap';
import { OrphanedThreads } from '../comments/orphaned-threads';
import { ThreadBadge } from '../ui/thread-badge';
import { buildExpansionSyntaxMap, renderExpansionRows } from './render-expansion-rows';
import { ExpandRow } from './expand-row';
import { CheckIcon, ChevronIcon, CodeIcon, CommentIcon, CopyIcon, EditorIcon, FileIcon, UndoIcon } from '../ui/icon';
import { useEditorName } from '../../hooks/use-editor-name';

export const LARGE_DIFF_LINE_THRESHOLD = 200;


function getTotalLineCount(file: DiffFile): number {
  let count = 0;
  for (const hunk of file.hunks) {
    count += hunk.lines.length;
  }
  return count;
}

interface FileBlockProps {
  file: DiffFile;
  viewMode: ViewMode;
  collapsed: boolean;
  onToggleCollapse: (path: string) => void;
  reviewed: boolean;
  onReviewedChange: (path: string, reviewed: boolean) => void;
  highlightLine?: (code: string) => HighlightedTokens[] | null;
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
  onHighlightEnd?: () => void;
}

interface GapExpansion {
  fromTop: number;
  fromBottom: number;
  linesFromTop: DiffLineType[];
  linesFromBottom: DiffLineType[];
}

const syntaxCache = new Map<string, Map<string, SyntaxToken[]>>();

function syntaxCacheKey(file: DiffFile): string {
  let length = 0;
  for (const hunk of file.hunks) {
    length += hunk.lines.length;
  }
  return `${getFilePath(file)}:${document.documentElement.dataset.theme ?? 'light'}:${length}:${file.additions}:${file.deletions}:${file.hunks[0]?.lines[0]?.content ?? ''}`;
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

export function FileBlock(props: FileBlockProps) {
  const {
    file, viewMode, collapsed, onToggleCollapse, reviewed, onReviewedChange, highlightLine, baseRef, canRevert, onRevert,
    threads: allThreads, commentsEnabled, commentActions, onAddThread: rawAddThread, pendingSelection, onPendingSelectionChange,
    highlighted, onHighlightEnd,
  } = props;

  const totalLines = getTotalLineCount(file);
  const isLargeDiff = totalLines >= LARGE_DIFF_LINE_THRESHOLD;

  const [largeDiffExpanded, setLargeDiffExpanded] = useState(false);
  const [expansions, setExpansions] = useState<Map<string, GapExpansion>>(new Map());
  const [loadingGap, setLoadingGap] = useState<{ id: string; direction: 'up' | 'down' | 'all' } | null>(null);

  const filePath = getFilePath(file);
  const showRename = file.status === 'renamed' && file.oldPath !== file.newPath;
  const isNewFile = file.status === 'added';

  const queryClient = useQueryClient();
  const fileContentPath = file.oldPath || filePath;
  const fileLineCount = file.oldFileLineCount ?? null;

  const { copied: pathCopied, copy: copyPath } = useCopy();

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

  const allFileThreads = useMemo(() => {
    return allThreads.filter(t => t.filePath === filePath && t.filePath !== GENERAL_THREAD_FILE_PATH);
  }, [allThreads, filePath]);

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


  const cacheKey = useMemo(() => syntaxCacheKey(file), [file]);
  const [syntaxMap, setSyntaxMap] = useState<Map<string, SyntaxToken[]> | undefined>(() => (highlightLine ? syntaxCache.get(cacheKey) : undefined));

  useEffect(() => {
    if (!highlightLine) {
      return;
    }
    const cached = syntaxCache.get(cacheKey);
    if (cached) {
      setSyntaxMap(cached);
      return;
    }

    const allLines: { content: string; type: string; num: number | null }[] = [];
    for (const hunk of file.hunks) {
      for (const line of hunk.lines) {
        const num = line.type === 'delete' ? line.oldLineNumber : line.newLineNumber;
        allLines.push({ content: line.content, type: line.type, num });
      }
    }

    let cancelled = false;
    const map = new Map<string, SyntaxToken[]>();
    let index = 0;
    const CHUNK_SIZE = 50;

    const processChunk = () => {
      if (cancelled) {
        return;
      }

      const end = Math.min(index + CHUNK_SIZE, allLines.length);
      for (let i = index; i < end; i++) {
        const line = allLines[i];
        const highlighted = highlightLine(line.content);
        if (highlighted && highlighted.length > 0) {
          const key = `${line.type}-${line.num}`;
          map.set(key, highlighted[0].tokens);
        }
      }

      index = end;
      if (index < allLines.length) {
        requestAnimationFrame(processChunk);
      } else if (!cancelled) {
        rememberSyntax(cacheKey, map);
        setSyntaxMap(new Map(map));
      }
    };

    requestAnimationFrame(processChunk);

    return () => {
      cancelled = true;
    };
  }, [file, highlightLine, cacheKey]);

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
  }, [fileContentPath, queryClient, baseRef]);

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
      onAnimationEnd={onHighlightEnd}
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
          className="flex min-w-0 font-mono text-[12.5px] text-left cursor-pointer hover:[&_span]:text-text transition-colors"
          onClick={() => onToggleCollapse(filePath)}
        >
          {showRename ? (
            <span className="truncate">
              <span className="line-through text-text-muted">{file.oldPath}</span>
              <span className="text-text-muted"> → </span>
              <PathLabel path={file.newPath} nameClassName="font-medium" />
            </span>
          ) : (
            <PathLabel path={filePath} nameClassName="font-medium" />
          )}
        </button>
        <button
          onClick={() => copyPath(filePath)}
          className="shrink-0 text-text-muted hover:text-text transition-colors cursor-pointer opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
          title="Copy file path"
        >
          {pathCopied ? (
            <CheckIcon className="w-3 h-3 text-added" />
          ) : (
            <CopyIcon className="w-3 h-3" />
          )}
        </button>
        {file.status !== 'modified' && <StatusBadge status={file.status} />}
        {file.isBinary && <Badge className="bg-bg-tertiary text-text-muted">Binary</Badge>}
        <div className="ml-auto flex items-center gap-2.5 shrink-0">
          <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
            {file.status !== 'deleted' && (
              <button
                onClick={handleOpenInEditor}
                className="w-6 h-6 inline-flex items-center justify-center rounded-md text-text-secondary hover:text-text hover:bg-hover transition-colors cursor-pointer"
                title={`Open in ${editorName}`}
              >
                <EditorIcon size="sm" />
              </button>
            )}
            {canRevert && (
              <button
                onClick={() => setConfirmRevertFile(true)}
                className="w-6 h-6 inline-flex items-center justify-center rounded-md text-text-secondary hover:text-deleted hover:bg-hover transition-colors cursor-pointer"
                title="Revert file"
              >
                <UndoIcon className="w-3.5 h-3.5" />
              </button>
            )}
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
          {(fileThreads.length + orphanedThreads.length) > 0 && (
            <span className="text-xs text-text-secondary flex items-center gap-1">
              <CommentIcon className="w-3.5 h-3.5" />
              {fileThreads.length + orphanedThreads.length}
              {orphanedThreads.length > 0 && (
                <ThreadBadge variant="outdated" size="sm">
                  {orphanedThreads.length} outdated
                </ThreadBadge>
              )}
            </span>
          )}
          <div className="flex items-center gap-1.5">
            <DiffStats additions={file.additions} deletions={file.deletions} />
            <div className="flex gap-px">
              {Array.from({ length: addBlocks }).map((_, i) => (
                <span key={`a${i}`} className="w-1.5 h-1.5 rounded-sm bg-added" />
              ))}
              {Array.from({ length: delBlocks }).map((_, i) => (
                <span key={`d${i}`} className="w-1.5 h-1.5 rounded-sm bg-deleted" />
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
          {richView && renderable ? (
            <RichDiffViewer filePath={filePath} oldPath={file.oldPath} status={file.status} baseRef={baseRef} />
          ) : file.isBinary ? (
            <div className="p-4 text-center text-text-muted italic">Binary file not shown</div>
          ) : file.hunks.length === 0 ? (
            <div className="p-4 text-center text-text-muted italic">
              {file.oldMode && file.newMode
                ? `File mode changed from ${file.oldMode} to ${file.newMode}`
                : 'No content changes'}
            </div>
          ) : isLargeDiff && !largeDiffExpanded && allFileThreads.length === 0 ? (
            <div className="flex items-center justify-center gap-3 py-6 px-4 text-sm text-text-muted">
              <span>Large diff not rendered — {totalLines} lines</span>
              <button
                className="text-text underline decoration-text-muted/50 underline-offset-2 cursor-pointer font-medium"
                onClick={() => setLargeDiffExpanded(true)}
              >
                Load diff
              </button>
            </div>
          ) : (
            <>
            <OrphanedThreads
              threads={orphanedThreads}
              onEditComment={editComment}
              onDeleteComment={deleteComment}
              onDeleteThread={deleteThread}
            />
            <table className="w-full border-collapse table-fixed">
              {viewMode === 'split' ? (
                <colgroup>
                  <col className="w-12" />
                  <col className="w-[calc(50%-48px)]" />
                  <col className="w-12" />
                  <col />
                </colgroup>
              ) : (
                <colgroup>
                  <col className="w-12" />
                  <col className="w-12" />
                  <col className="w-5" />
                  <col />
                </colgroup>
              )}
              {file.hunks.map((hunk, i) => {
                const betweenGap = i > 0 ? gapMap.get(`between-${i - 1}`) : undefined;
                const betweenExpansion = betweenGap ? expansions.get(betweenGap.id) : undefined;
                const topExpansion = i === 0 ? expansions.get('top') : undefined;

                return (
                  <HunkWithGap
                    key={i}
                    hunk={hunk}
                    viewMode={viewMode}
                    syntaxMap={syntaxMap}
                    expandControls={getExpandControlsForHunk(i)}
                    topExpansionLines={i === 0 ? [...(topExpansion?.linesFromTop ?? []), ...(topExpansion?.linesFromBottom ?? [])] : undefined}
                    gapExpansion={betweenExpansion}
                    gapId={betweenGap?.id}
                    highlightLine={highlightLine}
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
              })}
              {bottomGap && (() => {
                const bottomExpansion = expansions.get('bottom');
                const bottomLines = [
                  ...(bottomExpansion?.linesFromTop ?? []),
                  ...(bottomExpansion?.linesFromBottom ?? []),
                ];
                const bottomSyntaxMap = buildExpansionSyntaxMap(bottomLines, highlightLine);
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
