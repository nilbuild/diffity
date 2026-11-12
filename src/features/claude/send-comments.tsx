import { useMemo, useState } from 'react';
import { create } from 'zustand';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import * as tauri from '../../lib/tauri';
import { getRepoPath } from '../../lib/api';
import { openSettingsAt } from '../../lib/ui-store';
import { buttonClaudeSolid, buttonGhost } from '../../components/ui/button-styles';
import { GitHubIcon, SendIcon, SparkleIcon } from '../../components/ui/icon';
import { MentionTextarea } from '../../components/comments/mention-textarea';
import { GENERAL_THREAD_FILE_PATH, type CommentThread } from '../../components/comments/types';
import { useReviewActions, useReviewState } from '../review/review-state';
import { plural } from '../review/review-candidates';
import { enqueueClaude, useActiveRun, useBusyThreadIds } from './claude-runner';
import { ModelPicker } from './model-picker';
import { useRunPick, writeRepoPick, type RunPick } from './model-setting';
import { agentMeta, type AgentMeta } from './agents';
import { clearDraft, draftKey, useDraft } from './agent-drafts';
import { chord } from '../../lib/shortcuts';

export function useAgentProblem(meta: AgentMeta, enabled: boolean): string | null {
  const { data: agents } = useQuery({ queryKey: ['agents'], queryFn: () => tauri.listAgents(), enabled, staleTime: 30_000 });
  if (!enabled || !agents) {
    return null;
  }
  const agent = agents.find((item) => item.id === meta.id);
  if (!agent || !agent.installed) {
    return `${meta.name} is not installed.`;
  }
  if (agent.authenticated === false) {
    return `${meta.name} is not logged in. ${meta.login}`;
  }
  return null;
}

export function unaddressedThreads(threads: CommentThread[]): CommentThread[] {
  return threads.filter((thread) => {
    if (thread.status !== 'open' || thread.pending) {
      return false;
    }
    const last = thread.comments[thread.comments.length - 1];
    return !!last && last.author.type === 'user';
  });
}

/** Agents' own open review comments nobody has replied to yet. */
export function claudeReviewThreads(threads: CommentThread[]): CommentThread[] {
  return threads.filter((thread) => {
    if (thread.status !== 'open' || thread.pending || thread.githubThreadId || thread.filePath === GENERAL_THREAD_FILE_PATH) {
      return false;
    }
    return thread.comments.length > 0 && thread.comments.every((comment) => comment.author.type === 'agent');
  });
}

/** Open GitHub review threads whose latest comment is from a reviewer (not you or an agent). */
export function reviewerThreads(threads: CommentThread[]): CommentThread[] {
  return threads.filter((thread) => {
    if (thread.status !== 'open' || thread.pending || !thread.githubThreadId) {
      return false;
    }
    const last = thread.comments[thread.comments.length - 1];
    return !!last && last.author.type === 'github';
  });
}

export const useSendRequest = create<{ open: number }>(() => ({ open: 0 }));

export function requestSendToClaude() {
  useSendRequest.setState((state) => ({ open: state.open + 1 }));
}

interface SendCandidates {
  local: CommentThread[];
  remote: CommentThread[];
  fromClaude: CommentThread[];
  pendingCount: number;
  count: number;
}

/** Comments an agent could be sent to work on: yours, its own review comments, and (on your PR) reviewers' GitHub threads. */
export function useSendCandidates(threads: CommentThread[], includeGitHub: boolean): SendCandidates {
  const { pendingReview, prMode } = useReviewState();
  const busy = useBusyThreadIds();
  const local = unaddressedThreads(threads).filter((thread) => !busy.has(thread.id) && !thread.githubThreadId);
  const remote = includeGitHub ? reviewerThreads(threads).filter((thread) => !busy.has(thread.id)) : [];
  const fromClaude = claudeReviewThreads(threads).filter((thread) => !busy.has(thread.id));
  const pendingCount = prMode ? 0 : pendingReview?.pendingCount ?? 0;

  return { local, remote, fromClaude, pendingCount, count: local.length + remote.length + fromClaude.length + pendingCount };
}

function threadLocation(thread: CommentThread): string {
  if (thread.filePath === GENERAL_THREAD_FILE_PATH) {
    return 'General';
  }
  return thread.startLine === thread.endLine ? `L${thread.startLine}` : `L${thread.startLine}–${thread.endLine}`;
}

function threadsByFile(threads: CommentThread[]): [string, CommentThread[]][] {
  const byFile = new Map<string, CommentThread[]>();
  for (const thread of threads) {
    const key = thread.filePath === GENERAL_THREAD_FILE_PATH ? 'General comments' : thread.filePath;
    byFile.set(key, [...(byFile.get(key) ?? []), thread]);
  }
  return [...byFile.entries()];
}

function ThreadGroup(props: { file: string; threads: CommentThread[]; isChecked: (id: string) => boolean; onToggle: (id: string) => void }) {
  const { file, threads, isChecked, onToggle } = props;

  return (
    <div className="pb-1">
      <div className="px-2 pt-1.5 pb-1 font-mono text-[11px] text-text-muted truncate">{file}</div>
      {threads.map((thread) => (
        <label key={thread.id} className="flex items-start gap-2.5 px-2 py-1.5 rounded-md hover:bg-hover cursor-pointer">
          <input type="checkbox" checked={isChecked(thread.id)} onChange={() => onToggle(thread.id)} className="mt-0.5 accent-claude" />
          <span className="shrink-0 w-12 pt-px font-mono text-[11px] text-text-muted">{threadLocation(thread)}</span>
          <span className="min-w-0 flex-1 text-xs leading-5 text-text line-clamp-2">{thread.comments[thread.comments.length - 1]?.body}</span>
        </label>
      ))}
    </div>
  );
}

interface SendCommentsPanelProps {
  candidates: SendCandidates;
  /** The view the comments are in; the note is kept per view until it is sent. */
  diffRef: string | null;
  onClose: () => void;
}

/** Pick open comments and send them to an agent, which edits your code to address them and replies on each thread. */
export function SendCommentsPanel(props: SendCommentsPanelProps) {
  const { candidates, diffRef, onClose } = props;
  const queued = !!useActiveRun(getRepoPath());
  const { local, remote, fromClaude, pendingCount } = candidates;
  const { sessionId, pendingReview } = useReviewState();
  const { submit } = useReviewActions(sessionId);
  const noteKey = draftKey('note', getRepoPath(), diffRef);
  const [note, setNote] = useDraft(noteKey);
  const fallbackPick = useRunPick('fix', getRepoPath());
  const [picked, setPicked] = useState<RunPick | null>(null);
  const pick = picked ?? fallbackPick;
  const agent = agentMeta(pick.agent);
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [claudePicked, setClaudePicked] = useState<Set<string> | null>(null);
  const [postReplies, setPostReplies] = useState(false);
  const own = [...local, ...remote];
  const remoteSelected = remote.filter((thread) => !excluded.has(thread.id));
  const pickedClaude = claudePicked ?? new Set(own.length + pendingCount === 0 ? fromClaude.map((thread) => thread.id) : []);
  const selectedClaude = fromClaude.filter((thread) => pickedClaude.has(thread.id));
  const selected = [...own.filter((thread) => !excluded.has(thread.id)), ...selectedClaude];
  const sendCount = selected.length + pendingCount;
  const claudeProblem = useAgentProblem(agent, true);

  const groups = useMemo(() => threadsByFile(local), [local]);
  const claudeGroups = useMemo(() => threadsByFile(fromClaude), [fromClaude]);

  const send = async () => {
    if (sendCount === 0 || submit.isPending) {
      return;
    }
    if (claudeProblem) {
      toast.error(claudeProblem, { action: { label: 'Agent settings', onClick: () => openSettingsAt('agents') } });
      return;
    }
    if (pendingCount > 0) {
      await submit.mutateAsync({ body: '', verdict: null, claude: 'skip' });
    }
    onClose();
    enqueueClaude(
      {
        kind: 'resolve',
        threadIds: [...new Set([...selected.map((thread) => thread.id), ...(pendingCount > 0 ? pendingReview?.threadIds ?? [] : [])])],
        note: note.trim() || undefined,
      },
      { repoPath: getRepoPath(), sessionId, pick, postRepliesToGitHub: postReplies ? remoteSelected.map((thread) => thread.id) : undefined },
    );
    clearDraft(noteKey);
    if (queued) {
      toast(`Queued for ${agent.short}`, { description: 'It starts when the current run finishes.' });
    }
    if (picked) {
      writeRepoPick('fix', getRepoPath(), picked);
    }
  };

  const toggleClaude = (id: string) => {
    const next = new Set(pickedClaude);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setClaudePicked(next);
  };

  const allClaudePicked = selectedClaude.length === fromClaude.length;
  const toggleAllClaude = () => {
    setClaudePicked(new Set(allClaudePicked ? [] : fromClaude.map((thread) => thread.id)));
  };

  const toggle = (id: string) => {
    setExcluded((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  return (
    <form
      className="flex flex-col font-sans"
      onSubmit={(event) => {
        event.preventDefault();
        void send();
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
          event.preventDefault();
          void send();
        }
      }}
    >
      <p className="px-4 pt-2.5 pb-1 text-xs text-text-secondary">{agent.short} fixes these and replies on each one.</p>
      <div className="max-h-[300px] overflow-y-auto px-2">
        {local.length > 0 && fromClaude.length > 0 && <div className="px-2 pt-2 pb-0.5 text-[11px] font-medium text-text-muted">Your comments</div>}
        {groups.map(([file, items]) => (
          <ThreadGroup key={file} file={file} threads={items} isChecked={(id) => !excluded.has(id)} onToggle={toggle} />
        ))}
        {fromClaude.length > 0 && (
          <div className="pb-1">
            <div className="flex items-center gap-1.5 px-2 pt-2 pb-0.5 text-[11px] font-medium text-text-muted">
              <SparkleIcon size="xs" className="text-claude" />
              <span className="flex-1">Agent comments</span>
              <button type="button" onClick={toggleAllClaude} className="text-text-secondary hover:text-text cursor-pointer">
                {allClaudePicked ? 'Select none' : 'Select all'}
              </button>
            </div>
            {claudeGroups.map(([file, items]) => (
              <ThreadGroup key={file} file={file} threads={items} isChecked={(id) => pickedClaude.has(id)} onToggle={toggleClaude} />
            ))}
          </div>
        )}
        {remote.length > 0 && (
          <div className="pb-1">
            <div className="flex items-center gap-1.5 px-2 pt-2 pb-1 text-[11px] font-medium text-text-muted">
              <GitHubIcon size={11} />
              Reviewer comments from GitHub
            </div>
            {remote.map((thread) => (
              <label key={thread.id} className="flex items-start gap-2.5 px-2 py-1.5 rounded-md hover:bg-hover cursor-pointer">
                <input type="checkbox" checked={!excluded.has(thread.id)} onChange={() => toggle(thread.id)} className="mt-0.5 accent-claude" />
                <span className="shrink-0 w-24 pt-px font-mono text-[11px] text-text-muted truncate" title={thread.filePath}>{thread.filePath.split('/').pop()} {threadLocation(thread)}</span>
                <span className="min-w-0 flex-1 text-xs leading-5 text-text line-clamp-2">
                  <span className="font-medium">{thread.comments[thread.comments.length - 1]?.author.name}: </span>
                  {thread.comments[thread.comments.length - 1]?.body}
                </span>
              </label>
            ))}
            <label className="flex items-center gap-2 px-2 pt-1.5 text-xs text-text-secondary cursor-pointer">
              <input type="checkbox" checked={postReplies} onChange={() => setPostReplies(!postReplies)} className="accent-claude" disabled={remoteSelected.length === 0} />
              Post {agent.short}’s replies to these GitHub threads
            </label>
          </div>
        )}
        {pendingCount > 0 && <div className="px-2 py-1 text-xs text-text-secondary">+ {plural(pendingCount, 'draft comment')} (submitted first)</div>}
      </div>
      <div className="px-4 pt-2 pb-3 border-t border-overlay-border">
        <MentionTextarea
          value={note}
          onChange={setNote}
          rows={2}
          placeholder="Anything else? (optional)"
          className="block w-full px-2.5 py-1.5 text-[13px] leading-5 bg-raised text-text rounded-md border border-control-border focus:border-focus resize-y outline-none placeholder:text-text-muted"
        />
        {claudeProblem && <div className="mt-2 px-2.5 py-1.5 rounded-md bg-deleted/10 text-xs text-deleted">{claudeProblem}</div>}
        <div className="mt-2.5 flex items-center gap-2">
          <ModelPicker value={pick} onChange={setPicked} className="-ml-1.5 mr-auto" />
          <button type="button" onClick={onClose} className={buttonGhost}>Cancel</button>
          <button
            type="submit"
            disabled={sendCount === 0 || submit.isPending}
            className={buttonClaudeSolid}
            title={queued ? `Runs after the current one (${chord('↵')})` : chord('↵')}
          >
            <SendIcon size="sm" />
            {queued ? `Queue ${sendCount} for ${agent.short}` : `Send ${sendCount} to ${agent.short}`}
          </button>
        </div>
      </div>
    </form>
  );
}
