import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { CodeSurface, type CodeSurfaceHandle, type SurfaceItem, type SurfaceRange, type SurfaceSelection } from '@/components/diff-surface';
import { RichContent, previewKind } from '@/components/markdown/RichContent';
import { EmptyState } from '@/components/ui/EmptyState';
import { IconButton } from '@/components/ui/IconButton';
import { SegmentedToggle } from '@/components/ui/SegmentedToggle';
import { Spinner } from '@/components/ui/Spinner';
import { CodeIcon, CommentIcon, CopyIcon, FileIcon, LightbulbIcon } from '@/components/ui/icon';
import * as api from '@/lib/api';
import { hashNumber } from '@/lib/hash';
import { queryKeys } from '@/lib/query';
import type { ContextChip, Thread } from '@/lib/types';
import { AnnotationStack } from '@/features/comments/AnnotationStack';
import type { CommentAnnotation } from '@/features/comments/annotation-types';
import { useCommentDraft } from '@/features/comments/draft-store';
import { OrphanedThreads } from '@/features/comments/OrphanedThreads';
import { isFileLevel } from '@/features/comments/thread-utils';
import type { CommentActions } from '@/features/comments/use-threads';
import { agentBus } from '@/features/workspace/agent-bus';
import { useRevealStore } from '@/features/workspace/reveal-store';
import { SelectionActionBar } from '@/features/workspace/SelectionActionBar';
import { useViewStore } from '@/features/workspace/view-store';
import { useWorkspace } from '@/features/workspace/workspace-context';
import { formatSize, imageMime } from './file-kinds';
import { ImageViewer } from './ImageViewer';

type ViewMode = 'code' | 'preview' | 'split';

export interface FileViewerProps {
  path: string;
  threads: Thread[];
  actions: CommentActions;
}

export function FileViewer(props: FileViewerProps) {
  const { path, threads, actions } = props;
  const { repoPath } = useWorkspace();
  const query = useQuery({
    queryKey: queryKeys.file(repoPath, path),
    queryFn: () => api.readFile(repoPath, path),
  });
  const kind = previewKind(path);
  const [mode, setMode] = useState<ViewMode>('code');

  useEffect(() => {
    setMode('code');
  }, [path]);

  const mime = imageMime(path);
  const file = query.data;

  return (
    <div className="flex h-full min-w-0 flex-col">
      <FileViewerHeader
        path={path}
        size={file?.size ?? null}
        mode={kind && file?.contents != null ? mode : null}
        onModeChange={setMode}
        onCommentFile={() =>
          useCommentDraft.getState().setDraft({ scope: 'tree', filePath: path, side: 'new', startLine: 0, endLine: 0, anchorContent: null })
        }
      />
      <div className="min-h-0 flex-1">
        {query.isLoading && (
          <div className="flex h-full items-center justify-center">
            <Spinner />
          </div>
        )}
        {query.error != null && <EmptyState title="Could not read file" description={api.errorMessage(query.error)} />}
        {file && mime && file.binary && <ImageViewer path={path} mime={mime} />}
        {file && !mime && (file.binary || file.contents === null) && (
          <EmptyState
            icon={<FileIcon size={20} />}
            title="Binary file not shown"
            description={`${formatSize(file.size)} · open it in your editor to inspect.`}
          />
        )}
        {file && file.contents !== null && !file.binary && (
          <TextFile path={path} contents={file.contents} mode={kind ? mode : 'code'} threads={threads} actions={actions} />
        )}
      </div>
    </div>
  );
}

interface FileViewerHeaderProps {
  path: string;
  size: number | null;
  mode: ViewMode | null;
  onModeChange: (mode: ViewMode) => void;
  onCommentFile: () => void;
}

function FileViewerHeader(props: FileViewerHeaderProps) {
  const { path, size, mode, onModeChange, onCommentFile } = props;
  const { repoPath } = useWorkspace();
  return (
    <div className="flex h-9 shrink-0 items-center gap-2 border-b border-border bg-canvas px-3 text-xs">
      <span className="truncate font-medium text-fg">{path}</span>
      {size !== null && <span className="text-fg-subtle">{formatSize(size)}</span>}
      <div className="ml-auto flex items-center gap-1">
        {mode && (
          <SegmentedToggle
            value={mode}
            size="sm"
            onChange={onModeChange}
            options={[
              { value: 'code', label: 'Code' },
              { value: 'split', label: 'Split' },
              { value: 'preview', label: 'Preview' },
            ]}
          />
        )}
        <IconButton size="sm" label="Comment on file" onClick={onCommentFile}>
          <CommentIcon size={14} />
        </IconButton>
        <IconButton size="sm" label="Explain with AI" onClick={() => agentBus.runAction({ kind: 'explain', path })}>
          <LightbulbIcon size={14} />
        </IconButton>
        <IconButton
          size="sm"
          label="Copy path"
          onClick={() => void navigator.clipboard.writeText(path).then(() => toast.success('Path copied'))}
        >
          <CopyIcon size={14} />
        </IconButton>
        <IconButton
          size="sm"
          label="Open in editor"
          onClick={() => api.openInEditor(repoPath, path).catch((error: unknown) => toast.error(api.errorMessage(error)))}
        >
          <CodeIcon size={14} />
        </IconButton>
      </div>
    </div>
  );
}

interface TextFileProps {
  path: string;
  contents: string;
  mode: ViewMode;
  threads: Thread[];
  actions: CommentActions;
}

function TextFile(props: TextFileProps) {
  const { path, contents, mode, threads, actions } = props;
  const wrapLines = useViewStore((s) => s.wrapLines);
  const draft = useCommentDraft((s) => s.draft);
  const setDraft = useCommentDraft((s) => s.setDraft);
  const setActiveThread = useCommentDraft((s) => s.setActiveThread);
  const surfaceRef = useRef<CodeSurfaceHandle>(null);
  const [selection, setSelection] = useState<SurfaceSelection | null>(null);

  const lines = useMemo(() => contents.split('\n'), [contents]);
  const lineCount = contents.endsWith('\n') ? lines.length - 1 : lines.length;

  useEffect(() => {
    setSelection(null);
  }, [path]);

  const previousDraft = useRef(draft);
  useEffect(() => {
    if (previousDraft.current && !draft) {
      setSelection(null);
    }
    previousDraft.current = draft;
  }, [draft]);

  const { anchored, orphaned, threadsById } = useMemo(() => {
    const byId = new Map(threads.map((t) => [t.id, t]));
    const fits: Thread[] = [];
    const lost: Thread[] = [];
    for (const thread of threads) {
      if (isFileLevel(thread) || thread.endLine <= lineCount) {
        fits.push(thread);
        continue;
      }
      lost.push(thread);
    }
    return { anchored: fits, orphaned: lost, threadsById: byId };
  }, [threads, lineCount]);

  const items = useMemo<SurfaceItem<CommentAnnotation>[]>(() => {
    const annotations: SurfaceItem<CommentAnnotation>['annotations'] = anchored.map((thread) => ({
      side: 'new',
      line: isFileLevel(thread) ? 0 : thread.endLine,
      data: { kind: 'thread', threadId: thread.id },
    }));
    if (draft?.scope === 'tree' && draft.filePath === path) {
      annotations.push({ side: 'new', line: draft.endLine, data: { kind: 'draft' } });
    }
    const key = `${path}:${contents.length}:${hashNumber(contents)}|${annotations.map((a) => `${a.line}${JSON.stringify(a.data)}`).join(',')}`;
    return [{ id: path, kind: 'file', name: path, contents, annotations, version: hashNumber(key) }];
  }, [anchored, draft, path, contents]);

  const snippet = useCallback(
    (range: SurfaceRange) => lines.slice(range.start - 1, range.end).join('\n'),
    [lines],
  );

  const startDraft = useCallback(
    (range: SurfaceRange) => {
      setDraft({ scope: 'tree', filePath: path, side: 'new', startLine: range.start, endLine: range.end, anchorContent: snippet(range) });
      setActiveThread(null);
      setSelection({ itemId: path, range });
    },
    [path, snippet, setDraft, setActiveThread],
  );

  const revealRequest = useRevealStore((s) => s.request);
  const consumeReveal = useRevealStore((s) => s.consume);
  useEffect(() => {
    if (!revealRequest || revealRequest.path !== path || revealRequest.line === null) {
      return;
    }
    consumeReveal(revealRequest.nonce);
    const line = revealRequest.line;
    setSelection({ itemId: path, range: { side: 'new', start: line, end: line } });
    setTimeout(() => surfaceRef.current?.scrollToLine(path, line, 'new'), 50);
  }, [revealRequest, path, consumeReveal]);

  const chip = useMemo<ContextChip | null>(() => {
    if (!selection) {
      return null;
    }
    return {
      filePath: path,
      side: 'new',
      startLine: selection.range.start,
      endLine: selection.range.end,
      snippet: snippet(selection.range),
    };
  }, [selection, path, snippet]);

  const renderAnnotation = useCallback(
    (data: CommentAnnotation[]) => <AnnotationStack data={data} threadsById={threadsById} actions={actions} />,
    [threadsById, actions],
  );

  const renderTop = useCallback(
    () => (orphaned.length > 0 ? <div className="pt-3">{<OrphanedThreads threads={orphaned} actions={actions} />}</div> : null),
    [orphaned, actions],
  );

  const code = (
    <div className="relative h-full min-w-0 flex-1">
      <CodeSurface<CommentAnnotation>
        handleRef={surfaceRef}
        items={items}
        hideFileHeader
        wrap={wrapLines}
        selection={selection}
        onSelectionChange={setSelection}
        onGutterClick={(_itemId, range) => startDraft(range)}
        renderAnnotation={renderAnnotation}
        renderTop={renderTop}
      />
      <SelectionActionBar
        chip={chip}
        hidden={draft !== null}
        onComment={() => {
          if (!selection) {
            return;
          }
          startDraft(selection.range);
        }}
        onClear={() => setSelection(null)}
      />
    </div>
  );

  if (mode === 'preview') {
    return (
      <div className="h-full overflow-auto px-8 py-6">
        <div className="mx-auto max-w-4xl">
          <RichContent path={path} contents={contents} />
        </div>
      </div>
    );
  }

  if (mode === 'split') {
    return (
      <div className="flex h-full">
        {code}
        <div className="h-full w-1/2 shrink-0 overflow-auto border-l border-border px-6 py-5">
          <RichContent path={path} contents={contents} />
        </div>
      </div>
    );
  }

  return code;
}
