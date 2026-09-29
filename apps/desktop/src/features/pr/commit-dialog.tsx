import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { create } from 'zustand';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import * as tauri from '../../lib/tauri';
import { queryClient } from '../../lib/query-client';
import { useRepoNav } from '../../hooks/use-repo';
import { useGitStatus } from '../../hooks/use-repo-state';
import { buttonGhost, buttonOutline, buttonPrimary, inputField } from '../../components/ui/button-styles';
import { cn } from '../../lib/cn';
import type { CommentThread } from '../../components/comments/types';

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

function CommitDialogBody(props: { prNumber: number | null }) {
  const { prNumber } = props;
  const nav = useRepoNav();
  const client = useQueryClient();
  const { data: status } = useGitStatus();
  const [message, setMessage] = useState(suggestedMessage);
  const [busy, setBusy] = useState<'commit' | 'push' | null>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const changed = status ? status.staged + status.unstaged + status.untracked : 0;
  const branch = status?.branch ?? 'this branch';
  const reason = useMemo(() => {
    if (changed === 0) {
      return 'Nothing to commit';
    }
    if (!message.trim()) {
      return 'Write a commit message';
    }
    return null;
  }, [changed, message]);

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

  const run = async (push: boolean) => {
    if (reason) {
      return;
    }
    setBusy(push ? 'push' : 'commit');
    try {
      const commit = await tauri.gitCommitAll(nav.repoPath, message);
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
      toast.success(push ? `Committed and pushed${prNumber ? ` to PR #${prNumber}` : ''}` : 'Committed', { description: message.split('\n')[0] });
      closeCommitDialog();
    } catch (error) {
      toast.error('Commit failed', { description: tauri.errorMessage(error) });
    } finally {
      setBusy(null);
      void client.invalidateQueries();
    }
  };

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
        className="w-[520px] max-w-full rounded-xl border border-overlay-border bg-overlay p-5 animate-fade-in"
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
          Stages all {changed} changed file{changed === 1 ? '' : 's'} and commits them on <code className="font-mono text-xs text-text">{branch}</code>
          {prNumber ? ', then pushes the branch so the pull request updates.' : '.'} No amending or rebasing.
        </p>
        <textarea
          ref={textRef}
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          rows={5}
          placeholder="Commit message"
          spellCheck={false}
          className={cn(inputField, 'mt-3 h-auto py-2 leading-5 font-mono text-xs resize-y')}
        />
        <div className="mt-4 flex items-center justify-end gap-2">
          {reason && <span className="mr-auto text-xs text-text-muted">{reason}</span>}
          <button type="button" onClick={closeCommitDialog} className={buttonGhost}>Cancel</button>
          {prNumber !== null && (
            <button type="button" onClick={() => void run(false)} disabled={!!reason || busy !== null} className={buttonOutline}>
              {busy === 'commit' ? 'Committing…' : 'Commit only'}
            </button>
          )}
          <button type="submit" disabled={!!reason || busy !== null} className={buttonPrimary} title="⌘↵">
            {busy === 'push' ? 'Pushing…' : prNumber !== null ? 'Commit & push' : 'Commit'}
          </button>
        </div>
      </form>
    </div>,
    document.body,
  );
}
