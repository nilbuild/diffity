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
import { FileViewer, type FileViewerHandle } from './file-viewer';
import { FindBar } from '../../features/find/find-bar';
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
import { DelayedFileSkeleton, DiffSkeleton, hideStaticSplash } from '../layout/skeleton';
import { CodeIcon, EditorIcon, FileIcon } from '../ui/icon';
import { useEditorName } from '../../hooks/use-editor-name';
import { handleCopyShortcut } from '../../lib/file-copy';
import { useRestoredScroll, useViewState } from '../../lib/view-state';
import { useRepoPath } from '../../hooks/use-repo';
import { requestSearchFocus } from '../../features/code-search/code-search';
import type { SearchTarget } from '../../features/code-search/sidebar-search';
import { chord } from '../../lib/shortcuts';

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
  const repoPath = useRepoPath();
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
  const mainRef = useRef<HTMLElement>(null);
  const fileViewerRef = useRef<FileViewerHandle>(null);
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
        requestSearchFocus(repoPath, 'files');
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [repoPath]);

  const { data: treeData } = useSuspenseQuery(treePathsOptions());
  const { data: info } = useSuspenseQuery(treeInfoOptions());
  const sessionId = info?.sessionId ?? null;
  const { data: threads = [], isFetched: threadsFetched } = useReviewThreads(sessionId);
  const commentActions = useCommentActions(sessionId, !!sessionId);

  const isFileMode = navType === 'file' && !!navPath;
  const isDirMode = !isFileMode;
  const isImage = isFileMode && isImageFile(navPath);

  const { data: fileContent, isFetching: fileFetching, isPlaceholderData: filePlaceholder } = useQuery({
    ...treeFileContentOptions(navPath),
    enabled: isFileMode && !isImage,
    placeholderData: keepPreviousData,
  });

  const { data: entriesData, isFetching: entriesFetching, isPlaceholderData: entriesPlaceholder } = useQuery({
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
  const diffIgnored = useMemo(() => new Set(treeData?.diffIgnored ?? []), [treeData]);

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

  /** File rows are virtualised, so a line thread is first scrolled to (once the viewer has its file) and then focused. */
  const scrollToThreadElement = useCallback((threadId: string, onFileLine: boolean, attempts = 12) => {
    if (!onFileLine) {
      focusThreadElement(threadId, attempts);
      return;
    }
    const tryReveal = (left: number) => {
      if (fileViewerRef.current?.revealThread(threadId) || left <= 0) {
        focusThreadElement(threadId, attempts);
        return;
      }
      setTimeout(() => tryReveal(left - 1), 100);
    };
    tryReveal(attempts);
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
            scrollToThreadElement(threadId, !isPathComment);
          });
        });
        return;
      }

      scrollToThreadElement(threadId, !isPathComment);
    },
    [navPath, navType, queryClient, paths, scrollToThreadElement, setNav],
  );

  const targetLine = Number(searchParams.get('line')) || null;

  const handleOpenSearchResult = useCallback((target: SearchTarget) => {
    setSearchParams({ path: target.path, type: 'file', line: String(target.line) });
  }, [setSearchParams]);

  // A line can only be shown in the code, so a rendered preview (Markdown, SVG) switches to it.
  useEffect(() => {
    if (targetLine && navType === 'file' && isRenderableFile(navPath) && previewMode === 'preview') {
      setPreviewMode('code');
    }
  }, [targetLine, navType, navPath, previewMode, setPreviewMode]);

  // A link to a line (the guide's "may break" list): scroll to it once the file's rows exist, then drop the param.
  useEffect(() => {
    if (!targetLine || navType !== 'file') {
      return;
    }
    let left = 30;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const tryReveal = () => {
      if (fileViewerRef.current?.revealLine(targetLine) || left-- <= 0) {
        const next = new URLSearchParams(searchParams);
        next.delete('line');
        setSearchParams(next, { replace: true });
        return;
      }
      timer = setTimeout(tryReveal, 100);
    };
    tryReveal();
    return () => clearTimeout(timer);
  }, [targetLine, navType, navPath, searchParams, setSearchParams]);

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
      scrollToThreadElement(thread.id, true, 30);
      return;
    }
    const next = new URLSearchParams(searchParams);
    next.delete('thread');
    setSearchParams(next, { replace: true });
    void handleScrollToThread(thread.id, thread.filePath);
  }, [targetThreadId, threadsFetched, threads, searchParams, setSearchParams, navPath, setNav, handleScrollToThread, scrollToThreadElement]);

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
    // Kept data belongs to the previous file: show the placeholder rather than its content under this name.
    if (!fileContent || filePlaceholder) {
      return fileFetching || filePlaceholder ? <DelayedFileSkeleton lines={14} /> : (
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
        key={navPath}
        ref={fileViewerRef}
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
          {threads.length > 0 && <ClaudeToolbar diffRef={null} sessionId={sessionId} threads={threads} formatForCopy={formatForCopy} />}
          <OptionsMenu theme={theme} onToggleTheme={toggleTheme} showAgentHistory />
        </div>
      </TitleBar>
      <Workspace>
      <div className='relative flex flex-1 min-h-0 overflow-hidden'>
        <FindBar className='top-2' />
        <TreeSidebar
          paths={paths}
          diffIgnored={diffIgnored}
          activeFile={isFileMode ? navPath : null}
          commentCountsByFile={commentCountsByFile}
          onFileClick={handleFileClick}
          onDirClick={handleDirClick}
          onOpenSearchResult={handleOpenSearchResult}
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
                title={`Open in ${editorName} (${chord('E', { shift: true })})`}
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
          ) : entriesPlaceholder ? (
            <DelayedFileSkeleton lines={6} />
          ) : entries.length > 0 ? (
            <FolderViewer entries={entries} onNavigate={handleNavigate} />
          ) : entriesFetching ? (
            <DelayedFileSkeleton lines={6} />
          ) : (
            <div className='flex items-center justify-center h-32 text-xs text-text-muted'>
              Empty directory
            </div>
          )}
        </main>
      </div>
      </Workspace>
      <StatusBar
        stale={isStale ? { onRefresh: handleRefreshTree, message: 'Files changed on disk' } : null}
      />
    </div>
    </ReviewStateProvider>
  );
}
