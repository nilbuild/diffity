import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { create } from 'zustand';
import { toast } from 'sonner';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as tauri from '../../lib/tauri';
import { queryClient } from '../../lib/query-client';
import { useRepoNav } from '../../hooks/use-repo';
import { useGitStatus } from '../../hooks/use-repo-state';
import { buttonGhost, buttonOutline, buttonPrimary, inputField } from '../../components/ui/button-styles';
import { cn } from '../../lib/cn';
import type { CommentThread } from '../../components/comments/types';
import { chord } from '../../lib/shortcuts';
import { GrowingTextarea } from '../../components/ui/growing-textarea';
import { PathLabel } from '../../components/ui/path-label';
import { StatusLetter } from '../../components/tree/file-tree-item';
import { Skeleton } from '../../components/ui/skeleton';
import { commitFiles, commitPathspecs } from './commit-files';

interface CommitRequest {
  prNumber: number | null;
}

const useCommitDialog = create<{ request: CommitRequest | null }>(() => ({ request: null }));

export function openCommitDialog(prNumber: number | null) {
  useCommitDialog.setState({ request: { prNumber } });
}

function closeCommitDialog() {
  useCommitDialog.setState({ request: null });
}

/** A starting message built from what Claude said it fixed in the last few hours. */
function suggestedMessage(): string {
  const since = Date.now() - 6 * 60 * 60 * 1000;
  const summaries: string[] = [];
  for (const [, threads] of queryClient.getQueriesData<CommentThread[]>({ queryKey: ['threads'] })) {
    for (const thread of threads ?? []) {
      const last = thread.comments[thread.comments.length - 1];
      if (!last || last.author.type !== 'agent' || thread.status === 'open') {
        continue;
      }
      if (new Date(last.createdAt).getTime() < since) {
        continue;
      }
      const line = last.body.split('\n')[0].replace(/^fixed:\s*/i, '').replace(/[`*]/g, '').trim();
      if (line && !/^no change/i.test(line) && !summaries.includes(line)) {
        summaries.push(line.length > 90 ? `${line.slice(0, 87)}…` : line);
      }
    }
  }
  if (summaries.length === 0) {
    return '';
  }
  if (summaries.length === 1) {
    return summaries[0];
  }
  return `Address review comments\n\n${summaries.map((item) => `- ${item}`).join('\n')}`;
}

export function CommitDialog() {
  const request = useCommitDialog((state) => state.request);

  if (!request) {
    return null;
  }
  return <CommitDialogBody prNumber={request.prNumber} />;
}

function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? '' : 's'}`;
}

function CommitDialogBody(props: { prNumber: number | null }) {
  const { prNumber } = props;
  const nav = useRepoNav();
  const client = useQueryClient();
  const { data: status } = useGitStatus();
  const filesQuery = useQuery({
    queryKey: ['commit-files', nav.repoPath],
    queryFn: () => tauri.getDiff(nav.repoPath, 'work', false),
    staleTime: 0,
  });
  const files = useMemo(() => (filesQuery.data ? commitFiles(filesQuery.data.files, filesQuery.data.hiddenFiles ?? []) : []), [filesQuery.data]);
  const [excluded, setExcluded] = useState<Set<string>>(() => new Set());
  const [message, setMessage] = useState(suggestedMessage);
  const [busy, setBusy] = useState<'commit' | 'push' | null>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const allRef = useRef<HTMLInputElement>(null);
  const picked = useMemo(() => files.filter((file) => !excluded.has(file.path)), [files, excluded]);
  const totals = useMemo(() => picked.reduce((sum, file) => ({ add: sum.add + file.additions, del: sum.del + file.deletions }), { add: 0, del: 0 }), [picked]);
  const branch = status?.branch ?? 'this branch';
  const loading = filesQuery.isPending;
  const reason = useMemo(() => {
    if (loading) {
      return null;
    }
    if (files.length === 0) {
      return 'Nothing to commit';
    }
    if (picked.length === 0) {
      return 'Pick at least one file';
    }
    if (!message.trim()) {
      return 'Write a commit message';
    }
    return null;
  }, [loading, files.length, picked.length, message]);
  const blocked = loading || !!reason || busy !== null;

  useEffect(() => {
    textRef.current?.focus();
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeCommitDialog();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  useEffect(() => {
    if (!allRef.current) {
      return;
    }
    allRef.current.indeterminate = picked.length > 0 && picked.length < files.length;
  }, [picked.length, files.length]);

  const toggle = (path: string) => {
    setExcluded((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  };

  const toggleAll = () => {
    if (picked.length === files.length) {
      setExcluded(new Set(files.map((file) => file.path)));
      return;
    }
    setExcluded(new Set());
  };

  const run = async (push: boolean) => {
    if (blocked) {
      return;
    }
    setBusy(push ? 'push' : 'commit');
    try {
      const everything = picked.length === files.length;
      const commit = everything
        ? await tauri.gitCommitAll(nav.repoPath, message)
        : await tauri.gitCommitPaths(nav.repoPath, message, commitPathspecs(picked));
      if (!commit.ok) {
        toast.error('Commit failed', { description: commit.output });
        return;
      }
      if (push) {
        const pushed = await tauri.gitPush(nav.repoPath);
        if (!pushed.ok) {
          toast.error('Committed, but the push failed', { description: pushed.output });
          closeCommitDialog();
          return;
        }
      }
      const what = plural(picked.length, 'file');
      toast.success(push ? `Committed and pushed ${what}${prNumber ? ` to PR #${prNumber}` : ''}` : `Committed ${what}`, { description: message.split('\n')[0] });
      closeCommitDialog();
    } catch (error) {
      toast.error('Commit failed', { description: tauri.errorMessage(error) });
    } finally {
      setBusy(null);
      void client.invalidateQueries();
    }
  };

  const left = files.length - picked.length;

  return createPortal(
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/45 p-6 font-sans"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          closeCommitDialog();
        }
      }}
    >
      <form
        className="flex max-h-full w-[560px] max-w-full flex-col rounded-xl border border-overlay-border bg-overlay p-5 animate-fade-in"
        onSubmit={(event) => {
          event.preventDefault();
          void run(prNumber !== null);
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
            event.preventDefault();
            void run(prNumber !== null);
          }
        }}
      >
        <h3 className="text-[15px] font-semibold text-text">{prNumber ? `Commit and push to PR #${prNumber}` : 'Commit changes'}</h3>
        <p className="mt-1 text-[13px] text-text-secondary">
          Commits the ticked files on <code className="font-mono text-xs text-text break-all">{branch}</code>
          {prNumber ? ', then pushes the branch so the pull request updates.' : '.'} Unticked files stay as they are.
        </p>
        <div className="mt-3 flex min-h-0 flex-col rounded-lg border border-border bg-bg">
          <label className="flex h-9 shrink-0 items-center gap-2.5 border-b border-border px-3 text-[13px] text-text-secondary cursor-pointer select-none">
            <input
              ref={allRef}
              type="checkbox"
              checked={files.length > 0 && picked.length === files.length}
              onChange={toggleAll}
              disabled={loading || files.length === 0}
              className="accent-accent w-3.5 h-3.5 shrink-0 cursor-pointer"
              aria-label={picked.length === files.length ? 'Untick all files' : 'Tick all files'}
            />
            <span className="font-medium text-text tabular-nums">
              {loading ? 'Changed files' : files.length === picked.length ? plural(files.length, 'file') : `${picked.length} of ${plural(files.length, 'file')}`}
            </span>
            {left > 0 && <span className="truncate text-text-muted">· {left} left out</span>}
            {!loading && picked.length > 0 && (
              <span className="ml-auto shrink-0 font-mono text-xs tabular-nums">
                <span className="text-diff-added">+{totals.add}</span> <span className="text-diff-deleted">−{totals.del}</span>
              </span>
            )}
          </label>
          <div className="min-h-0 max-h-[min(260px,32vh)] overflow-y-auto py-1">
            {loading && (
              <div className="flex flex-col gap-2 px-3 py-2">
                <Skeleton className="h-4 w-3/5" />
                <Skeleton className="h-4 w-2/5" />
                <Skeleton className="h-4 w-1/2" />
              </div>
            )}
            {filesQuery.isError && (
              <p className="px-3 py-2 text-xs text-text-secondary">Couldn’t list the changed files: {tauri.errorMessage(filesQuery.error)}</p>
            )}
            {!loading && !filesQuery.isError && files.length === 0 && (
              <p className="px-3 py-2 text-xs text-text-secondary">No uncommitted changes.</p>
            )}
            {files.map((file) => (
              <label
                key={file.path}
                className="mx-1 flex h-7 items-center gap-2.5 rounded-md px-2 text-[13px] hover:bg-hover cursor-pointer select-none"
                title={file.oldPath ? `${file.oldPath} → ${file.path}` : file.path}
              >
                <input
                  type="checkbox"
                  checked={!excluded.has(file.path)}
                  onChange={() => toggle(file.path)}
                  className="accent-accent w-3.5 h-3.5 shrink-0 cursor-pointer"
                />
                {file.hidden ? <span className="w-3 shrink-0" /> : <StatusLetter status={file.status} />}
                <PathLabel path={file.path} className={cn('flex-1', excluded.has(file.path) && 'opacity-55')} />
                {file.hidden && <span className="shrink-0 text-[11px] text-text-muted">hidden from diffs</span>}
                {!file.hidden && (file.additions > 0 || file.deletions > 0) && (
                  <span className="shrink-0 font-mono text-[11px] tabular-nums">
                    {file.additions > 0 && <span className="text-diff-added">+{file.additions}</span>}
                    {file.additions > 0 && file.deletions > 0 && ' '}
                    {file.deletions > 0 && <span className="text-diff-deleted">−{file.deletions}</span>}
                  </span>
                )}
              </label>
            ))}
          </div>
        </div>
        <GrowingTextarea
          ref={textRef}
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          rows={4}
          growTo={220}
          placeholder="Commit message"
          spellCheck={false}
          className={cn(inputField, 'mt-3 h-auto shrink-0 py-2 leading-5 font-mono text-xs')}
        />
        <div className="mt-4 flex shrink-0 items-center justify-end gap-2">
          {reason && <span className="mr-auto min-w-0 truncate text-xs text-text-muted">{reason}</span>}
          <button type="button" onClick={closeCommitDialog} className={buttonGhost}>Cancel</button>
          {prNumber !== null && (
            <button type="button" onClick={() => void run(false)} disabled={blocked} className={buttonOutline}>
              {busy === 'commit' ? 'Committing…' : 'Commit only'}
            </button>
          )}
          <button type="submit" disabled={blocked} className={buttonPrimary} title={chord('↵')}>
            {busy === 'push' ? 'Pushing…' : busy === 'commit' ? 'Committing…' : prNumber !== null ? 'Commit & push' : picked.length > 0 && !loading ? `Commit ${plural(picked.length, 'file')}` : 'Commit'}
          </button>
        </div>
      </form>
    </div>,
    document.body,
  );
}
