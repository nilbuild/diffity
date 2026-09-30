import { useCallback, useEffect, useMemo, useRef, useState, type ComponentType, type ReactNode } from 'react';
import { create } from 'zustand';
import { useQuery } from '@tanstack/react-query';
import { buttonClaudeSolid, buttonGhost, buttonOutline, buttonPrimary } from '../../components/ui/button-styles';
import { cn } from '../../lib/cn';
import * as tauri from '../../lib/tauri';
import type { GithubPendingAction, Review, ReviewVerdict } from '../../lib/types';
import { openUrl } from '@tauri-apps/plugin-opener';
import { prRefFor } from '../pr/pr-checkout';
import {
  disabledReason,
  groupByFile,
  headerLine,
  otherDraftSessions,
  plural,
  postLabel,
  postedToast,
  selectedItems,
  toCandidateItems,
  type CandidateItem,
} from './review-candidates';
import type { GitHubDetails } from '../../lib/api';
import { openSettingsAt } from '../../lib/ui-store';
import { getRepoPath } from '../../lib/api';
import { mentionsAgent } from '../../lib/mentions';
import { enqueueClaude, useBusyThreadIds } from '../claude/claude-runner';
import { TREE_REF } from '../../lib/types';
import { parseCommitRef } from '../../lib/api';
import { GENERAL_THREAD_FILE_PATH, type CommentThread } from '../../components/comments/types';
import { toast } from 'sonner';
import { MentionTextarea } from '../../components/comments/mention-textarea';
import { PostReviewError, triggerClaude, useReviewActions, useReviewState, type ClaudeScope } from './review-state';
import { useOwnPr } from '../../hooks/use-repo-state';
import { ApproveIcon, CheckIcon, ChevronDownIcon, CommentIcon, GitHubIcon, GitPullRequestIcon, RequestChangesIcon, SendIcon, SparkleIcon, type GlyphProps } from '../../components/ui/icon';
import { Spinner } from '../../components/icons/spinner';
import { Popover } from '../../components/ui/popover';

interface FinishReviewProps {
  githubDetails: GitHubDetails | null;
  threads?: CommentThread[];
  diffRef?: string | null;
}

const VERDICTS: { value: ReviewVerdict; label: string; description: string; icon: ComponentType<GlyphProps>; tone: string }[] = [
  { value: 'comment', label: 'Comment', description: 'Feedback without a verdict', icon: CommentIcon, tone: 'text-text-secondary' },
  { value: 'approve', label: 'Approve', description: 'Ready to merge', icon: ApproveIcon, tone: 'text-added' },
  { value: 'requestChanges', label: 'Request changes', description: 'Must be addressed before merging', icon: RequestChangesIcon, tone: 'text-deleted' },
];

function useClaudeProblem(enabled: boolean): string | null {
  const { data: agents } = useQuery({ queryKey: ['agents'], queryFn: () => tauri.listAgents(), enabled, staleTime: 30_000 });
  if (!enabled || !agents) {
    return null;
  }
  const claude = agents.find((agent) => agent.id === 'claude');
  if (!claude || !claude.installed) {
    return 'Claude Code is not installed.';
  }
  if (claude.authenticated === false) {
    return 'Claude Code is not logged in. Run `claude` in a terminal first.';
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

/** Where "Send to Claude" makes sense: Claude edits the working tree, so not on an old commit or a range away from HEAD. */
export function canSendToClaude(diffRef: string | null | undefined): boolean {
  if (!diffRef) {
    return true;
  }
  if (diffRef === 'work' || diffRef === 'staged' || diffRef === 'unstaged' || diffRef === TREE_REF) {
    return true;
  }
  if (parseCommitRef(diffRef)) {
    return false;
  }
  if (diffRef.includes('..')) {
    const head = diffRef.split(/\.{2,3}/)[1];
    return !head || head === 'HEAD';
  }
  return true;
}

export function FinishReview(props: FinishReviewProps) {
  const { githubDetails, threads = [], diffRef } = props;
  const { enabled } = useReviewState();
  const ownPr = useOwnPr();

  if (!enabled) {
    return null;
  }
  const send = canSendToClaude(diffRef) ? <SendToClaude threads={threads} includeGitHub={ownPr} /> : null;
  if (!githubDetails || ownPr) {
    return send;
  }
  return (
    <>
      {send}
      <PullRequestReview pr={githubDetails} threads={threads} />
    </>
  );
}

function threadLocation(thread: CommentThread): string {
  if (thread.filePath === GENERAL_THREAD_FILE_PATH) {
    return 'General';
  }
  const range = thread.startLine === thread.endLine ? `L${thread.startLine}` : `L${thread.startLine}–${thread.endLine}`;
  return range;
}

/** Open GitHub review threads whose latest comment is from a reviewer (not you or Claude). */
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

function SendToClaude(props: { threads: CommentThread[]; includeGitHub?: boolean }) {
  const { threads, includeGitHub = false } = props;
  const { sessionId, pendingReview, prMode } = useReviewState();
  const { submit } = useReviewActions(sessionId);
  const busy = useBusyThreadIds();
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState('');
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const anchorRef = useRef<HTMLButtonElement>(null);
  const pendingCount = prMode ? 0 : pendingReview?.pendingCount ?? 0;
  const [postReplies, setPostReplies] = useState(false);
  const openRequest = useSendRequest((state) => state.open);
  const local = unaddressedThreads(threads).filter((thread) => !busy.has(thread.id) && !thread.githubThreadId);
  const remote = includeGitHub ? reviewerThreads(threads).filter((thread) => !busy.has(thread.id)) : [];
  const candidates = [...local, ...remote];
  const remoteSelected = remote.filter((thread) => !excluded.has(thread.id));

  const seenRequest = useRef(openRequest);
  useEffect(() => {
    if (openRequest === seenRequest.current) {
      return;
    }
    seenRequest.current = openRequest;
    setOpen(true);
  }, [openRequest]);
  const selected = candidates.filter((thread) => !excluded.has(thread.id));
  const count = candidates.length + pendingCount;
  const claudeProblem = useClaudeProblem(count > 0);

  const groups = useMemo(() => {
    const byFile = new Map<string, CommentThread[]>();
    for (const thread of local) {
      const key = thread.filePath === GENERAL_THREAD_FILE_PATH ? 'General comments' : thread.filePath;
      byFile.set(key, [...(byFile.get(key) ?? []), thread]);
    }
    return [...byFile.entries()];
  }, [local]);

  if (count === 0) {
    return null;
  }

  const send = async () => {
    if (claudeProblem) {
      toast.error(claudeProblem, { action: { label: 'Claude settings', onClick: () => openSettingsAt('claude') } });
      return;
    }
    if (pendingCount > 0) {
      await submit.mutateAsync({ body: '', verdict: null, claude: 'skip' });
    }
    setOpen(false);
    enqueueClaude(
      {
        kind: 'resolve',
        threadIds: [...new Set([...selected.map((thread) => thread.id), ...(pendingCount > 0 ? pendingReview?.threadIds ?? [] : [])])],
        note: note.trim() || undefined,
      },
      { repoPath: getRepoPath(), sessionId, postRepliesToGitHub: postReplies ? remoteSelected.map((thread) => thread.id) : undefined },
    );
    setNote('');
    setExcluded(new Set());
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
    <>
      <button
        ref={anchorRef}
        onClick={() => setOpen(!open)}
        disabled={submit.isPending}
        className={buttonClaudeSolid}
        title={`Claude answers questions and makes the requested changes for ${plural(count, 'open comment')}, asking before each edit`}
        aria-expanded={open}
      >
        <SendIcon size="md" />
        Send {count} to Claude
      </button>
      <Popover open={open} onClose={() => setOpen(false)} anchorRef={anchorRef} align="end" width={420} className="p-0">
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
            <div className="text-[13px] font-semibold text-text">Send comments to Claude</div>
            <p className="mt-0.5 text-xs text-text-secondary">Claude edits your working tree to address them, asks before each edit, and replies on each thread.</p>
          </div>
          <div className="max-h-[260px] overflow-y-auto px-2">
            {groups.map(([file, items]) => (
              <div key={file} className="pb-1">
                <div className="px-2 pt-1.5 pb-1 font-mono text-[11px] text-text-muted truncate">{file}</div>
                {items.map((thread) => (
                  <label key={thread.id} className="flex items-start gap-2.5 px-2 py-1.5 rounded-md hover:bg-hover cursor-pointer">
                    <input type="checkbox" checked={!excluded.has(thread.id)} onChange={() => toggle(thread.id)} className="mt-0.5 accent-claude" />
                    <span className="shrink-0 w-12 pt-px font-mono text-[11px] text-text-muted">{threadLocation(thread)}</span>
                    <span className="min-w-0 flex-1 text-xs leading-5 text-text line-clamp-2">{thread.comments[thread.comments.length - 1]?.body}</span>
                  </label>
                ))}
              </div>
            ))}
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
                  Post Claude’s replies to these GitHub threads
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
              placeholder="Optional note for all of these, e.g. “Keep changes minimal, no new dependencies”"
              className="block w-full px-2.5 py-1.5 text-[13px] leading-5 bg-raised text-text rounded-md border border-control-border focus:border-focus resize-y outline-none placeholder:text-text-muted"
            />
            {claudeProblem && <div className="mt-2 px-2.5 py-1.5 rounded-md bg-deleted/10 text-xs text-deleted">{claudeProblem}</div>}
            <div className="mt-2.5 flex items-center justify-end gap-2">
              <button type="button" onClick={() => setOpen(false)} className={buttonGhost}>Cancel</button>
              <button type="submit" disabled={selected.length + pendingCount === 0} className={buttonClaudeSolid} title="⌘↵">
                <SendIcon size="sm" />
                Send {selected.length + pendingCount} to Claude
              </button>
            </div>
          </div>
        </form>
      </Popover>
    </>
  );
}

interface ReviewItem {
  threadId: string;
  location: string;
  body: string;
  mentions: boolean;
}

function reviewItems(threads: CommentThread[]): ReviewItem[] {
  const items: ReviewItem[] = [];
  for (const thread of threads) {
    const drafts = thread.comments.filter((comment) => comment.pending);
    if (drafts.length === 0) {
      continue;
    }
    const name = thread.filePath.split('/').pop() ?? thread.filePath;
    const lines = thread.startLine === thread.endLine ? `${thread.startLine}` : `${thread.startLine}–${thread.endLine}`;
    items.push({
      threadId: thread.id,
      location: thread.filePath === GENERAL_THREAD_FILE_PATH ? 'General' : `${name}:${lines}`,
      body: drafts.map((comment) => comment.body).join(' · '),
      mentions: drafts.some((comment) => comment.mentionsAgent ?? mentionsAgent(comment.body)),
    });
  }
  return items;
}

const CLAUDE_PREF_PREFIX = 'diffity-review-send-claude:';

function readClaudePref(repoPath: string) {
  try {
    return localStorage.getItem(CLAUDE_PREF_PREFIX + repoPath) === '1';
  } catch {
    return false;
  }
}

function writeClaudePref(repoPath: string, value: boolean) {
  try {
    localStorage.setItem(CLAUDE_PREF_PREFIX + repoPath, value ? '1' : '0');
  } catch {
    return;
  }
}

function Checkbox(props: { checked: boolean }) {
  const { checked } = props;

  return (
    <span
      aria-hidden
      className={cn(
        'w-4 h-4 shrink-0 rounded flex items-center justify-center border transition-colors',
        checked ? 'border-accent bg-accent text-white' : 'border-control-border bg-raised',
      )}
    >
      {checked && <CheckIcon size={11} />}
    </span>
  );
}

function Radio(props: { checked: boolean }) {
  const { checked } = props;

  return (
    <span
      aria-hidden
      className={cn(
        'w-3.5 h-3.5 shrink-0 rounded-full flex items-center justify-center border transition-colors',
        checked ? 'border-accent bg-accent' : 'border-control-border bg-raised',
      )}
    >
      {checked && <span className="w-1.5 h-1.5 rounded-full bg-white" />}
    </span>
  );
}

function Section(props: { title: ReactNode; checked: boolean; onToggle: () => void; hint: ReactNode; children?: ReactNode }) {
  const { title, checked, onToggle, hint, children } = props;

  return (
    <section className="px-4 py-3 border-t border-overlay-border">
      <button
        type="button"
        role="checkbox"
        aria-checked={checked}
        onClick={onToggle}
        className="flex items-start gap-2.5 w-full text-left cursor-pointer group"
      >
        <span className="mt-0.5">
          <Checkbox checked={checked} />
        </span>
        <span className="min-w-0">
          <span className="flex items-center gap-1.5 text-[13px] font-medium text-text">{title}</span>
          <span className="block text-xs text-text-secondary mt-0.5 leading-snug">{hint}</span>
        </span>
      </button>
      {children && (
        <div className={cn('mt-2 pl-[26px] space-y-0.5 transition-opacity', !checked && 'opacity-45 pointer-events-none')} aria-disabled={!checked}>
          {children}
        </div>
      )}
    </section>
  );
}

function RadioRow(props: { checked: boolean; onSelect: () => void; label: ReactNode; detail?: ReactNode; disabled?: boolean }) {
  const { checked, onSelect, label, detail, disabled = false } = props;

  return (
    <button
      type="button"
      role="radio"
      aria-checked={checked}
      disabled={disabled}
      onClick={onSelect}
      className="flex items-center gap-2 w-full h-7 px-1.5 -mx-1.5 rounded-md text-left hover:bg-hover transition-colors cursor-pointer disabled:cursor-default disabled:opacity-45 disabled:hover:bg-transparent"
    >
      <Radio checked={checked} />
      <span className="text-[13px] text-text shrink-0">{label}</span>
      {detail && <span className="text-xs text-text-muted truncate min-w-0">{detail}</span>}
    </button>
  );
}

function ItemList(props: { items: ReviewItem[]; highlightMentions: boolean }) {
  const { items, highlightMentions } = props;

  return (
    <ul className="mt-1 max-h-32 overflow-y-auto rounded-md border border-overlay-border bg-bg divide-y divide-border-muted">
      {items.map((item) => (
        <li key={item.threadId} className="flex items-center gap-2 h-7 px-2 text-xs min-w-0">
          <span className="font-mono text-[11px] text-text-secondary shrink-0 max-w-[140px] truncate">{item.location}</span>
          <span className="text-text truncate min-w-0 flex-1">{item.body}</span>
          {highlightMentions && item.mentions && <SparkleIcon size="xs" className="text-claude" title="Mentions @claude" />}
        </li>
      ))}
    </ul>
  );
}

function CandidateList(props: { items: CandidateItem[]; excluded: Set<string>; onToggle: (id: string) => void }) {
  const { items, excluded, onToggle } = props;
  const postable = items.filter((item) => !item.blockedReason);
  const blocked = items.filter((item) => item.blockedReason);

  return (
    <div className="mt-2 max-h-56 overflow-y-auto rounded-md border border-overlay-border bg-bg">
      {groupByFile(postable).map(([file, group]) => (
        <div key={file} className="pb-1">
          <div className="px-2 pt-1.5 pb-0.5 font-mono text-[11px] text-text-muted truncate" title={file}>{file}</div>
          {group.map((item) => (
            <label key={item.id} className="flex items-start gap-2 px-2 py-1 hover:bg-hover cursor-pointer">
              <input type="checkbox" checked={!excluded.has(item.id)} onChange={() => onToggle(item.id)} className="mt-0.5 accent-accent" />
              <span className="shrink-0 w-14 pt-px font-mono text-[11px] text-text-muted">{item.location}</span>
              <span className="min-w-0 flex-1 text-xs leading-5 text-text line-clamp-2">{item.body}</span>
              <span
                className={cn(
                  'shrink-0 mt-0.5 px-1.5 rounded text-[10px] leading-4 font-medium',
                  item.draft ? 'bg-accent/15 text-accent' : 'bg-hover text-text-secondary',
                )}
                title={item.viewLabel ? `Left in ${item.viewLabel}` : undefined}
              >
                {item.draft ? 'Draft' : 'Local'}
              </span>
            </label>
          ))}
        </div>
      ))}
      {blocked.length > 0 && (
        <div className="border-t border-overlay-border pb-1">
          <div className="px-2 pt-1.5 pb-0.5 text-[11px] font-medium text-text-muted">Can't be posted ({blocked.length})</div>
          {blocked.map((item) => (
            <div key={item.id} className="px-2 py-1 text-xs opacity-80">
              <div className="flex items-start gap-2">
                <span className="shrink-0 max-w-[45%] pt-px font-mono text-[11px] text-text-muted truncate" title={item.filePath}>
                  {item.filePath === GENERAL_THREAD_FILE_PATH ? 'General' : `${item.filePath.split('/').pop()} ${item.location}`}
                </span>
                <span className="min-w-0 flex-1 leading-5 text-text-secondary truncate">{item.body}</span>
              </div>
              <div className="text-[11px] leading-4 text-deleted">{item.blockedReason}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function PullRequestReview(props: { pr: GitHubDetails; threads: CommentThread[] }) {
  const { pr, threads } = props;
  const repoPath = getRepoPath();
  const { sessionId, pendingReview } = useReviewState();
  const { submit, post, discard } = useReviewActions(sessionId);
  const [open, setOpen] = useState(false);
  const [body, setBody] = useState('');
  const [verdict, setVerdict] = useState<ReviewVerdict>('comment');
  const [postToGitHub, setPostToGitHub] = useState(true);
  const [sendClaude, setSendClaudeState] = useState(() => readClaudePref(repoPath));
  const [scopeChoice, setScopeChoice] = useState<'all' | 'mentions' | null>(null);
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [pendingAction, setPendingAction] = useState<GithubPendingAction | null>(null);
  const [postError, setPostError] = useState<PostReviewError | null>(null);
  const [savedReview, setSavedReview] = useState<Review | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);
  const claudeProblem = useClaudeProblem(open && sendClaude);

  const candidatesQuery = useQuery({
    queryKey: ['review-candidates', repoPath, pr.prNumber],
    queryFn: () => tauri.githubReviewCandidates(repoPath, pr.prNumber),
    staleTime: 30_000,
    retry: false,
  });
  const { refetch } = candidatesQuery;
  useEffect(() => {
    if (open) {
      void refetch();
    }
  }, [open, refetch]);

  const candidateItems = useMemo(
    () => toCandidateItems(candidatesQuery.data?.candidates ?? [], prRefFor({ baseRef: pr.baseRef })),
    [candidatesQuery.data, pr.baseRef],
  );
  const selected = selectedItems(candidateItems, excluded);
  const postableCount = candidateItems.filter((item) => !item.blockedReason).length;
  const blockedCount = candidateItems.length - postableCount;
  const githubPending = candidatesQuery.data?.githubPending ?? null;
  const showPendingChoice = postToGitHub && (githubPending !== null || postError?.code === 'pending_review_exists');

  const items = useMemo(() => reviewItems(threads), [threads]);
  const mentioned = items.filter((item) => item.mentions);
  const pendingCount = pendingReview?.pendingCount ?? 0;
  const hasBody = body.trim().length > 0;
  const scope: 'all' | 'mentions' = scopeChoice ?? (mentioned.length > 0 ? 'mentions' : 'all');
  const claudeScope: ClaudeScope = sendClaude ? scope : 'none';
  const claudeCount = scope === 'mentions' ? mentioned.length : pendingCount;
  const claudeHasWork = sendClaude && (scope === 'all' ? pendingCount > 0 || hasBody : mentioned.length > 0);
  const busy = submit.isPending || post.isPending;
  const badgeCount = candidatesQuery.data ? postableCount : pendingCount;

  const setSendClaude = (value: boolean) => {
    setSendClaudeState(value);
    writeClaudePref(repoPath, value);
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

  const blockedReason = disabledReason({
    postToGitHub,
    sendClaude,
    draftCount: pendingCount,
    selectedCount: selected.length,
    postableCount,
    blockedCount,
    hasBody,
    verdict,
    loading: candidatesQuery.isLoading,
    blocker: candidatesQuery.data?.blocker ?? null,
    needsPendingChoice: showPendingChoice && pendingAction === null,
    claudeHasWork,
    claudeProblem,
  });

  const submitLabel = () => {
    if (busy) {
      return postToGitHub ? 'Posting…' : 'Submitting…';
    }
    const claudePart = claudeHasWork ? (scope === 'mentions' ? `send ${plural(claudeCount, 'mention')} to Claude` : 'send to Claude') : null;
    if (postToGitHub) {
      const verb = postLabel(pr.prNumber, verdict, selected.length);
      return claudePart ? `${verb} & ${claudePart}` : verb;
    }
    if (claudePart) {
      return scope === 'mentions' ? `Send ${plural(claudeCount, 'mention')} to Claude` : `Send ${pendingCount > 0 ? plural(pendingCount, 'comment') : 'summary'} to Claude`;
    }
    return pendingCount > 0 ? `Save ${plural(pendingCount, 'comment')} locally` : 'Save summary locally';
  };

  const reset = () => {
    setBody('');
    setVerdict('comment');
    setScopeChoice(null);
    setExcluded(new Set());
    setPendingAction(null);
    setPostError(null);
    setSavedReview(null);
    setOpen(false);
  };

  const handleSubmit = () => {
    if (blockedReason || busy) {
      return;
    }
    if (!postToGitHub) {
      submit.mutate({ body, verdict: null, claude: claudeScope }, { onSuccess: reset });
      return;
    }
    setPostError(null);
    post.mutate(
      {
        prNumber: pr.prNumber,
        body,
        verdict,
        threadIds: selected.map((item) => item.id),
        otherDraftSessions: otherDraftSessions(selected, sessionId),
        needsLocalReview: pendingCount > 0 || hasBody || verdict !== 'comment',
        review: savedReview,
        pendingAction: showPendingChoice ? pendingAction : null,
      },
      {
        onSuccess: ({ review, result }) => {
          const message = postedToast(pr.prNumber, verdict, result);
          const url = result.reviewUrl ?? candidatesQuery.data?.prUrl ?? pr.prUrl;
          const claude = review ? triggerClaude(review, claudeScope) : null;
          toast.success(message.title, {
            description: [message.description, claude].filter(Boolean).join('\n') || undefined,
            action: result.dryRun ? undefined : { label: 'View on GitHub', onClick: () => void openUrl(url) },
          });
          reset();
        },
        onError: (error) => {
          setPostError(error);
          if (error.review) {
            setSavedReview(error.review);
          }
        },
      },
    );
  };

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className={badgeCount > 0 ? buttonPrimary : buttonOutline}
        title={badgeCount > 0 ? `${plural(badgeCount, 'comment')} ready to post to #${pr.prNumber}` : `Submit your review of pull request #${pr.prNumber}`}
      >
        <GitPullRequestIcon size="md" className={badgeCount > 0 ? 'text-white' : 'text-added'} />
        Submit review #{pr.prNumber}
        {badgeCount > 0 && (
          <span className="inline-flex items-center justify-center min-w-4 h-4 px-1 rounded-full bg-white/25 text-[10px] font-semibold tabular-nums">
            {badgeCount}
          </span>
        )}
        <ChevronDownIcon size="xs" />
      </button>
      <Popover open={open} onClose={close} anchorRef={ref} align="end" width={460} className="p-0">
        <div className="font-sans">
          <div className="px-4 pt-3.5 pb-3">
            <div className="text-[13px] font-semibold text-text">Submit review · #{pr.prNumber}</div>
            <div className="text-xs text-text-secondary mt-0.5 truncate" title={pr.prTitle}>
              {postToGitHub ? headerLine(selected.length, blockedCount, candidatesQuery.isLoading) : pendingCount > 0 ? `${plural(pendingCount, 'draft comment')}, private until you submit` : 'No draft comments'}
              {' · '}
              {pr.prTitle}
            </div>
            <MentionTextarea
              value={body}
              onChange={setBody}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  handleSubmit();
                }
              }}
              placeholder="Summary (optional)"
              rows={2}
              className="mt-2.5 block w-full px-2.5 py-1.5 text-[13px] bg-raised text-text border border-control-border rounded-md resize-y outline-none focus:border-focus placeholder:text-text-muted min-h-[56px]"
            />
            {postToGitHub && candidatesQuery.isError && (
              <div className="mt-2 px-2.5 py-1.5 rounded-md bg-deleted/10 text-xs text-deleted">
                Couldn't check which comments can be posted: {tauri.errorMessage(candidatesQuery.error)}
              </div>
            )}
            {postToGitHub && candidateItems.length > 0 && <CandidateList items={candidateItems} excluded={excluded} onToggle={toggle} />}
          </div>

          <Section
            checked={postToGitHub}
            onToggle={() => setPostToGitHub(!postToGitHub)}
            title={<><GitHubIcon size="sm" className="text-text-secondary" />Post to GitHub</>}
            hint={`Added to pull request #${pr.prNumber} as your review.`}
          >
            <div role="radiogroup" aria-label="Verdict">
              {VERDICTS.map((option) => (
                <RadioRow
                  key={option.value}
                  checked={verdict === option.value}
                  onSelect={() => setVerdict(option.value)}
                  label={<span className="inline-flex items-center gap-1.5"><option.icon size="sm" className={option.tone} />{option.label}</span>}
                  detail={option.description}
                  disabled={!postToGitHub}
                />
              ))}
            </div>
          </Section>

          {showPendingChoice && (
            <div className="mx-4 mb-2 px-2.5 py-2 rounded-md bg-modified/10 border border-overlay-border text-xs text-text">
              <div>
                You have a pending review on #{pr.prNumber} on GitHub
                {githubPending && githubPending.commentCount > 0 ? ` with ${plural(githubPending.commentCount, 'comment')}` : ''}. GitHub allows only one.
              </div>
              <div role="radiogroup" aria-label="Pending review on GitHub" className="mt-1">
                <RadioRow checked={pendingAction === 'addToExisting'} onSelect={() => setPendingAction('addToExisting')} label="Add to your existing pending review" detail="and submit it" />
                <RadioRow checked={pendingAction === 'discard'} onSelect={() => setPendingAction('discard')} label="Discard the GitHub pending review" detail="then post this one" />
              </div>
            </div>
          )}

          <Section
            checked={sendClaude}
            onToggle={() => setSendClaude(!sendClaude)}
            title={<><SparkleIcon size="sm" className="text-claude" />Send to Claude</>}
            hint="Claude edits your local checkout of this PR branch and asks before each edit."
          >
            <div role="radiogroup" aria-label="What Claude gets">
              <RadioRow
                checked={scope === 'all'}
                onSelect={() => setScopeChoice('all')}
                label={pendingCount > 0 ? `All ${plural(pendingCount, 'comment')} in this review` : 'The review summary'}
                disabled={!sendClaude}
              />
              <RadioRow
                checked={scope === 'mentions'}
                onSelect={() => setScopeChoice('mentions')}
                label="Only comments that mention @claude"
                detail={`${mentioned.length}`}
                disabled={!sendClaude || mentioned.length === 0}
              />
            </div>
            {sendClaude && scope === 'mentions' && mentioned.length > 0 && <ItemList items={mentioned} highlightMentions={false} />}
          </Section>
          {!sendClaude && mentioned.length > 0 && (
            <div className="px-4 -mt-1 pb-2 text-xs text-text-muted">
              {plural(mentioned.length, 'comment')} mention @claude. Claude answers those on their own.
            </div>
          )}

          {sendClaude && claudeProblem && (
            <div className="mx-4 mb-2 px-2.5 py-1.5 rounded-md bg-deleted/10 text-xs text-deleted">
              {claudeProblem}{' '}
              <button onClick={() => openSettingsAt('claude')} className="underline cursor-pointer">
                Open settings
              </button>
            </div>
          )}

          {postError && postError.code !== 'pending_review_exists' && (
            <div role="alert" className="mx-4 mb-2 px-2.5 py-1.5 rounded-md bg-deleted/10 text-xs text-deleted whitespace-pre-wrap">
              <span className="font-medium">Not posted to #{pr.prNumber}. </span>
              {postError.message}
              {postError.review && ' Your comments are kept here; fix the problem and post again.'}
            </div>
          )}
          {postError?.code === 'pending_review_exists' && (
            <div role="alert" className="mx-4 mb-2 px-2.5 py-1.5 rounded-md bg-deleted/10 text-xs text-deleted">{postError.message}</div>
          )}

          <div className="flex items-center gap-2 px-4 py-3 border-t border-overlay-border">
            {pendingReview && pendingCount > 0 && (
              <button
                onClick={() => discard.mutate(undefined, { onSuccess: close })}
                disabled={discard.isPending}
                className={cn(buttonGhost, 'px-2 text-deleted hover:text-deleted')}
                title="Delete all draft comments"
              >
                Discard drafts
              </button>
            )}
            <div className="flex-1" />
            <button onClick={close} className={buttonGhost}>
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={!!blockedReason || busy}
              className={buttonPrimary}
              title={blockedReason ?? undefined}
            >
              {busy && <Spinner className="text-white" />}
              {submitLabel()}
            </button>
          </div>
          {blockedReason && (
            <div className="px-4 pb-3 -mt-1 text-xs text-text-muted text-right">{blockedReason}</div>
          )}
        </div>
      </Popover>
    </div>
  );
}
