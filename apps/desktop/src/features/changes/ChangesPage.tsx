import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import {
  CodeSurface,
  hunkForRange,
  hunkToPatch,
  listHunks,
  snippetFor,
  type CodeSurfaceHandle,
  type SurfaceItem,
  type SurfaceRange,
  type SurfaceSelection,
} from '@/components/diff-surface';
import { previewKind } from '@/components/markdown/RichContent';
import { confirmDialog } from '@/components/ui/ConfirmDialog';
import { EmptyState } from '@/components/ui/EmptyState';
import { ResizeHandle } from '@/components/ui/ResizeHandle';
import { CheckCircleIcon, AlertIcon } from '@/components/ui/icon';
import { Spinner } from '@/components/ui/Spinner';
import * as api from '@/lib/api';
import { hashNumber } from '@/lib/hash';
import { queryClient, queryKeys } from '@/lib/query';
import type { ContextChip, Thread } from '@/lib/types';
import { AnnotationStack } from '@/features/comments/AnnotationStack';
import type { CommentAnnotation } from '@/features/comments/annotation-types';
import { useCommentDraft } from '@/features/comments/draft-store';
import { GeneralComments } from '@/features/comments/GeneralComments';
import { OrphanedThreads } from '@/features/comments/OrphanedThreads';
import { isFileLevel } from '@/features/comments/thread-utils';
import { useCommentActions, useThreads } from '@/features/comments/use-threads';
import { SelectionActionBar } from '@/features/workspace/SelectionActionBar';
import { useViewStore } from '@/features/workspace/view-store';
import { useWorkspace } from '@/features/workspace/workspace-context';
import { useChangesStore } from './changes-store';
import { CommentNavBar } from './CommentNavBar';
import { CollapseToggle, FileHeaderActions } from './FileHeader';
import { FileSidebar } from './FileSidebar';
import { RichPreview, type PreviewSide } from './RichPreview';
import { StaleBanner } from './StaleBanner';
import { useChangesHotkeys } from './use-changes-hotkeys';
import { contentHash, useDiffData, type DiffEntry } from './use-diff';
import { useDiffStaleness } from './use-staleness';
import { useLineMaps, useThreadLayout } from './use-thread-layout';
import { useViewed } from './use-viewed';
import { useRevealRequests } from './use-reveal-requests';

export type ChangesAnnotation = CommentAnnotation | { kind: 'preview'; which: PreviewSide };

const BIG_FILE_LINES = 1500;
const BIG_DIFF_LINES = 25000;

function previewAnnotations(entry: DiffEntry, diffStyle: 'split' | 'unified'): SurfaceItem<ChangesAnnotation>['annotations'] {
  const status = entry.summary.status;
  const hasOld = status !== 'added' && status !== 'untracked';
  const hasNew = status !== 'deleted';
  if (diffStyle === 'unified' || !hasOld || !hasNew) {
    return [{ side: hasNew ? 'new' : 'old', line: 0, data: { kind: 'preview', which: hasOld && hasNew ? 'both' : hasOld ? 'old' : 'new' } }];
  }
  return [
    { side: 'old', line: 0, data: { kind: 'preview', which: 'old' } },
    { side: 'new', line: 0, data: { kind: 'preview', which: 'new' } },
  ];
}

export function ChangesPage() {
  const { repoPath, ref, sessionId } = useWorkspace();
  const diff = useDiffData();
  const threads = useThreads(sessionId);
  const actions = useCommentActions(sessionId);
  const { viewedMap, setViewed } = useViewed(sessionId);
  const stale = useDiffStaleness(diff.result?.fingerprint);
  const diffStyle = useViewStore((s) => s.diffStyle);
  const wordDiff = useViewStore((s) => s.wordDiff);
  const wrapLines = useViewStore((s) => s.wrapLines);
  const sidebarWidth = useViewStore((s) => s.sidebarWidth);
  const setSidebarWidth = useViewStore((s) => s.setSidebarWidth);
  const draft = useCommentDraft((s) => s.draft);
  const setDraft = useCommentDraft((s) => s.setDraft);
  const setActiveThread = useCommentDraft((s) => s.setActiveThread);
  const collapsedOverrides = useChangesStore((s) => s.collapsed);
  const previews = useChangesStore((s) => s.previews);
  const filter = useChangesStore((s) => s.filter);
  const onlyCommented = useChangesStore((s) => s.onlyCommented);
  const setCollapsed = useChangesStore((s) => s.setCollapsed);
  const setAllCollapsed = useChangesStore((s) => s.setAllCollapsed);
  const togglePreview = useChangesStore((s) => s.togglePreview);
  const setCurrentFile = useChangesStore((s) => s.setCurrentFile);
  const resetChanges = useChangesStore((s) => s.reset);
  const surfaceRef = useRef<CodeSurfaceHandle>(null);
  const [selection, setSelection] = useState<SurfaceSelection | null>(null);

  const entries = diff.entries;
  const lineMaps = useLineMaps(entries);
  const layout = useThreadLayout(entries, threads, lineMaps);
  const resolved = diff.result?.resolved;
  const canRevert = resolved?.canRevert ?? false;

  useEffect(() => {
    resetChanges();
    setSelection(null);
    setDraft(null);
  }, [ref, resetChanges, setDraft]);

  const previousDraft = useRef(draft);
  useEffect(() => {
    if (previousDraft.current && !draft) {
      setSelection(null);
    }
    previousDraft.current = draft;
  }, [draft]);

  const entriesByPath = useMemo(() => new Map(entries.map((e) => [e.summary.path, e])), [entries]);

  const hashes = useMemo(() => new Map(entries.map((e) => [e.summary.path, contentHash(e)])), [entries]);

  const viewedPaths = useMemo(() => {
    const set = new Set<string>();
    for (const [path, hash] of hashes) {
      if (viewedMap.get(path) === hash) {
        set.add(path);
      }
    }
    return set;
  }, [hashes, viewedMap]);

  const totalChanged = useMemo(() => entries.reduce((sum, e) => sum + e.changedLines, 0), [entries]);

  const isBig = useCallback(
    (entry: DiffEntry) => entry.changedLines > BIG_FILE_LINES || totalChanged > BIG_DIFF_LINES,
    [totalChanged],
  );

  const isCollapsed = useCallback(
    (entry: DiffEntry) => {
      const override = collapsedOverrides.get(entry.summary.path);
      if (override !== undefined) {
        return override;
      }
      return viewedPaths.has(entry.summary.path) || isBig(entry);
    },
    [collapsedOverrides, viewedPaths, isBig],
  );

  const visibleEntries = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    return entries.filter((entry) => {
      if (needle && !entry.summary.path.toLowerCase().includes(needle)) {
        return false;
      }
      if (onlyCommented && !layout.openCounts.get(entry.summary.path)) {
        return false;
      }
      return true;
    });
  }, [entries, filter, onlyCommented, layout.openCounts]);

  const dataKey = `${diff.result?.fingerprint ?? ''}:${diff.result?.patch.length ?? 0}`;

  const items = useMemo(() => {
    const result: SurfaceItem<ChangesAnnotation>[] = [];
    for (const entry of visibleEntries) {
      if (!entry.fileDiff) {
        continue;
      }
      const path = entry.summary.path;
      const annotations: SurfaceItem<ChangesAnnotation>['annotations'] = [];
      if (previews.has(path)) {
        annotations.push(...previewAnnotations(entry, diffStyle));
      }
      for (const thread of layout.anchored.get(path) ?? []) {
        const fileLevel = isFileLevel(thread);
        annotations.push({
          side: fileLevel ? 'new' : thread.side,
          line: fileLevel ? 0 : thread.endLine,
          data: { kind: 'thread', threadId: thread.id },
        });
      }
      if (draft?.scope === 'diff' && draft.filePath === path) {
        annotations.push({ side: draft.startLine === 0 ? 'new' : draft.side, line: draft.endLine, data: { kind: 'draft' } });
      }
      const collapsed = isCollapsed(entry);
      const key = `${dataKey}|${collapsed}|${annotations.map((a) => `${a.side}${a.line}${JSON.stringify(a.data)}`).join(',')}`;
      result.push({ id: path, kind: 'diff', fileDiff: entry.fileDiff, collapsed, annotations, version: hashNumber(key) });
    }
    return result;
  }, [visibleEntries, previews, layout.anchored, draft, isCollapsed, dataKey, diffStyle]);

  const startDraft = useCallback(
    (path: string, range: SurfaceRange) => {
      const maps = lineMaps.get(path);
      setDraft({
        scope: 'diff',
        filePath: path,
        side: range.side,
        startLine: range.start,
        endLine: range.end,
        anchorContent: maps && range.start > 0 ? snippetFor(maps, range) : null,
      });
      setActiveThread(null);
      if (range.start > 0) {
        setSelection({ itemId: path, range });
      }
      setCollapsed(path, false);
    },
    [lineMaps, setDraft, setActiveThread, setCollapsed],
  );

  const refresh = useCallback(() => {
    diff.refetch();
    void queryClient.invalidateQueries({ queryKey: queryKeys.threads(sessionId ?? '') });
  }, [diff, sessionId]);

  const focusFile = useCallback(
    (path: string) => {
      setCollapsed(path, false);
      setCurrentFile(path);
      requestAnimationFrame(() => surfaceRef.current?.scrollToItem(path));
    },
    [setCollapsed, setCurrentFile],
  );

  const goToThread = useCallback(
    (thread: Thread) => {
      setActiveThread(thread.id);
      const entry = entriesByPath.get(thread.filePath);
      if (!entry || !layout.anchored.get(thread.filePath)?.includes(thread)) {
        surfaceRef.current?.scrollToTop();
        return;
      }
      setCollapsed(thread.filePath, false);
      setCurrentFile(thread.filePath);
      if (isFileLevel(thread)) {
        requestAnimationFrame(() => surfaceRef.current?.scrollToItem(thread.filePath));
        return;
      }
      const range = { side: thread.side, start: thread.startLine, end: thread.endLine };
      setSelection({ itemId: thread.filePath, range });
      requestAnimationFrame(() => surfaceRef.current?.scrollToLine(thread.filePath, thread.endLine, thread.side));
    },
    [entriesByPath, layout.anchored, setActiveThread, setCollapsed, setCurrentFile],
  );

  const toggleViewed = useCallback(
    (path: string) => {
      const hash = hashes.get(path);
      if (!hash) {
        return;
      }
      const nextViewed = !viewedPaths.has(path);
      setViewed({ filePath: path, contentHash: hash, viewed: nextViewed });
      setCollapsed(path, nextViewed);
    },
    [hashes, viewedPaths, setViewed, setCollapsed],
  );

  const allCollapsed = items.length > 0 && items.every((item) => item.collapsed);
  const toggleAll = useCallback(() => {
    setAllCollapsed(
      entries.map((e) => e.summary.path),
      !allCollapsed,
    );
  }, [entries, allCollapsed, setAllCollapsed]);

  useChangesHotkeys({
    surfaceRef,
    items,
    entriesByPath,
    focusFile,
    toggleViewed,
    toggleAll,
    clearSelection: () => {
      setSelection(null);
      setDraft(null);
      setActiveThread(null);
    },
  });

  useRevealRequests({ entriesByPath, lineMaps, focusFile, surfaceRef, setSelection });

  const chip = useMemo<ContextChip | null>(() => {
    if (!selection) {
      return null;
    }
    const maps = lineMaps.get(selection.itemId);
    return {
      filePath: selection.itemId,
      side: selection.range.side,
      startLine: selection.range.start,
      endLine: selection.range.end,
      snippet: maps ? snippetFor(maps, selection.range) : undefined,
    };
  }, [selection, lineMaps]);

  const selectionHunk = useMemo(() => {
    if (!selection || !canRevert) {
      return null;
    }
    const fileDiff = entriesByPath.get(selection.itemId)?.fileDiff;
    if (!fileDiff) {
      return null;
    }
    const hunk = hunkForRange(listHunks(fileDiff), selection.range);
    if (!hunk) {
      return null;
    }
    return { fileDiff, hunk };
  }, [selection, canRevert, entriesByPath]);

  const revertSelectionHunk = async () => {
    if (!selectionHunk) {
      return;
    }
    const patch = hunkToPatch(selectionHunk.fileDiff, selectionHunk.hunk.index);
    if (!patch) {
      return;
    }
    const ok = await confirmDialog({
      title: 'Revert hunk?',
      message: `Discard the changes in ${selectionHunk.hunk.header} of ${selectionHunk.fileDiff.name}.`,
      confirmLabel: 'Revert hunk',
      danger: true,
    });
    if (!ok) {
      return;
    }
    try {
      await api.revertHunk(repoPath, patch);
      toast.success('Hunk reverted');
      setSelection(null);
      refresh();
    } catch (error) {
      toast.error(api.errorMessage(error));
    }
  };

  const renderAnnotation = useCallback(
    (data: ChangesAnnotation[], itemId: string) => {
      const comments = data.filter((d): d is CommentAnnotation => d.kind !== 'preview');
      const preview = data.find((d) => d.kind === 'preview');
      return (
        <>
          {preview && (
            <RichPreview path={itemId} oldPath={entriesByPath.get(itemId)?.summary.oldPath ?? null} which={preview.which} />
          )}
          {comments.length > 0 && <AnnotationStack data={comments} threadsById={layout.threadsById} actions={actions} />}
        </>
      );
    },
    [entriesByPath, layout.threadsById, actions],
  );

  const renderHeaderPrefix = useCallback(
    (itemId: string) => {
      const entry = entriesByPath.get(itemId);
      if (!entry) {
        return null;
      }
      const collapsed = isCollapsed(entry);
      return <CollapseToggle collapsed={collapsed} onToggle={() => setCollapsed(itemId, !collapsed)} />;
    },
    [entriesByPath, isCollapsed, setCollapsed],
  );

  const renderHeaderActions = useCallback(
    (itemId: string) => {
      const entry = entriesByPath.get(itemId);
      if (!entry) {
        return null;
      }
      return (
        <FileHeaderActions
          entry={entry}
          repoPath={repoPath}
          canRevert={canRevert}
          viewed={viewedPaths.has(itemId)}
          openComments={layout.openCounts.get(itemId) ?? 0}
          previewable={previewKind(itemId) !== null && entry.summary.status !== 'deleted'}
          previewing={previews.has(itemId)}
          isBig={isBig(entry)}
          collapsed={isCollapsed(entry)}
          onToggleViewed={() => toggleViewed(itemId)}
          onTogglePreview={() => togglePreview(itemId)}
          onCommentFile={() => startDraft(itemId, { side: 'new', start: 0, end: 0 })}
          onReverted={refresh}
        />
      );
    },
    [entriesByPath, repoPath, canRevert, viewedPaths, layout.openCounts, previews, isBig, isCollapsed, toggleViewed, togglePreview, startDraft, refresh],
  );

  const renderTop = useCallback(
    () => (
      <div className="flex flex-col gap-2 pt-3">
        <GeneralComments threads={layout.general} actions={actions} />
        <OrphanedThreads threads={layout.orphaned} actions={actions} />
      </div>
    ),
    [layout.general, layout.orphaned, actions],
  );

  const scrollFrame = useRef(0);
  const onScroll = useCallback(() => {
    cancelAnimationFrame(scrollFrame.current);
    scrollFrame.current = requestAnimationFrame(() => {
      setCurrentFile(surfaceRef.current?.getTopItemId() ?? null);
    });
  }, [setCurrentFile]);

  const loadFiles = useCallback(
    (path: string, oldPath: string | null) =>
      queryClient.fetchQuery({
        queryKey: queryKeys.fileVersions(repoPath, ref, path),
        queryFn: () => api.getFileVersions(repoPath, ref, path, oldPath),
      }),
    [repoPath, ref],
  );

  if (diff.isLoading) {
    return (
      <div className="flex h-full items-center justify-center gap-2 text-xs text-fg-muted">
        <Spinner className="text-fg-subtle" /> Loading diff…
      </div>
    );
  }

  if (diff.error) {
    return (
      <EmptyState
        icon={<AlertIcon size={20} />}
        tone="danger"
        title="Could not load the diff"
        description={api.errorMessage(diff.error)}
      />
    );
  }

  if (entries.length === 0) {
    return (
      <div className="flex h-full flex-col">
        {stale && <StaleBanner onRefresh={refresh} />}
        <EmptyState
          icon={<CheckCircleIcon size={20} />}
          title="No changes"
          description={`Nothing to review for ${resolved?.label ?? ref}. Pick another ref from the toolbar to compare branches or commits.`}
        />
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0">
      <FileSidebar
        entries={visibleEntries}
        totalCount={entries.length}
        openCounts={layout.openCounts}
        viewedPaths={viewedPaths}
        allCollapsed={allCollapsed}
        onSelect={focusFile}
        onToggleAll={toggleAll}
        width={sidebarWidth}
      />
      <ResizeHandle value={sidebarWidth} onChange={setSidebarWidth} min={200} max={520} direction="right" />
      <div className="relative flex min-w-0 flex-1 flex-col">
        {stale && <StaleBanner onRefresh={refresh} />}
        <CommentNavBar
          label={resolved?.label ?? ref}
          files={entries.length}
          additions={entries.reduce((sum, e) => sum + e.summary.additions, 0)}
          deletions={entries.reduce((sum, e) => sum + e.summary.deletions, 0)}
          threads={threads}
          navigable={layout.navigable}
          onNavigate={goToThread}
        />
        <div className="min-h-0 flex-1">
          {items.length === 0 ? (
            <EmptyState title="No files match the current filter" />
          ) : (
            <CodeSurface<ChangesAnnotation>
              handleRef={surfaceRef}
              items={items}
              diffStyle={diffStyle}
              wordDiff={wordDiff}
              wrap={wrapLines}
              selection={selection}
              onSelectionChange={setSelection}
              onGutterClick={startDraft}
              loadFiles={loadFiles}
              renderAnnotation={renderAnnotation}
              renderHeaderPrefix={renderHeaderPrefix}
              renderHeaderActions={renderHeaderActions}
              renderTop={renderTop}
              onScroll={onScroll}
            />
          )}
        </div>
        <SelectionActionBar
          chip={chip}
          hidden={draft !== null}
          onComment={() => {
            if (!selection) {
              return;
            }
            startDraft(selection.itemId, selection.range);
          }}
          onClear={() => setSelection(null)}
          onRevertHunk={selectionHunk ? () => void revertSelectionHunk() : undefined}
        />
      </div>
    </div>
  );
}
