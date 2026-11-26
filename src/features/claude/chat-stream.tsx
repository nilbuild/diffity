import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useQueries, useQuery } from '@tanstack/react-query';
import * as tauri from '../../lib/tauri';
import { cn } from '../../lib/cn';
import { modKey } from '../../lib/platform';
import { goToThread } from '../../lib/thread-location';
import { TREE_REF, type Chat, type ChatMessage, type ContextChip, type SentAs } from '../../lib/types';
import { MarkdownContent } from '../../components/layout/markdown-content';
import { Spinner } from '../../components/icons/spinner';
import { AlertCircleIcon, ChevronRightIcon, CommentIcon, PencilIcon, XIcon } from '../../components/ui/icon';
import { plural } from '../review/review-candidates';
import { blockerOf, cancelQueuedRun, isCommentChat, openRunResult, useClaude, waitLabel, type ClaudeRun } from './claude-runner';
import { defaultSince, isConversation, sameView, useConversation } from './conversation';
import { setLastSent, useEditing } from './composer-state';
import { useEditTarget, whereEditsShow } from './edit-target';
import { Timeline, ToolRow, actionTitle, useNow } from './run-details';
import { applyEvents, logFromMessages, projectActivities, toolCount, useRunActivity, wrapUp, type ActivityLog, type RunActivity } from './run-activity';
import { chipLabel } from './selection-chip';
import { describeTool } from './tool-label';
import { KeyLabel } from '../../components/ui/key-label';

interface Turn {
  key: string;
  at: number;
  chatId: string;
  text: string;
  chips: ContextChip[];
  sentAs: SentAs | null;
  log: ActivityLog | null;
  /** The reply was cancelled: Stop, or a newer message sent while it ran. */
  stopped: boolean;
}

function turnsOf(chatId: string, messages: ChatMessage[]): Turn[] {
  const turns: Turn[] = [];
  for (const message of messages) {
    const content = message.content;
    if (message.role === 'user' && !Array.isArray(content)) {
      turns.push({
        key: message.id,
        at: Date.parse(message.createdAt),
        chatId,
        text: content.text,
        chips: content.context ?? [],
        sentAs: content.sentAs ?? null,
        log: null,
        stopped: false,
      });
      continue;
    }
    const last = turns[turns.length - 1];
    if (message.role === 'agent' && Array.isArray(content) && last && !last.log) {
      last.log = applyEvents({ items: [], plan: [] }, content, null);
      last.stopped = content.some((event) => event.type === 'done' && event.stopReason === 'cancelled');
    }
  }
  return turns;
}

/** Kept outside the component so the combined list keeps its identity between renders. */
function messagesOf(results: { data?: ChatMessage[] }[]): (ChatMessage[] | undefined)[] {
  return results.map((result) => result.data);
}

type Entry =
  | { kind: 'turn'; key: string; at: number; turn: Turn }
  | { kind: 'live'; key: string; at: number; live: RunActivity }
  | { kind: 'run'; key: string; at: number; chat: Chat | null; live: RunActivity | null };

/** A message just sent shows from memory until its saved copy loads, which is matched by text within this window. */
const SAVE_SLACK_MS = 2000;

/** Where the panel starts for a view with no chat picked: the latest conversation, or the latest run. */
/** Everything the agent did in the view since the chat started, oldest first: your messages and its replies, and runs. */
export function ChatStream(props: { repoPath: string; viewRef: string; chats: Chat[]; agentName: string }) {
  const { repoPath, viewRef, chats, agentName } = props;
  const conversation = useConversation(repoPath, viewRef);
  const byRun = useRunActivity((state) => state.byRun);
  const runs = useClaude((state) => state.runs);
  const queued = useMemo(() => runs.filter((run) => run.state === 'queued' && run.context.repoPath === repoPath && sameView(run.ref, viewRef)), [runs, repoPath, viewRef]);
  const queuedElsewhere = runs.filter((run) => run.state === 'queued' && run.context.repoPath === repoPath && !sameView(run.ref, viewRef)).length;
  const editsElsewhere = useEditTarget(repoPath, viewRef) === 'working-copy';
  const editing = useEditing(repoPath, viewRef);
  const since = conversation?.since ?? defaultSince(chats);
  const shown = useMemo(
    () => chats.filter((chat) => Date.parse(chat.createdAt) >= since - SAVE_SLACK_MS).sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt)),
    [chats, since],
  );
  const conversations = useMemo(() => shown.filter(isConversation), [shown]);
  const messages = useQueries({
    queries: conversations.map((chat) => ({ queryKey: ['chat-messages', chat.id], queryFn: () => tauri.getChatMessages(chat.id) })),
    combine: messagesOf,
  });
  const savedTurns = useMemo(() => conversations.flatMap((chat, index) => turnsOf(chat.id, messages[index] ?? [])), [conversations, messages]);
  const lives = useMemo(
    () => projectActivities(byRun, repoPath, (ref) => sameView(ref, viewRef)).filter((activity) => activity.startedAt >= since - SAVE_SLACK_MS),
    [byRun, repoPath, viewRef, since],
  );

  const entries = useMemo(() => {
    const list: Entry[] = [];
    const liveTurns = lives.filter((activity) => activity.prompt);
    // A run about one comment shows on that comment, not here.
    const liveRuns = lives.filter((activity) => !activity.prompt && !activity.commentId);
    const sameTurn = (turn: Turn, activity: RunActivity) =>
      turn.chatId === activity.chatId && turn.at >= activity.startedAt - SAVE_SLACK_MS && turn.text === activity.prompt?.text;
    // A message just sent shows from memory until its reply is saved; then the saved copy takes over.
    const saved = (activity: RunActivity) => activity.outcome !== 'running' && savedTurns.some((turn) => sameTurn(turn, activity) && !!turn.log);
    for (const turn of savedTurns) {
      const activity = liveTurns.find((item) => sameTurn(turn, item));
      if (activity && !saved(activity)) {
        continue;
      }
      list.push({ kind: 'turn', key: turn.key, at: turn.at, turn });
    }
    for (const activity of liveTurns.filter((item) => !saved(item))) {
      list.push({ kind: 'live', key: `live-${activity.runId}`, at: activity.startedAt, live: activity });
    }
    for (const chat of shown.filter((item) => !isConversation(item) && !isCommentChat(item))) {
      list.push({ kind: 'run', key: chat.id, at: Date.parse(chat.createdAt), chat, live: liveRuns.find((activity) => activity.chatId === chat.id) ?? null });
    }
    for (const activity of liveRuns.filter((item) => item.outcome === 'running' && !shown.some((chat) => chat.id === item.chatId))) {
      list.push({ kind: 'run', key: `live-${activity.runId}`, at: activity.startedAt, chat: null, live: activity });
    }
    return list.sort((a, b) => a.at - b.at);
  }, [savedTurns, lives, shown]);

  useEffect(() => {
    const last = [...entries].reverse().find((entry) => entry.kind !== 'run');
    if (!last) {
      setLastSent(repoPath, viewRef, null);
      return;
    }
    const sent = last.kind === 'turn' ? last.turn : { text: last.live.prompt?.text ?? '', chips: last.live.prompt?.chips ?? [] };
    setLastSent(repoPath, viewRef, { key: last.key, text: sent.text, chips: sent.chips });
  }, [entries, repoPath, viewRef]);

  const scrollRef = useRef<HTMLDivElement>(null);
  const [follow, setFollow] = useState(true);
  const liveItems = lives.map((activity) => activity.items.length).join(',');

  useLayoutEffect(() => {
    if (follow && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [entries, liveItems, queued.length, follow]);

  if (entries.length === 0 && queued.length === 0) {
    return (
      <div className="flex-1 flex flex-col justify-end gap-1 px-5 pb-5 text-[13px] leading-5">
        <span className="text-text-secondary">Ask about {viewRef === TREE_REF ? 'this code' : 'these changes'}, or tell {agentName} what to change.</span>
        <span className="text-xs text-text-muted">
          Select lines and press <kbd className="font-sans"><KeyLabel keys={`${modKey}L`} /></kbd> to ask about them · <kbd className="font-sans">@</kbd> mentions a file
        </span>
      </div>
    );
  }

  return (
    <div
      ref={scrollRef}
      onScroll={(event) => {
        const el = event.currentTarget;
        setFollow(el.scrollHeight - el.scrollTop - el.clientHeight < 40);
      }}
      className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden flex flex-col gap-4 px-3.5 py-4"
    >
      {/* Takes the free space, so a short chat sits by the message box; it shrinks to nothing once the chat scrolls. */}
      <div aria-hidden className="flex-1 -mb-4" />
      {entries.map((entry) => {
        if (entry.kind === 'turn') {
          const copying = editing?.kind === 'copy' && editing.id === entry.key;
          return (
            <ChatTurn
              key={entry.key}
              repoPath={repoPath}
              viewRef={viewRef}
              text={entry.turn.text}
              chips={entry.turn.chips}
              sentAs={entry.turn.sentAs}
              reply={<SavedReply repoPath={repoPath} viewRef={viewRef} log={entry.turn.log} stopped={entry.turn.stopped} editsElsewhere={editsElsewhere} />}
              editing={copying ? 'Editing a copy below' : null}
            />
          );
        }
        if (entry.kind === 'live') {
          const changing = editing?.kind === 'running' && editing.id === entry.live.runId && entry.live.outcome === 'running';
          return (
            <ChatTurn
              key={entry.key}
              repoPath={repoPath}
              viewRef={viewRef}
              text={entry.live.prompt?.text ?? ''}
              chips={entry.live.prompt?.chips ?? []}
              sentAs={entry.live.prompt?.sentAs ?? null}
              reply={<LiveReply repoPath={repoPath} viewRef={viewRef} live={entry.live} editsElsewhere={editsElsewhere} />}
              editing={changing ? 'Editing below' : null}
            />
          );
        }
        return <RunTurn key={entry.key} repoPath={repoPath} viewRef={viewRef} chat={entry.chat} live={entry.live} editsElsewhere={editsElsewhere} />;
      })}
      {queued.map((run) => {
        const changing = editing?.kind === 'queued' && editing.id === run.id;
        return (
          <div key={run.id} className="self-end flex flex-col items-end gap-1 max-w-[88%]">
            <div
              className={cn(
                'px-3 py-2 rounded-xl border border-dashed text-[13px] leading-5 text-text-secondary whitespace-pre-wrap [overflow-wrap:anywhere]',
                changing ? 'border-claude/70 bg-claude/6' : 'border-control-border',
              )}
            >
              {run.context.conversation ? run.context.text : queuedTitle(run)}
            </div>
            {changing ? (
              <span className="flex items-center gap-1 text-[11px] text-claude"><PencilIcon size="xs" />Editing below</span>
            ) : (
              <span className="text-[11px] text-text-muted">
                {queuedNote(blockerOf(runs, run))} ·{' '}
                <button type="button" onClick={() => cancelQueuedRun(run.id)} className="text-text-secondary hover:text-text hover:underline cursor-pointer">
                  Remove
                </button>
              </span>
            )}
          </div>
        );
      })}
      {queuedElsewhere > 0 && <span className="self-end text-[11px] text-text-muted">{plural(queuedElsewhere, 'more message')} queued in other views</span>}
    </div>
  );
}

export function ChipTag(props: { chip: ContextChip; onRemove?: () => void }) {
  const { chip, onRemove } = props;

  return (
    <span className="inline-flex items-center gap-1 h-5 pl-1.5 pr-1 rounded bg-accent/12 font-mono text-[11px] text-accent" title={chip.filePath}>
      {chipLabel(chip)}
      {onRemove && (
        <button type="button" onClick={onRemove} className="flex items-center justify-center w-3.5 h-3.5 rounded hover:bg-accent/20 cursor-pointer" aria-label={`Remove ${chipLabel(chip)}`}>
          <XIcon size="xs" />
        </button>
      )}
    </span>
  );
}

const WAITING_LABEL = 'Waiting for the run in another window on this project to finish…';

const SENT_AS_LABEL: Record<SentAs, string> = { steer: 'Sent while it was working', edit: 'Edited' };

interface ChatTurnProps {
  repoPath: string;
  viewRef: string;
  text: string;
  chips: ContextChip[];
  sentAs: SentAs | null;
  reply: ReactNode;
  /** Set while ↑ has this message in the box below. */
  editing: string | null;
}

function ChatTurn(props: ChatTurnProps) {
  const { text, chips, sentAs, reply, editing } = props;

  return (
    <div className="flex flex-col gap-3">
      <div className="self-end flex flex-col items-end gap-1.5 max-w-[88%]">
        {sentAs && <span className="text-[11px] text-text-muted">{SENT_AS_LABEL[sentAs]}</span>}
        {chips.length > 0 && (
          <div className="flex flex-wrap justify-end gap-1">
            {chips.map((chip, index) => <ChipTag key={index} chip={chip} />)}
          </div>
        )}
        {text && (
          <div
            className={cn(
              'px-3 py-2 rounded-xl bg-fill text-[13px] leading-5 whitespace-pre-wrap [overflow-wrap:anywhere]',
              editing && 'outline-1 outline-dashed outline-claude/70 outline-offset-2',
            )}
          >
            {text}
          </div>
        )}
        {editing && <span className="flex items-center gap-1 text-[11px] text-claude"><PencilIcon size="xs" />{editing}</span>}
      </div>
      {reply}
    </div>
  );
}

function LiveReply(props: { repoPath: string; viewRef: string; live: RunActivity; editsElsewhere: boolean }) {
  const { repoPath, viewRef, live, editsElsewhere } = props;
  const now = useNow(live.outcome === 'running');

  if (live.outcome !== 'running') {
    return <SavedReply repoPath={repoPath} viewRef={viewRef} log={live} stopped={live.outcome === 'stopped'} failed={live.outcome === 'failed'} editsElsewhere={editsElsewhere} />;
  }
  return (
    <div className="flex flex-col gap-3">
      {live.items.length === 0 && (
        <div className="flex items-center gap-2 text-text-muted">
          <Spinner className="text-claude" />
          {live.waiting ? WAITING_LABEL : 'Thinking…'}
        </div>
      )}
      <Timeline items={live.items} running startedAt={live.startedAt} now={now} repoPath={repoPath} runRef={live.ref} />
    </div>
  );
}

interface SavedReplyProps {
  repoPath: string;
  viewRef: string;
  log: ActivityLog | null;
  stopped: boolean;
  failed?: boolean;
  /** The view doesn't show the working copy, so edits need a way to where they are. */
  editsElsewhere: boolean;
}

/** The reply's closing message, with its steps folded except edits and comments, which stay in sight. */
function SavedReply(props: SavedReplyProps) {
  const { repoPath, viewRef, log, stopped, failed, editsElsewhere } = props;
  const [open, setOpen] = useState(false);

  if (!log) {
    return <div className="text-text-muted">No reply. The run was stopped or failed before it answered.</div>;
  }
  if (stopped && log.items.length === 0) {
    return <div className="text-text-muted">Stopped before it replied</div>;
  }
  const closing = wrapUp(log);
  const steps = closing ? log.items.filter((_, index) => index !== closing.index) : log.items;
  const changes = steps.filter((item): item is Extract<typeof item, { kind: 'tool' }> => {
    if (item.kind !== 'tool') {
      return false;
    }
    const category = describeTool(item, repoPath).category;
    return category === 'edit' || category === 'comment';
  });
  const edited = changes.some((tool) => tool.status !== 'failed' && describeTool(tool, repoPath).category === 'edit');
  const count = toolCount({ items: steps, plan: [] });
  const seeEdits = whereEditsShow(viewRef);

  return (
    <div className="flex flex-col gap-2">
      {count > 0 && (
        <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="self-start flex items-center gap-1.5 text-text-muted hover:text-text cursor-pointer">
          <ChevronRightIcon size="xs" className={cn('transition-transform', open && 'rotate-90')} />
          {plural(count, 'step')}
        </button>
      )}
      {open && (
        <div className="flex flex-col gap-3 pl-3 border-l border-border-muted">
          <Timeline items={steps} running={false} startedAt={0} now={0} repoPath={repoPath} runRef={viewRef} />
        </div>
      )}
      {!open && changes.length > 0 && (
        <div className="flex flex-col">
          {changes.map((tool) => <ToolRow key={tool.id} tool={tool} startedAt={0} repoPath={repoPath} fresh={false} />)}
        </div>
      )}
      {editsElsewhere && edited && (
        <button
          type="button"
          onClick={() => goToThread(repoPath, { ref: seeEdits.ref, threadId: null })}
          className="self-start flex items-center gap-1.5 px-2 py-1 -ml-0.5 rounded-md border border-border text-text-secondary hover:text-text hover:bg-hover cursor-pointer"
        >
          {seeEdits.allChanges ? 'These edits show in All changes · Switch' : 'These edits are in Uncommitted changes · View'}
        </button>
      )}
      {closing && (
        <div className="text-[13px] leading-5 text-text">
          <MarkdownContent content={closing.text} />
        </div>
      )}
      {failed && (
        <div className="flex items-center gap-1.5 text-deleted">
          <AlertCircleIcon size="sm" />
          Stopped with an error
        </div>
      )}
      {stopped && <div className="text-text-muted">Stopped here</div>}
    </div>
  );
}

/** What a run was asked to do, as the message it stands for: "Review these changes · Security". */
function requestText(chat: Chat | null, actionKind: string): string {
  const title = chat?.title ?? '';
  const review = title.match(/^Review(?: \((.*)\))? · /);
  if (review || (!chat && actionKind === 'review')) {
    return review?.[1] ? `Review these changes · ${review[1]}` : 'Review these changes';
  }
  if (title.startsWith('Guide · ') || (!chat && actionKind === 'guide')) {
    return 'Write a guide';
  }
  if (title === 'Resolve all comments' || (!chat && actionKind === 'resolve')) {
    return 'Answer or fix the open comments';
  }
  if (title === 'Address review' || (!chat && actionKind === 'reviewFeedback')) {
    return 'Address my review';
  }
  return title || actionTitle(actionKind);
}

function RunTurn(props: { repoPath: string; viewRef: string; chat: Chat | null; live: RunActivity | null; editsElsewhere: boolean }) {
  const { repoPath, viewRef, chat, live, editsElsewhere } = props;
  const { data: messages } = useQuery({
    queryKey: ['chat-messages', chat?.id],
    queryFn: () => tauri.getChatMessages(chat!.id),
    enabled: !!chat && !live,
  });
  const saved = useMemo(() => (messages ? logFromMessages(messages) : null), [messages]);
  const running = live?.outcome === 'running';
  const commentIds = !live || running ? [] : live.items.filter((item) => item.kind === 'comment').map((item) => item.id);
  const ref = live?.ref ?? chat?.ref ?? null;
  const reply = live ? (
    <LiveReply repoPath={repoPath} viewRef={viewRef} live={live} editsElsewhere={editsElsewhere} />
  ) : (
    <SavedReply repoPath={repoPath} viewRef={viewRef} log={saved} stopped={false} editsElsewhere={editsElsewhere} />
  );

  return (
    <ChatTurn
      repoPath={repoPath}
      viewRef={viewRef}
      text={requestText(chat, live?.actionKind ?? 'review')}
      chips={[]}
      sentAs={null}
      editing={null}
      reply={
        <>
          {reply}
          {commentIds.length > 0 && ref && (
            <button
              type="button"
              onClick={() => openRunResult(repoPath, ref, commentIds)}
              className="self-start flex items-center gap-1.5 h-6 px-2 rounded-md border border-control-border bg-raised text-text hover:bg-control-hover cursor-pointer"
            >
              <CommentIcon size="xs" className="text-text-muted" />
              {commentIds.length === 1 ? 'Show comment' : `Show ${commentIds.length} comments`}
            </button>
          )}
        </>
      }
    />
  );
}

function queuedNote(blocker: ClaudeRun | null): string {
  return blocker ? `Queued · sends after ${waitLabel(blocker)}` : 'Queued';
}

function queuedTitle(run: ClaudeRun): string {
  const comments = run.threadIds.length;
  switch (run.action.kind) {
    case 'review':
      return 'Review these changes';
    case 'guide':
      return 'Write a guide';
    case 'resolve':
      return comments > 0 ? `Answer or fix ${plural(comments, 'comment')}` : 'Answer or fix comments';
    case 'thread':
      return 'Answer a comment';
    case 'reviewFeedback':
      return 'Address your review';
    default:
      return actionTitle(run.action.kind);
  }
}
