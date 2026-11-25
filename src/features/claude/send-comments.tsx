import { useEffect, useState, type ReactNode } from 'react';
import { create } from 'zustand';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { cn } from '../../lib/cn';
import { goToThread } from '../../lib/thread-location';
import * as tauri from '../../lib/tauri';
import { getRepoPath } from '../../lib/api';
import { openSettingsAt } from '../../lib/ui-store';
import { buttonClaudeSolid, buttonGhost } from '../../components/ui/button-styles';
import { GitHubIcon, SendIcon, SparkleIcon } from '../../components/ui/icon';
import { InlineMarkdown } from '../../components/comments/inline-markdown';
import { MentionTextarea } from '../../components/comments/mention-textarea';
import { GENERAL_THREAD_FILE_PATH, type CommentThread } from '../../components/comments/types';
import { useReviewActions, useReviewState } from '../review/review-state';
import { plural } from '../review/review-candidates';
import { enqueueClaude, useBusyThreadIds, useRunInTheWay } from './claude-runner';
import { ModelPicker } from './model-picker';
import { useRunPick, writeRepoPick, type RunPick } from './model-setting';
import { agentMeta, type AgentMeta } from './agents';
import { clearDraft, draftKey, useDraft } from './agent-drafts';
import { chord } from '../../lib/shortcuts';
import { ReadableProjects } from '../groups/readable-projects';

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

function threadPlace(thread: CommentThread): string {
  if (thread.filePath === GENERAL_THREAD_FILE_PATH) {
    return 'General';
  }
  const name = thread.filePath.split('/').pop() ?? thread.filePath;
  const lines = thread.startLine === thread.endLine ? `${thread.startLine}` : `${thread.startLine}–${thread.endLine}`;
  return `${name}:${lines}`;
}

/** A comment's place, as a link that shows it in the diff without ticking its box. */
function ThreadLink(props: { thread: CommentThread; diffRef: string | null; label: string }) {
  const { thread, diffRef, label } = props;
  const title = thread.filePath === GENERAL_THREAD_FILE_PATH ? undefined : thread.filePath;

  if (!diffRef) {
    return <span title={title} className="truncate font-mono">{label}</span>;
  }
  return (
    <button
      type="button"
      onClick={(event) => {
        event.preventDefault();
        goToThread(getRepoPath(), { ref: diffRef, threadId: thread.id });
      }}
      title={title ? `Show this comment in ${title}` : 'Show this comment'}
      className="truncate font-mono text-left hover:text-text hover:underline underline-offset-2 cursor-pointer"
    >
      {label}
    </button>
  );
}

function ThreadRow(props: { thread: CommentThread; diffRef: string | null; checked: boolean; onToggle: () => void; showAuthor?: boolean }) {
  const { thread, diffRef, checked, onToggle, showAuthor } = props;
  const last = thread.comments[thread.comments.length - 1];

  return (
    <label className="flex items-start gap-3 px-2 py-2 rounded-md hover:bg-hover cursor-pointer">
      <input type="checkbox" checked={checked} onChange={onToggle} className="mt-[3px] shrink-0 accent-claude" />
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-1.5 text-[11px] leading-4 text-text-muted">
          <ThreadLink thread={thread} diffRef={diffRef} label={threadPlace(thread)} />
          {showAuthor && last && <span className="shrink-0">· {last.author.name}</span>}
        </div>
        <InlineMarkdown text={last?.body ?? ''} className="mt-0.5 text-[13px] leading-5 text-text line-clamp-2 break-words" />
      </div>
    </label>
  );
}

function SectionHeader(props: { icon?: ReactNode; label: string; action?: ReactNode }) {
  const { icon, label, action } = props;

  return (
    <div className="flex h-7 items-center gap-1.5 px-2 text-[11px] font-medium text-text-muted">
      {icon}
      <span className="flex-1">{label}</span>
      {action}
    </div>
  );
}

interface SendCommentsPanelProps {
  candidates: SendCandidates;
  /** The view the comments are in; the note is kept per view until it is sent. */
  diffRef: string | null;
  onClose: () => void;
  /** Told which agent the run will go to, so a host can name it. */
  onAgentChange?: (agentId: string) => void;
}

/** Pick open comments and send them to an agent, which answers questions, makes requested changes and replies on each thread. */
export function SendCommentsPanel(props: SendCommentsPanelProps) {
  const { candidates, diffRef, onClose, onAgentChange } = props;
  const queued = !!useRunInTheWay(getRepoPath(), 'edit');
  const { local, remote, fromClaude, pendingCount } = candidates;
  const { sessionId, pendingReview } = useReviewState();
  const { submit } = useReviewActions(sessionId);
  const noteKey = draftKey('note', getRepoPath(), diffRef);
  const [note, setNote] = useDraft(noteKey);
  const fallbackPick = useRunPick('fix', getRepoPath());
  const [picked, setPicked] = useState<RunPick | null>(null);
  const pick = picked ?? fallbackPick;
  const agent = agentMeta(pick.agent);

  useEffect(() => {
    onAgentChange?.(pick.agent);
  }, [pick.agent, onAgentChange]);
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

  const readableText = [note, ...selected.flatMap((thread) => thread.comments.map((comment) => comment.body))].join('\n');

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
      <div className="px-4 pt-3.5 pb-2">
        <h3 className="text-[13px] font-medium leading-5 text-text">{sendCount > 0 ? `Answer or fix ${plural(sendCount, 'comment')}` : 'Answer or fix comments'}</h3>
        <p className="mt-0.5 text-xs leading-4 text-text-muted">{agent.short} answers questions, makes the changes asked for, and replies on each one you tick.</p>
      </div>
      <div className="max-h-[320px] overflow-y-auto px-2 pb-2">
        {local.length > 0 && (
          <section>
            {(fromClaude.length > 0 || remote.length > 0) && <SectionHeader label="Your comments" />}
            {local.map((thread) => (
              <ThreadRow key={thread.id} thread={thread} diffRef={diffRef} checked={!excluded.has(thread.id)} onToggle={() => toggle(thread.id)} />
            ))}
          </section>
        )}
        {fromClaude.length > 0 && (
          <section className={cn(local.length > 0 && 'mt-2')}>
            <SectionHeader
              icon={<SparkleIcon size="xs" className="text-claude" />}
              label="Agent comments"
              action={(
                <button type="button" onClick={toggleAllClaude} className="font-normal text-text-secondary hover:text-text cursor-pointer">
                  {allClaudePicked ? 'Select none' : 'Select all'}
                </button>
              )}
            />
            {fromClaude.map((thread) => (
              <ThreadRow key={thread.id} thread={thread} diffRef={diffRef} checked={pickedClaude.has(thread.id)} onToggle={() => toggleClaude(thread.id)} />
            ))}
          </section>
        )}
        {remote.length > 0 && (
          <section className={cn((local.length > 0 || fromClaude.length > 0) && 'mt-2')}>
            <SectionHeader icon={<GitHubIcon size={11} />} label="Reviewer comments from GitHub" />
            {remote.map((thread) => (
              <ThreadRow key={thread.id} thread={thread} diffRef={diffRef} checked={!excluded.has(thread.id)} onToggle={() => toggle(thread.id)} showAuthor />
            ))}
            <label className="flex items-center gap-3 px-2 py-2 text-xs text-text-secondary cursor-pointer">
              <input type="checkbox" checked={postReplies} onChange={() => setPostReplies(!postReplies)} className="shrink-0 accent-claude" disabled={remoteSelected.length === 0} />
              Post {agent.short}’s replies to these GitHub threads
            </label>
          </section>
        )}
        {pendingCount > 0 && <div className="px-2 py-2 text-xs text-text-secondary">+ {plural(pendingCount, 'draft comment')} (submitted first)</div>}
      </div>
      <div className="px-4 pt-3 pb-4 border-t border-border">
        <MentionTextarea
          value={note}
          onChange={setNote}
          rows={2}
          growTo={160}
          placeholder="Anything else? (optional)"
          className="block w-full min-h-[60px] px-3 py-2 text-[13px] leading-5 bg-raised text-text rounded-md border border-control-border focus:border-focus resize-none outline-none placeholder:text-text-muted"
        />
        <div className="mt-2">
          <ReadableProjects repoPath={getRepoPath()} text={readableText} agentName={agent.short} edits />
        </div>
        {claudeProblem && <div className="mt-2 px-2.5 py-1.5 rounded-md bg-deleted/10 text-xs text-deleted">{claudeProblem}</div>}
        <div className="mt-3 flex items-center gap-2">
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
