import { useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { EmptyState } from '@/components/ui/EmptyState';
import { ResizeHandle } from '@/components/ui/ResizeHandle';
import { Spinner } from '@/components/ui/Spinner';
import * as api from '@/lib/api';
import { queryKeys } from '@/lib/query';
import { countOpenByFile } from '@/features/comments/thread-utils';
import { useCommentActions, useThreads } from '@/features/comments/use-threads';
import { useRevealStore } from '@/features/workspace/reveal-store';
import { useViewStore } from '@/features/workspace/view-store';
import { useWorkspace } from '@/features/workspace/workspace-context';
import { FileTree } from './FileTree';
import { FileViewer } from './FileViewer';
import { FolderView } from './FolderView';
import { useFilesStore } from './files-store';
import { buildTree, findNode } from './tree-model';

export function FilesPage() {
  const { repoPath, treeSessionId } = useWorkspace();
  const sidebarWidth = useViewStore((s) => s.sidebarWidth);
  const setSidebarWidth = useViewStore((s) => s.setSidebarWidth);
  const selectedPath = useFilesStore((s) => s.selectedPath);
  const select = useFilesStore((s) => s.select);
  const expandTo = useFilesStore((s) => s.expandTo);
  const threads = useThreads(treeSessionId);
  const actions = useCommentActions(treeSessionId);
  const revealRequest = useRevealStore((s) => s.request);
  const consumeReveal = useRevealStore((s) => s.consume);

  const treeQuery = useQuery({
    queryKey: queryKeys.tree(repoPath),
    queryFn: () => api.listTree(repoPath),
  });

  const root = useMemo(() => buildTree(treeQuery.data ?? []), [treeQuery.data]);
  const commentCounts = useMemo(() => countOpenByFile(threads), [threads]);
  const selectedNode = selectedPath === null ? root : findNode(root, selectedPath);
  const fileThreads = useMemo(() => threads.filter((t) => t.filePath === selectedPath), [threads, selectedPath]);

  useEffect(() => {
    if (!revealRequest) {
      return;
    }
    expandTo(revealRequest.path);
    select(revealRequest.path);
    if (revealRequest.line === null) {
      consumeReveal(revealRequest.nonce);
    }
  }, [revealRequest, expandTo, select, consumeReveal]);

  if (treeQuery.isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner />
      </div>
    );
  }

  if (treeQuery.error) {
    return <EmptyState title="Could not list files" description={api.errorMessage(treeQuery.error)} />;
  }

  return (
    <div className="flex h-full min-h-0">
      <FileTree root={root} commentCounts={commentCounts} width={sidebarWidth} />
      <ResizeHandle value={sidebarWidth} onChange={setSidebarWidth} min={200} max={520} direction="right" />
      <div className="min-w-0 flex-1">
        {!selectedNode && <EmptyState title="File not found" description={selectedPath ?? ''} />}
        {selectedNode?.kind === 'dir' && <FolderView node={selectedNode} />}
        {selectedNode?.kind === 'file' && <FileViewer path={selectedNode.path} threads={fileThreads} actions={actions} />}
      </div>
    </div>
  );
}
