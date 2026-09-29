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
import { TitleBar } from '../layout/title-bar';
import { PageSwitcher } from '../layout/page-switcher';
import { GitSyncActions } from '../layout/git-sync-actions';
import { GitBranchIcon } from '../icons/git-branch-icon';
import { StaleDiffBanner } from '../layout/stale-diff-banner';
import { useTreeStaleness } from '../../hooks/use-tree-staleness';
import { isRenderableFile, isMarkdownFile, isImageFile } from '../../lib/file-types';
import { CodeIcon } from '../icons/code-icon';
import { FileIcon } from '../icons/file-icon';
import { SegmentedToggle } from '../ui/segmented-toggle';
import { RepoImage } from './repo-image';
import { openInEditor, errorMessage } from '../../lib/api';
import { toast } from 'sonner';
import { ReviewStateProvider } from '../../features/review/review-state';
import { ClaudeToolbar } from '../../features/claude/claude-toolbar';
import { FinishReview } from '../../features/review/finish-review';
import { useRepoNav } from '../../hooks/use-repo';
import { PencilIcon } from '../icons/pencil-icon';
import { FileBlockSkeleton, hideStaticSplash } from '../layout/skeleton';

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
  const nav = useRepoNav();
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
  const [previewMode, setPreviewMode] = useState<'preview' | 'code'>('preview');
  const searchInputRef = useRef<HTMLInputElement>(null);
  const mainRef = useRef<HTMLElement>(null);

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
  const { data: threads = [] } = useReviewThreads(sessionId);
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
      if (mainRef.current) {
        mainRef.current.scrollTop = 0;
      }
    },
    [setNav],
  );

  const handleDirClick = useCallback(
    (path: string) => {
      setNav(path, 'dir');
      if (mainRef.current) {
        mainRef.current.scrollTop = 0;
      }
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

  const handleOpenInEditor = useCallback(() => {
    openInEditor(navPath).catch((error) => {
      toast.error('Could not open the editor', { description: errorMessage(error) });
    });
  }, [navPath]);

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

  return (
    <ReviewStateProvider sessionId={sessionId}>
    <div className='flex flex-col h-screen bg-bg text-text'>
      <TitleBar>
        <div className='flex items-center gap-2.5 min-w-0 shrink'>
          {info?.name && (
            <button
              className='font-semibold text-text text-sm truncate hover:text-accent transition-colors cursor-pointer'
              onClick={nav.toOverview}
              title='Repository overview'
            >
              {info.name}
            </button>
          )}
          {info?.branch && (
            <span className='inline-flex items-center gap-1 px-1.5 py-0.5 bg-diff-hunk-bg text-diff-hunk-text rounded font-mono text-[11px] shrink-0'>
              <GitBranchIcon className='w-3 h-3' />
              {info.branch}
            </span>
          )}
          <PageSwitcher current='tree' />
          <span className='text-text-muted truncate hidden lg:inline'>
            All files in the working tree
          </span>
        </div>
        <div className='flex items-center gap-2 ml-auto shrink-0'>
          <GitSyncActions />
          <CommentToolbarActions
            threads={threads}
            onScrollToThread={handleScrollToThread}
            onDeleteAllComments={commentActions.deleteAllThreads}
            formatForCopy={formatForCopy}
          />
          <ClaudeToolbar diffRef={null} sessionId={sessionId} threads={threads} />
          <FinishReview githubDetails={null} />
          <OptionsMenu theme={theme} onToggleTheme={toggleTheme} />
        </div>
      </TitleBar>

      {isStale && (
        <StaleDiffBanner
          onRefresh={handleRefreshTree}
          message='Files have changed since this tree was loaded'
        />
      )}

      <div className='flex flex-1 overflow-hidden'>
        <TreeSidebar
          ref={searchInputRef}
          paths={paths}
          activeFile={isFileMode ? navPath : null}
          commentCountsByFile={commentCountsByFile}
          onFileClick={handleFileClick}
          onDirClick={handleDirClick}
        />

        <main ref={mainRef} className='flex-1 overflow-y-auto p-6'>
          <PathComments
            pathKey={pathKey}
            threads={pathThreads}
            commentActions={commentActions}
            label={navPath ? navPath.split('/').pop()! : (info.name ?? 'root')}
            focusedThreadId={focusedThreadId}
          >
            <button
              className={
                breadcrumbs.length > 0
                  ? 'text-accent hover:underline cursor-pointer'
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
                    className='text-accent hover:underline cursor-pointer'
                    onClick={() => handleDirClick(crumb.path)}
                  >
                    {crumb.name}
                  </button>
                )}
              </span>
            ))}
            {isFileMode && fileContent && isRenderableFile(navPath) && (
              <div className='ml-3 -mr-2'>
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
            {info?.editor === 'vscode' && (
              <button
                className='ml-3 shrink-0 flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-bg-tertiary text-xs text-text-secondary hover:bg-hover hover:text-text cursor-pointer transition-colors'
                onClick={handleOpenInEditor}
              >
                <PencilIcon className='w-3 h-3' />
                Open in Editor
              </button>
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
    </div>
    </ReviewStateProvider>
  );
}
