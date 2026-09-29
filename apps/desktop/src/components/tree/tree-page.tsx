import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router';
import {
  useQuery,
  useSuspenseQuery,
  useQueryClient,
  keepPreviousData,
} from '@tanstack/react-query';
import {
  treePathsOptions,
  treeInfoOptions,
  treeFileContentOptions,
  treeEntriesOptions,
} from '../../queries/tree';
import { useTheme } from '../../hooks/use-theme';
import { useReviewThreads } from '../../hooks/use-review-threads';
import { useCommentActions } from '../../hooks/use-comment-actions';
import { isThreadResolved, GENERAL_THREAD_FILE_PATH } from '../comments/types';
import type { CommentThread } from '../comments/types';
import { TreeSidebar } from './tree-sidebar';
import { FolderViewer } from './folder-viewer';
import { FileViewer } from './file-viewer';
import { MarkdownPreview } from './markdown-preview';
import { SvgPreview } from './svg-preview';
import { PathComments } from '../comments/path-comments';
import { CommentToolbarActions } from '../comments/comment-toolbar-actions';
import { OptionsMenu } from '../layout/options-menu';
import { Breadcrumb, CurrentCrumb, TitleBar, Workspace } from '../layout/title-bar';
import { StatusBar } from '../layout/status-bar';
import { useTreeStaleness } from '../../hooks/use-tree-staleness';
import { isRenderableFile, isMarkdownFile, isImageFile } from '../../lib/file-types';
import { SegmentedToggle } from '../ui/segmented-toggle';
import { RepoImage } from './repo-image';
import { openInEditor, errorMessage } from '../../lib/api';
import { toast } from 'sonner';
import { focusThreadElement } from '../../lib/dom-utils';
import { setFocusThread } from '../../lib/ui-store';
import { ReviewStateProvider } from '../../features/review/review-state';
import { ClaudeToolbar } from '../../features/claude/claude-toolbar';
import { FinishReview } from '../../features/review/finish-review';
import { DiffSkeleton, FileBlockSkeleton, hideStaticSplash } from '../layout/skeleton';
import { CodeIcon, EditorIcon, FileIcon } from '../ui/icon';
import { useEditorName } from '../../hooks/use-editor-name';
import { modKey } from '../../lib/platform';
import { handleCopyShortcut } from '../../lib/file-copy';
import { useRestoredScroll, useViewState } from '../../lib/view-state';

function formatTreeThreadsForCopy(threads: CommentThread[]): string {
  const unresolvedThreads = threads.filter(
    (t) => !isThreadResolved(t) && t.filePath !== GENERAL_THREAD_FILE_PATH,
  );
  if (unresolvedThreads.length === 0) {
    return '';
  }

  const parts: string[] = [];

  for (const thread of unresolvedThreads) {
    if (thread.filePath.startsWith('__path__:')) {
      const pathLabel = thread.filePath.slice('__path__:'.length);
      parts.push(
        `## Comment on ${pathLabel === '__root__' ? 'root' : pathLabel}`,
      );
    } else {
      const lineRange =
        thread.startLine === thread.endLine
          ? `${thread.startLine}`
          : `${thread.startLine}-${thread.endLine}`;
      parts.push(`## ${thread.filePath}:${lineRange}`);
    }

    if (thread.anchorContent) {
      parts.push('```');
      parts.push(thread.anchorContent);
      parts.push('```');
    }

    const uniqueAuthors = new Set(thread.comments.map((c) => c.author.name));
    const singleAuthor = uniqueAuthors.size === 1;

    for (const comment of thread.comments) {
      if (singleAuthor) {
        parts.push(comment.body);
      } else {
        const authorName =
          comment.author.name === 'You' ? 'User' : comment.author.name;
        parts.push(`**${authorName}:** ${comment.body}`);
      }
    }
    parts.push('');
  }

  return parts.join('\n');
}


export function TreePage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { theme, toggleTheme } = useTheme();
  const queryClient = useQueryClient();
  const { isStale, resetStaleness } = useTreeStaleness();

  const navPath = searchParams.get('path') || '';
  const navType = (searchParams.get('type') || 'dir') as 'file' | 'dir';

  const setNav = useCallback(
    (path: string, type: 'file' | 'dir') => {
      if (type === 'file') {
        setSearchParams({ path, type: 'file' });
      } else if (path) {
        setSearchParams({ path });
      } else {
        setSearchParams({});
      }
    },
    [setSearchParams],
  );

  const [focusedThreadId, setFocusedThreadId] = useState<string | null>(null);

  useEffect(() => {
    hideStaticSplash();
  }, []);
  const [previewMode, setPreviewMode] = useViewState<'preview' | 'code'>('tree:preview', 'preview');
  const searchInputRef = useRef<HTMLInputElement>(null);
  const mainRef = useRef<HTMLElement>(null);
  useRestoredScroll(mainRef, `tree:scroll:${navType}:${navPath}`);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      ) {
        return;
      }
      if (e.key === '/') {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const { data: treeData } = useSuspenseQuery(treePathsOptions());
  const { data: info } = useSuspenseQuery(treeInfoOptions());
  const sessionId = info?.sessionId ?? null;
  const { data: threads = [], isFetched: threadsFetched } = useReviewThreads(sessionId);
  const commentActions = useCommentActions(sessionId, !!sessionId);

  const isFileMode = navType === 'file' && !!navPath;
  const isDirMode = !isFileMode;
  const isImage = isFileMode && isImageFile(navPath);

  const { data: fileContent, isFetching: fileFetching } = useQuery({
    ...treeFileContentOptions(navPath),
    enabled: isFileMode && !isImage,
    placeholderData: keepPreviousData,
  });

  const { data: entriesData, isFetching: entriesFetching } = useQuery({
    ...treeEntriesOptions(navPath || undefined),
    enabled: isDirMode,
    placeholderData: keepPreviousData,
  });

  const commentCountsByFile = useMemo(() => {
    const map = new Map<string, number>();
    for (const thread of threads) {
      if (isThreadResolved(thread)) {
        continue;
      }
      let key = thread.filePath;
      if (key.startsWith('__path__:')) {
        key = key.slice('__path__:'.length);
        if (key === '__root__') {
          continue;
        }
      }
      const count = map.get(key) ?? 0;
      map.set(key, count + 1);
    }
    return map;
  }, [threads]);

  const paths = treeData?.paths ?? [];

  const handleFileClick = useCallback(
    (path: string) => {
      setNav(path, 'file');
      setPreviewMode('preview');
    },
    [setNav, setPreviewMode],
  );

  const handleDirClick = useCallback(
    (path: string) => {
      setNav(path, 'dir');
    },
    [setNav],
  );

  const handleNavigate = useCallback(
    (path: string, type: 'file' | 'dir') => {
      if (type === 'file') {
        handleFileClick(path);
      } else {
        handleDirClick(path);
      }
    },
    [handleFileClick, handleDirClick],
  );

  const scrollToThreadElement = useCallback((threadId: string) => {
    const el = document.querySelector(`[data-thread-id="${threadId}"]`);
    if (el) {
      el.dispatchEvent(
        new CustomEvent('diffity:focus-thread', { bubbles: false }),
      );
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.classList.add('flash-thread');
      setTimeout(() => el.classList.remove('flash-thread'), 1500);
    }
  }, []);

  const handleScrollToThread = useCallback(
    async (threadId: string, filePath: string) => {
      const isPathComment = filePath.startsWith('__path__:');
      let targetPath = filePath;
      let targetType: 'file' | 'dir' = 'file';

      if (isPathComment) {
        setFocusedThreadId(threadId);
        const rawPath = filePath.slice('__path__:'.length);
        targetPath = rawPath === '__root__' ? '' : rawPath;
        const isFile = paths.includes(targetPath);
        targetType = isFile ? 'file' : 'dir';
      }

      const needsNavigation =
        targetPath !== navPath ||
        (targetType === 'file' && navType !== 'file') ||
        (targetType === 'dir' && navType !== 'dir');

      if (needsNavigation) {
        if (targetType === 'file') {
          await queryClient.ensureQueryData(treeFileContentOptions(targetPath));
        } else {
          await queryClient.ensureQueryData(
            treeEntriesOptions(targetPath || undefined),
          );
        }
        setNav(targetPath, targetType);
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            scrollToThreadElement(threadId);
          });
        });
        return;
      }

      scrollToThreadElement(threadId);
    },
    [navPath, navType, queryClient, paths, scrollToThreadElement, setNav],
  );

  const targetThreadId = searchParams.get('thread');
  const handledTarget = useRef<string | null>(null);

  useEffect(() => {
    if (!targetThreadId || !threadsFetched || handledTarget.current === targetThreadId) {
      return;
    }
    handledTarget.current = targetThreadId;
    const thread = threads.find((item) => item.id === targetThreadId);
    if (!thread) {
      const next = new URLSearchParams(searchParams);
      next.delete('thread');
      setSearchParams(next, { replace: true });
      toast.info('That comment no longer exists');
      return;
    }
    setFocusThread(thread.id);
    const isPathComment = thread.filePath.startsWith('__path__:');
    if (!isPathComment && thread.filePath !== navPath) {
      setNav(thread.filePath, 'file');
      focusThreadElement(thread.id, 30);
      return;
    }
    const next = new URLSearchParams(searchParams);
    next.delete('thread');
    setSearchParams(next, { replace: true });
    void handleScrollToThread(thread.id, thread.filePath);
  }, [targetThreadId, threadsFetched, threads, searchParams, setSearchParams, navPath, setNav, handleScrollToThread]);

  const handleRefreshTree = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['tree-paths'] });
    queryClient.invalidateQueries({ queryKey: ['tree-entries'] });
    queryClient.invalidateQueries({ queryKey: ['tree-file-content'] });
    queryClient.invalidateQueries({ queryKey: ['raw-file'] });
    resetStaleness();
  }, [queryClient, resetStaleness]);

  const formatForCopy = useCallback(() => {
    return formatTreeThreadsForCopy(threads);
  }, [threads]);

  const editorName = useEditorName();

  const handleOpenInEditor = useCallback(() => {
    openInEditor(navPath).catch((error) => {
      toast.error('Could not open the editor', { description: errorMessage(error) });
    });
  }, [navPath]);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      handleCopyShortcut(event, isFileMode ? navPath : null);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isFileMode, navPath]);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || !event.shiftKey || event.key.toLowerCase() !== 'e') {
        return;
      }
      event.preventDefault();
      handleOpenInEditor();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [handleOpenInEditor]);

  const breadcrumbs = useMemo(() => {
    if (!navPath) {
      return [];
    }
    const parts = navPath.split('/');
    return parts.map((part, i) => ({
      name: part,
      path: parts.slice(0, i + 1).join('/'),
      isLast: i === parts.length - 1,
    }));
  }, [navPath]);

  const pathKey = navPath || '__root__';
  const fileThreads = threads.filter((t) => t.filePath === navPath);
  const pathThreads = threads.filter(
    (t) => t.filePath === `__path__:${pathKey}`,
  );
  const entries = entriesData?.entries ?? [];

  const renderFile = () => {
    if (isImage) {
      return (
        <div className='border border-border rounded-lg overflow-hidden'>
          <div className='flex items-center justify-center p-8 bg-bg min-h-[200px]'>
            <RepoImage
              path={navPath}
              alt={navPath}
              className='max-w-full max-h-[600px]'
            />
          </div>
        </div>
      );
    }
    if (!fileContent) {
      return fileFetching ? <FileBlockSkeleton lines={14} /> : (
        <div className='flex items-center justify-center h-32 text-xs text-text-muted'>
          File not found
        </div>
      );
    }
    if (isRenderableFile(navPath) && previewMode === 'preview') {
      return isMarkdownFile(navPath) ? (
        <MarkdownPreview content={fileContent} filePath={navPath} />
      ) : (
        <SvgPreview content={fileContent} />
      );
    }
    return (
      <FileViewer
        filePath={navPath}
        content={fileContent}
        theme={theme}
        threads={fileThreads}
        commentActions={commentActions}
        sessionId={sessionId}
      />
    );
  };

  if (sessionId && !threadsFetched) {
    return <DiffSkeleton />;
  }

  return (
    <ReviewStateProvider sessionId={sessionId}>
    <div className='flex flex-col h-screen bg-frame text-text'>
      <TitleBar>
        <div data-tauri-drag-region className='flex items-center gap-2.5 min-w-0 shrink'>
          <Breadcrumb name={info?.name}>
            <CurrentCrumb>Files</CurrentCrumb>
          </Breadcrumb>
        </div>
        <div data-tauri-drag-region className='flex-1 min-w-2 self-stretch' />
        <div className='flex items-center gap-2 shrink-0'>
          <CommentToolbarActions
            threads={threads}
            onScrollToThread={handleScrollToThread}
            onDeleteAllComments={commentActions.deleteAllThreads}
            formatForCopy={formatForCopy}
          />
          {threads.length > 0 && (
            <>
              <ClaudeToolbar diffRef={null} sessionId={sessionId} threads={threads} />
              <FinishReview githubDetails={null} threads={threads} />
            </>
          )}
          <OptionsMenu theme={theme} onToggleTheme={toggleTheme} />
        </div>
      </TitleBar>
      <Workspace>
      <div className='flex flex-1 min-h-0 overflow-hidden'>
        <TreeSidebar
          ref={searchInputRef}
          paths={paths}
          activeFile={isFileMode ? navPath : null}
          commentCountsByFile={commentCountsByFile}
          onFileClick={handleFileClick}
          onDirClick={handleDirClick}
        />

        <main ref={mainRef} className='flex-1 min-w-0 overflow-y-auto px-6 pt-4 pb-8'>
          <PathComments
            pathKey={pathKey}
            threads={pathThreads}
            commentActions={commentActions}
            label={navPath ? navPath.split('/').pop()! : (info.name ?? 'root')}
            focusedThreadId={focusedThreadId}
            actions={info?.editor === 'vscode' && (
              <button
                className='w-7 h-7 inline-flex items-center justify-center rounded-md text-text-secondary hover:text-text hover:bg-hover transition-colors cursor-pointer'
                onClick={handleOpenInEditor}
                title={`Open in ${editorName} (${modKey}⇧E)`}
                aria-label={`Open in ${editorName}`}
              >
                <EditorIcon size='md' />
              </button>
            )}
          >
            <button
              className={
                breadcrumbs.length > 0
                  ? 'text-text-secondary hover:text-text cursor-pointer'
                  : 'text-text font-medium'
              }
              onClick={() => handleDirClick('')}
            >
              {info.name ?? 'root'}
            </button>
            {breadcrumbs.map((crumb) => (
              <span key={crumb.path} className='flex items-center gap-1'>
                <span className='text-text-muted'>/</span>
                {crumb.isLast ? (
                  <span className='text-text font-medium'>{crumb.name}</span>
                ) : (
                  <button
                    className='text-text-secondary hover:text-text cursor-pointer'
                    onClick={() => handleDirClick(crumb.path)}
                  >
                    {crumb.name}
                  </button>
                )}
              </span>
            ))}
            {isFileMode && fileContent && isRenderableFile(navPath) && (
              <div className='ml-3'>
                <SegmentedToggle
                  options={[
                    {
                      value: 'code',
                      label: 'Code',
                      icon: <CodeIcon className='w-3 h-3' />,
                    },
                    {
                      value: 'preview',
                      label: 'Preview',
                      icon: <FileIcon className='w-3 h-3' />,
                    },
                  ]}
                  value={previewMode}
                  onChange={setPreviewMode}
                />
              </div>
            )}
          </PathComments>

          {isFileMode ? (
            renderFile()
          ) : entries.length > 0 ? (
            <FolderViewer entries={entries} onNavigate={handleNavigate} />
          ) : entriesFetching ? (
            <FileBlockSkeleton lines={6} />
          ) : (
            <div className='flex items-center justify-center h-32 text-xs text-text-muted'>
              Empty directory
            </div>
          )}
        </main>
      </div>
      </Workspace>
      <StatusBar
        sessionId={sessionId}
        stale={isStale ? { onRefresh: handleRefreshTree, message: 'Files changed on disk' } : null}
      />
    </div>
    </ReviewStateProvider>
  );
}
