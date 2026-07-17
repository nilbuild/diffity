import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import {
  useSearchParams as useRouterSearchParams,
  useNavigate,
  useLoaderData,
} from 'react-router';
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
  tourOptions,
} from '../../queries/tree';
import { useTheme, useColorblind } from '../../hooks/use-theme';
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
import { GitBranchIcon } from '../icons/git-branch-icon';
import { StaleDiffBanner } from '../layout/stale-diff-banner';
import { useTreeStaleness } from '../../hooks/use-tree-staleness';
import { isRenderableFile, isMarkdownFile } from '../../lib/file-types';
import { CodeIcon } from '../icons/code-icon';
import { FileIcon } from '../icons/file-icon';
import { SegmentedToggle } from '../ui/segmented-toggle';
import { TourPanel } from './tour-panel';
import { openInEditor } from '../../lib/api';
import { PencilIcon } from '../icons/pencil-icon';

interface TreePageProps {
  tourId?: string;
  tourStepIndex?: number;
  initialTheme?: 'light' | 'dark' | null;
}

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

export function TreePage(props: TreePageProps) {
  const { tourId, tourStepIndex: tourStepIndexProp, initialTheme } = props;

  const loaderData = useLoaderData<{ theme?: 'light' | 'dark' | null; colorblind?: boolean }>();
  const [searchParams, setSearchParams] = useRouterSearchParams();
  const navigate = useNavigate();
  const { colorblind, toggleColorblind } = useColorblind(loaderData?.colorblind ?? null);
  const { theme, toggleTheme } = useTheme(
    initialTheme ?? loaderData?.theme ?? null,
  );
  const queryClient = useQueryClient();
  const { isStale, resetStaleness } = useTreeStaleness();

  const [internalNav, setInternalNav] = useState<{
    path: string;
    type: 'file' | 'dir';
  }>({ path: '', type: 'dir' });
  const isTourMode = !!tourId;

  const navPath = isTourMode
    ? internalNav.path
    : searchParams.get('path') || '';
  const navType = isTourMode
    ? internalNav.type
    : ((searchParams.get('type') || 'dir') as 'file' | 'dir');

  const setNav = useCallback(
    (path: string, type: 'file' | 'dir') => {
      if (isTourMode) {
        setInternalNav({ path, type });
      } else if (type === 'file') {
        setSearchParams({ path, type: 'file' });
      } else if (path) {
        setSearchParams({ path });
      } else {
        setSearchParams({});
      }
    },
    [isTourMode, setSearchParams],
  );

  const [focusedThreadId, setFocusedThreadId] = useState<string | null>(null);
  const [previewMode, setPreviewMode] = useState<'preview' | 'code'>('preview');
  const tourStepIndex = tourStepIndexProp ?? 0;
  const [tourScrollTick, setTourScrollTick] = useState(0);
  const [tourSubHighlight, setTourSubHighlight] = useState<{
    startLine: number;
    endLine: number;
    label: string;
  } | null>(null);
  const [gotoHighlight, setGotoHighlight] = useState<{
    filePath: string;
    startLine: number;
    endLine: number;
  } | null>(null);
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

  const { data: tourData } = useQuery({
    ...tourOptions(tourId!),
    enabled: !!tourId,
  });

  const isFileMode = navType === 'file' && !!navPath;
  const isDirMode = !isFileMode;

  const { data: fileContent, isFetching: fileFetching } = useQuery({
    ...treeFileContentOptions(navPath),
    enabled: isFileMode,
    placeholderData: keepPreviousData,
  });

  const { data: entriesData, isFetching: entriesFetching } = useQuery({
    ...treeEntriesOptions(navPath || undefined),
    enabled: isDirMode,
    placeholderData: keepPreviousData,
  });

  const contentFetching = isFileMode ? fileFetching : entriesFetching;

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
    resetStaleness();
  }, [queryClient, resetStaleness]);

  const handleTourStepChange = useCallback(
    (index: number) => {
      if (!tourId) {
        return;
      }
      setTourScrollTick((t) => t + 1);
      navigate(`/tour/${tourId}/${index}`);
    },
    [tourId, navigate],
  );

  const handleTourScrollToHighlight = useCallback(() => {
    setTourSubHighlight(null);
    setGotoHighlight(null);
    setTourScrollTick((t) => t + 1);
  }, []);

  const handleTourSubHighlight = useCallback(
    (startLine: number, endLine: number, label: string) => {
      setGotoHighlight(null);
      setTourSubHighlight({ startLine, endLine, label });
      setTourScrollTick((t) => t + 1);
    },
    [],
  );

  const handleGotoFileLine = useCallback(
    (path: string, startLine: number, endLine: number) => {
      setTourSubHighlight(null);
      setInternalNav({ path, type: 'file' });
      setPreviewMode('code');
      setGotoHighlight({ filePath: path, startLine, endLine });
      setTourScrollTick((t) => t + 1);
    },
    [],
  );

  const handleTourClose = useCallback(() => {
    navigate('/tree');
  }, [navigate]);

  const tourHighlight = useMemo(() => {
    if (gotoHighlight) {
      return {
        filePath: gotoHighlight.filePath,
        startLine: gotoHighlight.startLine,
        endLine: gotoHighlight.endLine,
        annotation: '',
        scrollTick: tourScrollTick,
      };
    }
    if (!tourData || tourStepIndex === 0) {
      return null;
    }
    const step = tourData.steps[tourStepIndex - 1];
    if (!step) {
      return null;
    }
    if (tourSubHighlight) {
      return {
        filePath: step.filePath,
        startLine: tourSubHighlight.startLine,
        endLine: tourSubHighlight.endLine,
        annotation: tourSubHighlight.label,
        scrollTick: tourScrollTick,
        baseStartLine: step.startLine,
        baseEndLine: step.endLine,
      };
    }
    return {
      filePath: step.filePath,
      startLine: step.startLine,
      endLine: step.endLine,
      annotation: step.annotation,
      scrollTick: tourScrollTick,
    };
  }, [
    tourData,
    tourStepIndex,
    tourScrollTick,
    tourSubHighlight,
    gotoHighlight,
  ]);

  useEffect(() => {
    setTourSubHighlight(null);
    setGotoHighlight(null);
    if (!tourData || tourData.steps.length === 0 || tourStepIndex === 0) {
      return;
    }
    const step = tourData.steps[tourStepIndex - 1];
    if (step) {
      setInternalNav({ path: step.filePath, type: 'file' });
      setPreviewMode('code');
    }
  }, [tourData, tourStepIndex]);

  const formatForCopy = useCallback(() => {
    return formatTreeThreadsForCopy(threads);
  }, [threads]);

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

  return (
    <div className='flex flex-col h-screen bg-bg text-text'>
      <div className='flex items-center gap-3 px-4 py-1.5 bg-bg-secondary border-b border-border font-sans text-xs'>
        <div className='flex items-center gap-2.5 min-w-0 shrink'>
          {info?.name && (
            <button
              className='font-semibold text-text text-sm truncate hover:text-accent transition-colors cursor-pointer'
              onClick={() => handleDirClick('')}
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
          <span className='text-text-muted truncate hidden lg:inline'>
            Repository browser
          </span>
        </div>
        <div className='flex items-center gap-2 ml-auto shrink-0'>
          <CommentToolbarActions
            threads={threads}
            onScrollToThread={handleScrollToThread}
            onDeleteAllComments={commentActions.deleteAllThreads}
            formatForCopy={formatForCopy}
          />
          <OptionsMenu theme={theme} onToggleTheme={toggleTheme} colorblind={colorblind} onToggleColorblind={toggleColorblind} />
        </div>
      </div>

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
          focusFileTick={isTourMode ? tourScrollTick : undefined}
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
                onClick={() => openInEditor(navPath)}
              >
                <PencilIcon className='w-3 h-3' />
                Open in Editor
              </button>
            )}
          </PathComments>

          {isFileMode ? (
            fileContent ? (
              isRenderableFile(navPath) && previewMode === 'preview' ? (
                isMarkdownFile(navPath) ? (
                  <MarkdownPreview content={fileContent} filePath={navPath} />
                ) : (
                  <SvgPreview content={fileContent} />
                )
              ) : (
                <FileViewer
                  filePath={navPath}
                  content={fileContent}
                  theme={theme}
                  threads={fileThreads}
                  commentActions={commentActions}
                  sessionId={sessionId}
                  tourHighlight={tourHighlight}
                />
              )
            ) : fileFetching ? null : (
              <div className='flex items-center justify-center h-32 text-xs text-text-muted'>
                File not found
              </div>
            )
          ) : entries.length > 0 ? (
            <FolderViewer entries={entries} onNavigate={handleNavigate} />
          ) : entriesFetching ? null : (
            <div className='flex items-center justify-center h-32 text-xs text-text-muted'>
              Empty directory
            </div>
          )}
        </main>

        {tourData && (
          <TourPanel
            tour={tourData}
            currentStepIndex={tourStepIndex}
            onStepChange={handleTourStepChange}
            onClose={handleTourClose}
            onNavigateToFile={handleFileClick}
            onNavigateToFileLine={handleGotoFileLine}
            onScrollToHighlight={handleTourScrollToHighlight}
            onSubHighlight={handleTourSubHighlight}
            filePaths={paths}
          />
        )}
      </div>
    </div>
  );
}
