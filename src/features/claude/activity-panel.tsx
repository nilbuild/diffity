import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as tauri from '../../lib/tauri';
import { cn } from '../../lib/cn';
import { useRepoPath } from '../../hooks/use-repo';
import { useCurrentViewRef } from '../../hooks/use-current-view';
import { goToThread } from '../../lib/thread-location';
import { MarkdownContent } from '../../components/layout/markdown-content';
import { Spinner } from '../../components/icons/spinner';
import { buttonClaudeSolid, buttonIcon, buttonOutline } from '../../components/ui/button-styles';
import {
  AlertCircleIcon,
  ArrowLeftIcon,
  CheckCircleIcon,
  CheckIcon,
  ChevronRightIcon,
  CodeIcon,
  CommentIcon,
  CopyIcon,
  ExternalLinkIcon,
  EyeIcon,
  FileTextIcon,
  HistoryIcon,
  PencilIcon,
  RefreshIcon,
  SearchIcon,
  SparkleIcon,
  StopIcon,
  TerminalIcon,
  XIcon,
} from '../../components/ui/icon';
import type { AgentMode, Chat } from '../../lib/types';
import { agentMeta } from './agents';
import { runModelLabel, useModelCatalog } from './model-setting';
import { canRunAgain, openRunResult, runAgain, runViewLabel } from './claude-runner';
import { showApprovals, useWaitingApprovals } from './claude-approval-modal';
import {
  closeActivity,
  currentFile,
  filesRead,
  logFromMessages,
  modelFromMessages,
  openActivity,
  openActivityHistory,
  showRun,
  toolCount,
  useRunActivity,
  wrapUp,
  type ActivityItem,
  type ActivityLog,
  type RunActivity,
} from './run-activity';
import { describeTool, summarizeTools, type ToolLabel } from './tool-label';
import { splitShell } from './shell-label';

export function formatElapsed(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

function formatDuration(ms: number) {
  const total = Math.max(1, Math.round(ms / 1000));
  if (total < 60) {
    return `${total}s`;
  }
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return seconds ? `${minutes}m ${seconds}s` : `${minutes}m`;
}

function ago(at: number) {
  const minutes = Math.floor((Date.now() - at) / 60_000);
  if (minutes < 1) {
    return 'just now';
  }
  if (minutes < 60) {
    return `${minutes}m ago`;
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours}h ago`;
  }
  return new Date(at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function useNow(active: boolean) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) {
      return;
    }
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [active]);
  return now;
}

type ToolItem = Extract<ActivityItem, { kind: 'tool' }>;
type CommentItem = Extract<ActivityItem, { kind: 'comment' }>;

function isRunning(tool: ToolItem) {
  return tool.status === 'pending' || tool.status === 'in_progress';
}

function ToolGlyph(props: { tool: ToolItem; label: ToolLabel }) {
  const { tool, label } = props;
  if (isRunning(tool)) {
    return <Spinner className="text-claude" />;
  }
  if (tool.status === 'failed') {
    return <AlertCircleIcon size="sm" className="text-deleted" />;
  }
  const className = 'text-text-muted';
  switch (label.category) {
    case 'read':
      return <FileTextIcon size="sm" className={className} />;
    case 'search':
      return <SearchIcon size="sm" className={className} />;
    case 'command':
      return <TerminalIcon size="sm" className={className} />;
    case 'edit':
      return <PencilIcon size="sm" className={className} />;
    case 'fetch':
      return <ExternalLinkIcon size="sm" className={className} />;
    case 'comment':
      return <CommentIcon size="sm" className={className} />;
    default:
      return <CodeIcon size="sm" className={className} />;
  }
}

function PathSubject(props: { subject: string }) {
  const { subject } = props;
  const match = subject.match(/^(.*?)(\s+\(.*\))?$/);
  const path = match?.[1] ?? subject;
  const extra = match?.[2]?.trim() ?? '';
  const slash = path.lastIndexOf('/');
  const name = slash === -1 ? path : path.slice(slash + 1);
  const folder = slash === -1 ? '' : path.slice(0, slash);

  return (
    <span className="flex items-baseline gap-1.5 min-w-0 overflow-hidden" title={subject}>
      <span className="shrink-0 max-w-full truncate font-mono text-[11.5px] text-text">{name}</span>
      {extra && <span className="shrink-0 whitespace-nowrap text-[11px] text-text-muted">{extra}</span>}
      {folder && <span className="min-w-0 shrink-[100] truncate font-mono text-[11px] text-text-muted" dir="rtl">{folder}</span>}
    </span>
  );
}

function CommandBlock(props: { command: string }) {
  const steps = splitShell(props.command);

  return (
    <div className="ml-6 mt-0.5 mb-1.5 px-2.5 py-2 rounded-md border border-border-muted bg-bg-secondary font-mono text-[11px] leading-[17px] text-text">
      {steps.map((step, index) => (
        <div key={index} className="flex gap-2 min-w-0">
          <span className="shrink-0 w-2 select-none text-text-muted">{index === 0 || steps[index - 1].joiner !== '|' ? '$' : ''}</span>
          <span className="min-w-0 whitespace-pre-wrap [overflow-wrap:anywhere]">
            {step.text}
            {step.joiner && <span className="text-claude"> {step.joiner}</span>}
          </span>
        </div>
      ))}
    </div>
  );
}

function ToolRow(props: { tool: ToolItem; startedAt: number; repoPath: string }) {
  const { tool, startedAt, repoPath } = props;
  const [open, setOpen] = useState(false);
  const label = describeTool(tool, repoPath);
  const failed = tool.status === 'failed';
  const subject = label.subject?.trim() ?? '';
  const command = label.command?.trim() ?? '';
  const expandable = !!command && (command !== subject || subject.length > 44 || subject.includes('\n'));

  const head = (
    <>
      <span className="flex items-center justify-center w-4 h-[18px] shrink-0">
        <ToolGlyph tool={tool} label={label} />
      </span>
      <span className="flex-1 flex items-baseline gap-2 min-w-0 leading-[18px]">
        <span className={cn('shrink-0', isRunning(tool) ? 'text-text font-medium' : 'text-text-secondary')}>{label.verb}</span>
        {subject && label.subjectKind === 'path' && <PathSubject subject={subject} />}
        {subject && label.subjectKind === 'code' && (
          <code className="min-w-0 truncate font-mono text-[11.5px] text-text">{subject.split('\n')[0]}</code>
        )}
        {subject && label.subjectKind === 'text' && <span className="min-w-0 truncate text-text-muted">{subject}</span>}
        {!!label.more && <span className="shrink-0 px-1.5 rounded bg-fill text-[10.5px] leading-4 text-text-muted">+{label.more} more</span>}
        {label.source && <span className="shrink-0 px-1.5 rounded bg-fill text-[10.5px] leading-4 text-text-muted">{label.source}</span>}
        {failed && <span className="shrink-0 px-1.5 rounded bg-deleted/12 text-[10.5px] leading-4 text-deleted">failed</span>}
      </span>
      {tool.at && <span className="shrink-0 leading-[18px] text-[11px] text-text-muted tabular-nums">{formatElapsed(tool.at - startedAt)}</span>}
    </>
  );

  if (!expandable) {
    return <div className="flex items-start gap-2 px-1.5 py-1 -mx-1.5 rounded-md">{head}</div>;
  }
  return (
    <div className="flex flex-col">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="flex items-start gap-2 px-1.5 py-1 -mx-1.5 rounded-md text-left hover:bg-hover cursor-pointer"
        title={open ? 'Hide the command' : 'Show the command'}
      >
        {head}
      </button>
      {open && <CommandBlock command={command} />}
    </div>
  );
}

/** Three or more calls in a row fold into one line that says what they did. */
function ToolGroup(props: { tools: ToolItem[]; live: boolean; startedAt: number; repoPath: string }) {
  const { tools, live, startedAt, repoPath } = props;
  const [open, setOpen] = useState<boolean | null>(null);
  const expanded = open ?? live;
  const rows = tools.map((tool) => <ToolRow key={tool.id} tool={tool} startedAt={startedAt} repoPath={repoPath} />);

  if (tools.length < 3) {
    return <div className="flex flex-col">{rows}</div>;
  }
  const failed = tools.filter((tool) => tool.status === 'failed').length;
  const running = tools.some(isRunning);

  return (
    <div className="flex flex-col">
      <button
        type="button"
        onClick={() => setOpen(!expanded)}
        aria-expanded={expanded}
        className="flex items-center gap-2 px-1.5 py-1 -mx-1.5 rounded-md text-left text-text-secondary hover:bg-hover hover:text-text cursor-pointer"
      >
        <span className="flex items-center justify-center w-4 h-[18px] shrink-0">
          {running ? <Spinner className="text-claude" /> : <ChevronRightIcon size="xs" className={cn('transition-transform', expanded && 'rotate-90')} />}
        </span>
        <span className="flex-1 truncate leading-[18px]">{summarizeTools(tools.map((tool) => describeTool(tool, repoPath)))}</span>
        {failed > 0 && <span className="shrink-0 px-1.5 rounded bg-deleted/12 text-[10.5px] leading-4 text-deleted">{failed} failed</span>}
      </button>
      {expanded && <div className="flex flex-col ml-[7px] pl-[13px] border-l border-border-muted">{rows}</div>}
    </div>
  );
}

function commentLabel(comment: CommentItem) {
  const name = comment.filePath.split('/').pop() ?? comment.filePath;
  return `${name}:${comment.line}`;
}

function firstLine(text: string) {
  return text.trim().split('\n')[0] ?? '';
}

function ThoughtRow(props: { item: Extract<ActivityItem, { kind: 'thought' }>; live: boolean; now: number }) {
  const { item, live, now } = props;
  const [open, setOpen] = useState(false);
  const textRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (live && textRef.current) {
      textRef.current.scrollTop = textRef.current.scrollHeight;
    }
  }, [live, item.text]);

  if (live) {
    return (
      <div className="flex flex-col gap-1 px-3 py-2.5 rounded-lg bg-claude/6 border border-claude/25">
        <div className="flex items-center gap-1.5 text-claude">
          <span className="font-medium">Thinking…</span>
          <span className="ml-auto text-text-muted tabular-nums">{item.startedAt ? formatElapsed(now - item.startedAt) : null}</span>
        </div>
        <div ref={textRef} className="max-h-48 overflow-y-auto whitespace-pre-wrap italic leading-[18px] text-text-secondary">
          {item.text.trim()}
        </div>
      </div>
    );
  }

  const seconds = item.startedAt && item.endedAt ? Math.max(1, Math.round((item.endedAt - item.startedAt) / 1000)) : null;
  return (
    <div className="flex flex-col gap-1">
      <button type="button" onClick={() => setOpen(!open)} className="flex items-center gap-1.5 text-text-muted hover:text-text cursor-pointer text-left" aria-expanded={open}>
        <ChevronRightIcon size="xs" className={cn('transition-transform', open && 'rotate-90')} />
        <span className="font-medium">{seconds ? `Thought for ${seconds}s` : 'Thought'}</span>
      </button>
      {open ? (
        <div className="pl-4 whitespace-pre-wrap italic leading-[18px] text-text-secondary">{item.text.trim()}</div>
      ) : (
        <div className="pl-4 truncate italic text-text-muted">{firstLine(item.text)}</div>
      )}
    </div>
  );
}

function CommentRow(props: { item: CommentItem; repoPath: string; runRef: string | null }) {
  const { item, repoPath, runRef } = props;

  return (
    <div className="flex flex-col gap-1 px-2.5 py-2 rounded-lg border border-diff-comment-gutter bg-diff-comment-bg">
      <div className="flex items-center gap-1.5 font-medium">
        <CommentIcon size="sm" className="text-modified" />
        Left a comment
        {runRef && (
          <button type="button" onClick={() => goToThread(repoPath, { ref: runRef, threadId: item.id })} className="ml-auto font-mono text-[11px] font-normal text-accent hover:underline cursor-pointer">
            {commentLabel(item)}
          </button>
        )}
      </div>
      <div className="line-clamp-3 leading-[17px] text-text-secondary">{item.body}</div>
    </div>
  );
}

type Block = { kind: 'tools'; id: string; tools: ToolItem[] } | { kind: 'item'; item: Exclude<ActivityItem, ToolItem> };

function toBlocks(items: ActivityItem[]): Block[] {
  const blocks: Block[] = [];
  for (const item of items) {
    if (item.kind !== 'tool') {
      blocks.push({ kind: 'item', item });
      continue;
    }
    const last = blocks[blocks.length - 1];
    if (last?.kind === 'tools') {
      last.tools.push(item);
    } else {
      blocks.push({ kind: 'tools', id: item.id, tools: [item] });
    }
  }
  return blocks;
}

function Timeline(props: { items: ActivityItem[]; running: boolean; startedAt: number; now: number; repoPath: string; runRef: string | null }) {
  const { items, running, startedAt, now, repoPath, runRef } = props;
  const blocks = useMemo(() => toBlocks(items), [items]);

  return (
    <>
      {blocks.map((block, index) => {
        const live = running && index === blocks.length - 1;
        if (block.kind === 'tools') {
          return <ToolGroup key={`tools-${block.id}`} tools={block.tools} live={live} startedAt={startedAt} repoPath={repoPath} />;
        }
        const { item } = block;
        switch (item.kind) {
          case 'thought':
            return <ThoughtRow key={`thought-${item.id}`} item={item} live={live} now={now} />;
          case 'text':
            return (
              <div key={`text-${item.id}`} className="text-[13px] leading-5 text-text">
                <MarkdownContent content={item.text} />
              </div>
            );
          case 'comment':
            return <CommentRow key={`comment-${item.id}`} item={item} repoPath={repoPath} runRef={runRef} />;
        }
      })}
    </>
  );
}

function PlanCard(props: { plan: ActivityLog['plan'] }) {
  const { plan } = props;
  const done = plan.filter((entry) => entry.status === 'completed').length;

  return (
    <div className="flex flex-col gap-1.5 px-3 py-2.5 rounded-lg border border-border bg-bg-secondary">
      <div className="flex items-center justify-between font-medium text-text-secondary">
        Plan
        <span className="font-normal text-text-muted">{done} of {plan.length}</span>
      </div>
      {plan.map((entry, index) => (
        <div key={index} className="flex items-start gap-2">
          <span className="flex items-center h-4 shrink-0">
            {entry.status === 'completed' && <CheckIcon size="sm" className="text-added" />}
            {entry.status === 'in_progress' && <Spinner className="text-claude" />}
            {entry.status !== 'completed' && entry.status !== 'in_progress' && <span className="w-3 h-3 rounded-full border-[1.5px] border-control-border" />}
          </span>
          <span className={cn('leading-4', entry.status === 'completed' && 'text-text-muted line-through', entry.status === 'in_progress' && 'font-medium')}>{entry.content}</span>
        </div>
      ))}
    </div>
  );
}

interface ShownRun {
  key: string;
  title: string | null;
  activity: Pick<RunActivity, 'items' | 'plan' | 'agentId' | 'model' | 'actionKind' | 'startedAt' | 'endedAt' | 'outcome' | 'ref'>;
  /** Comments are only tracked for runs this window watched. */
  live: RunActivity | null;
}

function actionTitle(kind: string) {
  if (kind === 'review') {
    return 'Review activity';
  }
  return kind === 'guide' ? 'Guide activity' : 'Agent activity';
}

function outcomeTitle(activity: ShownRun['activity'], name: string) {
  if (activity.outcome === 'failed') {
    return `${name} stopped with an error`;
  }
  if (activity.outcome === 'stopped') {
    return `${name} was stopped`;
  }
  if (activity.actionKind === 'review') {
    return 'Review finished';
  }
  return activity.actionKind === 'guide' ? 'Guide written' : `${name} finished`;
}

function toolMarkdown(tool: ToolItem, repoPath: string) {
  const label = describeTool(tool, repoPath);
  const failed = tool.status === 'failed' ? ' (failed)' : '';
  if (!label.subject) {
    return `- ${label.verb}${failed}`;
  }
  return `- ${label.verb} \`${label.subject.replace(/\n/g, ' ')}\`${failed}`;
}

function toMarkdown(activity: ShownRun['activity'], repoPath: string) {
  const lines: string[] = [];
  for (const item of activity.items) {
    if (item.kind === 'thought') {
      lines.push(item.text.trim().split('\n').map((line) => `> ${line}`).join('\n'));
    } else if (item.kind === 'text') {
      lines.push(item.text.trim());
    } else if (item.kind === 'tool') {
      lines.push(toolMarkdown(item, repoPath));
    } else {
      lines.push(`- Comment on \`${item.filePath}:${item.line}\`: ${item.body}`);
    }
  }
  return lines.join('\n\n');
}

/** Stored titles end in the raw ref ("Review · work"); show the view's name instead. */
function chatTitle(chat: Chat, repoPath: string) {
  const match = chat.title.match(/^(Review(?: \(.*\))?|Guide) · (.+)$/);
  if (!match) {
    return chat.title || 'Agent run';
  }
  return `${match[1]} · ${runViewLabel(repoPath, match[2])}`;
}

function useRepoChats(repoPath: string) {
  return useQuery({
    queryKey: ['chats', repoPath, null],
    queryFn: () => tauri.listChats(repoPath),
  });
}

function useShownRun(repoPath: string, selected: string | null): ShownRun | null {
  const live = useRunActivity((state) => state.byRepo[repoPath] ?? null);
  const viewRef = useCurrentViewRef();
  const ref = live?.ref ?? viewRef;
  const queryClient = useQueryClient();
  const { data: refChats = [] } = useQuery({
    queryKey: ['chats', repoPath, ref],
    queryFn: () => tauri.listChats(repoPath, ref ?? undefined),
    enabled: !!ref,
  });
  const { data: allChats = [] } = useRepoChats(repoPath);

  const outcome = live?.outcome;
  useEffect(() => {
    if (outcome && outcome !== 'running') {
      void queryClient.invalidateQueries({ queryKey: ['chats', repoPath] });
    }
  }, [outcome, repoPath, queryClient]);

  const key = selected ?? live?.chatId ?? refChats[0]?.id ?? null;
  const fromLive = !!live && (key === null || key === live.chatId);
  const chat = fromLive ? null : allChats.find((item) => item.id === key) ?? refChats.find((item) => item.id === key) ?? null;
  const { data: messages } = useQuery({
    queryKey: ['chat-messages', chat?.id],
    queryFn: () => tauri.getChatMessages(chat!.id),
    enabled: !!chat,
  });
  const saved = useMemo(() => (messages ? { ...logFromMessages(messages), model: modelFromMessages(messages) } : null), [messages]);

  if (fromLive && live) {
    const liveChat = allChats.find((item) => item.id === live.chatId);
    const title = liveChat ? chatTitle(liveChat, repoPath) : null;
    return { key: live.chatId ?? live.runId, title, activity: live, live };
  }
  if (chat && saved) {
    return {
      key: chat.id,
      title: chatTitle(chat, repoPath),
      activity: {
        ...saved,
        agentId: chat.agentId,
        actionKind: chat.mode === 'review' ? 'review' : 'other',
        startedAt: Date.parse(chat.createdAt),
        endedAt: Date.parse(chat.updatedAt),
        outcome: 'done',
        ref,
      },
      live: null,
    };
  }
  return null;
}

/** Docked beside the page: what the agent is doing (or did) for the run in this project. */
export function ActivityPanel() {
  const open = useRunActivity((state) => state.open);
  if (!open) {
    return null;
  }
  return <ActivityPanelBody />;
}

function ActivityPanelBody() {
  const repoPath = useRepoPath();
  const selected = useRunActivity((state) => state.selected);
  const showHistory = useRunActivity((state) => state.showHistory);
  const shown = useShownRun(repoPath, selected);
  const running = shown?.activity.outcome === 'running';
  const title = showHistory ? 'Agent history' : actionTitle(shown?.activity.actionKind ?? 'review');

  return (
    <aside className="flex flex-col w-[400px] max-w-[45vw] shrink-0 h-screen bg-bg border-l border-frame-border font-sans text-xs text-text animate-slide-in-right" aria-label={title}>
      <div data-tauri-drag-region className="flex items-center gap-1 h-[45px] shrink-0 pl-2 pr-2 bg-frame border-b border-frame-border">
        {showHistory && shown ? (
          <button type="button" onClick={() => showRun(selected)} className={buttonIcon} aria-label="Back to run" title="Back">
            <ArrowLeftIcon size="sm" />
          </button>
        ) : (
          <span className="flex items-center justify-center w-7 h-7">
            <SparkleIcon size="md" className="text-claude" />
          </span>
        )}
        <span className="text-[13px] font-semibold">{title}</span>
        <span data-tauri-drag-region className="flex-1 self-stretch" />
        {!showHistory && (
          <button type="button" onClick={openActivityHistory} className={buttonIcon} aria-label="Past runs" title="Past runs">
            <HistoryIcon size="sm" />
          </button>
        )}
        <button type="button" onClick={closeActivity} className={buttonIcon} aria-label="Close activity" title="Close">
          <XIcon size="sm" />
        </button>
      </div>

      {showHistory && <HistoryList repoPath={repoPath} currentKey={shown?.key ?? null} />}
      {!showHistory && !shown && (
        <div className="flex-1 flex flex-col items-center justify-center gap-3 px-8 text-center text-[13px] leading-5 text-text-muted">
          Ask an agent to review and you can follow what it reads and thinks here.
          <button type="button" onClick={openActivityHistory} className={buttonOutline}>
            <HistoryIcon size="sm" />
            Past runs
          </button>
        </div>
      )}
      {!showHistory && shown && <RunModelLine agentId={shown.activity.agentId} model={shown.activity.model} />}
      {!showHistory && shown && running && <LiveRun key={shown.key} shown={shown} repoPath={repoPath} />}
      {!showHistory && shown && !running && <FinishedRun key={shown.key} shown={shown} repoPath={repoPath} />}
    </aside>
  );
}

function LiveRun(props: { shown: ShownRun; repoPath: string }) {
  const { shown, repoPath } = props;
  const { activity } = shown;
  const now = useNow(true);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [follow, setFollow] = useState(true);
  const waiting = useWaitingApprovals(repoPath);

  useLayoutEffect(() => {
    if (follow && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [activity.items, follow]);

  return (
    <>
      <div
        ref={scrollRef}
        onScroll={(event) => {
          const el = event.currentTarget;
          setFollow(el.scrollHeight - el.scrollTop - el.clientHeight < 40);
        }}
        className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden flex flex-col gap-3 p-3.5"
      >
        {activity.plan.length > 0 && <PlanCard plan={activity.plan} />}
        {activity.items.length === 0 && (
          <div className="flex items-center gap-2 text-text-muted">
            <Spinner className="text-claude" />
            Starting…
          </div>
        )}
        <Timeline items={activity.items} running startedAt={activity.startedAt} now={now} repoPath={repoPath} runRef={activity.ref} />
      </div>
      {waiting > 0 && (
        <div className="flex items-center gap-2 h-10 shrink-0 px-3.5 border-t border-border bg-claude/8">
          <span className="w-1.5 h-1.5 rounded-full bg-claude" />
          <span className="flex-1 min-w-0 truncate text-text">{agentMeta(activity.agentId).short} is waiting for your approval</span>
          <button type="button" onClick={() => showApprovals(repoPath)} className={cn(buttonOutline, 'h-6 px-2 text-xs')}>
            Review
          </button>
        </div>
      )}
      <div className="flex items-center gap-2 h-10 shrink-0 px-3.5 border-t border-border text-text-secondary">
        {follow ? (
          <span className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-added" />
            Following live
          </span>
        ) : (
          <button type="button" onClick={() => setFollow(true)} className="text-accent hover:underline cursor-pointer">
            Jump to latest
          </button>
        )}
        <span className="ml-auto text-text-muted tabular-nums">
          {formatElapsed(now - activity.startedAt)} · {toolCount(activity)} steps · {activity.items.filter((item) => item.kind === 'comment').length} comments
        </span>
      </div>
    </>
  );
}

function RunModelLine(props: { agentId: string; model: RunActivity['model'] }) {
  const { agentId, model } = props;
  const { data: catalog } = useModelCatalog(agentId);
  const name = agentMeta(agentId).name;

  return (
    <div className="flex items-center gap-1.5 h-10 shrink-0 px-3.5 border-b border-border-muted text-text-muted">
      <span className="text-text-secondary">{name}</span>
      {model && (
        <>
          <span aria-hidden>·</span>
          <span className="truncate">{runModelLabel(catalog, model, 'Default model')}</span>
        </>
      )}
    </div>
  );
}

function OutcomeIcon(props: { outcome: RunActivity['outcome'] }) {
  const { outcome } = props;
  if (outcome === 'failed') {
    return (
      <span className="flex items-center justify-center w-7 h-7 shrink-0 rounded-full bg-deleted/12 text-deleted">
        <AlertCircleIcon size="sm" />
      </span>
    );
  }
  if (outcome === 'stopped') {
    return (
      <span className="flex items-center justify-center w-7 h-7 shrink-0 rounded-full bg-fill text-text-muted">
        <StopIcon size="xs" />
      </span>
    );
  }
  return (
    <span className="flex items-center justify-center w-7 h-7 shrink-0 rounded-full bg-added/14 text-added">
      <CheckIcon size="sm" />
    </span>
  );
}

function FinishedRun(props: { shown: ShownRun; repoPath: string }) {
  const { shown, repoPath } = props;
  const { activity, live } = shown;
  const name = agentMeta(activity.agentId).short;
  const comments = live ? live.items.filter((item): item is CommentItem => item.kind === 'comment') : [];
  const closing = wrapUp(activity);
  const steps = closing ? activity.items.filter((_, index) => index !== closing.index) : activity.items;
  const [showSteps, setShowSteps] = useState(!closing);
  const [copied, setCopied] = useState(false);
  const tools = toolCount(activity);
  const files = filesRead(activity, repoPath).length;
  const again = !!live && (activity.outcome === 'failed' || activity.outcome === 'stopped') && canRunAgain(live.runId) ? live.runId : null;

  const facts = [
    activity.endedAt ? `Took ${formatDuration(activity.endedAt - activity.startedAt)}` : null,
    `${tools} tool call${tools === 1 ? '' : 's'}`,
    files > 0 ? `${files} file${files === 1 ? '' : 's'} read` : null,
    comments.length > 0 ? `${comments.length} comment${comments.length === 1 ? '' : 's'}` : null,
  ].filter(Boolean);

  const copy = () => {
    void navigator.clipboard.writeText(toMarkdown(activity, repoPath)).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }).catch(() => undefined);
  };

  return (
    <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden">
      <div className="flex items-start gap-2.5 px-3.5 pt-4 pb-3">
        <OutcomeIcon outcome={activity.outcome} />
        <div className="flex-1 min-w-0 flex flex-col gap-0.5">
          <div className="text-[13px] font-semibold leading-5">{outcomeTitle(activity, name)}</div>
          <div className="text-text-muted leading-4">{facts.join(' · ')}</div>
          {shown.title && <div className="truncate text-text-muted leading-4" title={shown.title}>{shown.title} · {ago(activity.endedAt ?? activity.startedAt)}</div>}
        </div>
        {again && (
          <button type="button" onClick={() => void runAgain(again)} className={cn(buttonOutline, 'h-6 px-2 text-xs')} title="Same request, comments and model">
            <RefreshIcon size="xs" />
            Run again
          </button>
        )}
        <button type="button" onClick={copy} className={buttonIcon} aria-label="Copy as Markdown" title={copied ? 'Copied' : 'Copy as Markdown'}>
          {copied ? <CheckIcon size="sm" className="text-added" /> : <CopyIcon size="sm" />}
        </button>
      </div>

      {closing && (
        <div className="mx-3.5 mb-3 px-3.5 py-3 rounded-lg border border-border bg-bg-secondary text-[13px] leading-5 text-text">
          <MarkdownContent content={closing.text} />
        </div>
      )}

      {comments.length > 0 && (
        <div className="flex flex-col gap-1.5 mx-3.5 mb-3">
          {comments.slice(0, 5).map((comment) => (
            <button
              key={comment.id}
              type="button"
              disabled={!activity.ref}
              onClick={() => activity.ref && goToThread(repoPath, { ref: activity.ref, threadId: comment.id })}
              className="flex items-center gap-2 min-w-0 px-2.5 py-1.5 rounded-md border border-border-muted text-left hover:bg-hover cursor-pointer"
            >
              <CommentIcon size="sm" className="shrink-0 text-modified" />
              <span className="shrink-0 font-mono text-[11px] text-accent">{commentLabel(comment)}</span>
              <span className="truncate text-text-secondary">{firstLine(comment.body)}</span>
            </button>
          ))}
          <button type="button" className={cn(buttonClaudeSolid, 'self-start mt-1')} onClick={() => openRunResult(repoPath, activity.ref, comments.map((item) => item.id))}>
            Show {comments.length === 1 ? 'the comment' : `all ${comments.length} comments`}
          </button>
        </div>
      )}

      {steps.length > 0 && (
        <div className="border-t border-border-muted">
          <button
            type="button"
            onClick={() => setShowSteps(!showSteps)}
            aria-expanded={showSteps}
            className="flex items-center gap-1.5 w-full h-9 px-3.5 text-left font-medium text-text-secondary hover:text-text cursor-pointer"
          >
            <ChevronRightIcon size="xs" className={cn('transition-transform', showSteps && 'rotate-90')} />
            {showSteps ? 'Steps' : `Show how ${name} got there`}
            <span className="ml-auto font-normal text-text-muted">{tools} step{tools === 1 ? '' : 's'}</span>
          </button>
          {showSteps && (
            <div className="flex flex-col gap-3 px-3.5 pb-4">
              <Timeline items={steps} running={false} startedAt={activity.startedAt} now={Date.now()} repoPath={repoPath} runRef={activity.ref} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const MODE_ICONS: Record<AgentMode, typeof EyeIcon> = {
  review: EyeIcon,
  resolve: CheckCircleIcon,
  edit: PencilIcon,
  task: PencilIcon,
  ask: CommentIcon,
};

function HistoryList(props: { repoPath: string; currentKey: string | null }) {
  const { repoPath, currentKey } = props;
  const { data: chats, isLoading } = useRepoChats(repoPath);
  const live = useRunActivity((state) => state.byRepo[repoPath] ?? null);
  const liveRunning = live?.outcome === 'running' ? live.chatId : null;

  if (isLoading) {
    return <div className="flex-1 flex items-center justify-center"><Spinner className="text-text-muted" /></div>;
  }
  if (!chats || chats.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center px-8 text-center text-[13px] leading-5 text-text-muted">
        No agent runs in this project yet.
      </div>
    );
  }

  const groups: { day: string; chats: Chat[] }[] = [];
  for (const chat of chats) {
    const day = dayLabel(Date.parse(chat.createdAt));
    const last = groups[groups.length - 1];
    if (last?.day === day) {
      last.chats.push(chat);
    } else {
      groups.push({ day, chats: [chat] });
    }
  }

  return (
    <div className="flex-1 min-h-0 overflow-y-auto px-2 py-2">
      {groups.map((group) => (
        <Fragment key={group.day}>
          <div className="px-2 pt-2 pb-1 text-[11px] font-medium text-text-muted">{group.day}</div>
          {group.chats.map((chat) => (
            <HistoryRow key={chat.id} chat={chat} title={chatTitle(chat, repoPath)} current={chat.id === currentKey} running={chat.id === liveRunning} />
          ))}
        </Fragment>
      ))}
    </div>
  );
}

function dayLabel(at: number) {
  const date = new Date(at);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (date.toDateString() === today.toDateString()) {
    return 'Today';
  }
  if (date.toDateString() === yesterday.toDateString()) {
    return 'Yesterday';
  }
  return date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

function HistoryRow(props: { chat: Chat; title: string; current: boolean; running: boolean }) {
  const { chat, title, current, running } = props;
  const Icon = MODE_ICONS[chat.mode] ?? SparkleIcon;
  const startedAt = Date.parse(chat.createdAt);
  const took = Date.parse(chat.updatedAt) - startedAt;
  const time = new Date(startedAt).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });

  return (
    <button
      type="button"
      onClick={() => showRun(chat.id)}
      className={cn('flex items-start gap-2.5 w-full px-2 py-2 rounded-md text-left cursor-pointer', current ? 'bg-selected' : 'hover:bg-hover')}
    >
      <span className="flex items-center justify-center w-4 h-[18px] shrink-0 text-text-muted">
        {running ? <Spinner className="text-claude" /> : <Icon size="sm" />}
      </span>
      <span className="flex-1 min-w-0 flex flex-col gap-0.5">
        <span className="truncate leading-[18px] text-text">{title}</span>
        <span className="truncate text-text-muted">
          {agentMeta(chat.agentId).short} · {time}{running ? ' · running' : took >= 1000 ? ` · ${formatDuration(took)}` : ''}
        </span>
      </span>
    </button>
  );
}

/** Hover card on the status pill: model, progress, the latest step and the comments so far. */
export function ActivityPeek(props: { onOpen: () => void }) {
  const { onOpen } = props;
  const repoPath = useRepoPath();
  const activity = useRunActivity((state) => state.byRepo[repoPath] ?? null);
  const { data: catalog } = useModelCatalog(activity?.agentId ?? 'claude');
  if (!activity) {
    return null;
  }
  const comments = activity.items.filter((item): item is CommentItem => item.kind === 'comment');
  const done = activity.plan.filter((entry) => entry.status === 'completed').length;
  const step = activity.plan.find((entry) => entry.status === 'in_progress');
  const last = activity.items[activity.items.length - 1];
  const lastTool = [...activity.items].reverse().find((item): item is ToolItem => item.kind === 'tool');
  const thought = last?.kind === 'thought' ? last.text.trim() : null;
  const lastLabel = lastTool ? describeTool(lastTool, repoPath) : null;

  return (
    <div className="flex flex-col text-xs">
      <div className="flex flex-col gap-2 px-3.5 pt-3 pb-3">
        <div className="flex items-center gap-2">
          <span className="font-semibold">{activity.model ? runModelLabel(catalog, activity.model) : agentMeta(activity.agentId).short}</span>
          <span className="ml-auto text-text-secondary">{comments.length} comment{comments.length === 1 ? '' : 's'}</span>
        </div>
        {activity.plan.length > 0 && (
          <>
            <div className="text-text-secondary truncate">
              Step {Math.min(done + 1, activity.plan.length)} of {activity.plan.length}{step ? `: ${step.content}` : ''}
            </div>
            <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${activity.plan.length}, minmax(0, 1fr))` }}>
              {activity.plan.map((entry, index) => (
                <span key={index} className={cn('h-1 rounded-full', entry.status === 'completed' ? 'bg-added' : entry.status === 'in_progress' ? 'bg-claude' : 'bg-fill')} />
              ))}
            </div>
          </>
        )}
      </div>
      {(thought || lastTool) && (
        <div className="flex flex-col gap-1.5 px-3.5 py-3 border-t border-border-muted bg-bg-secondary">
          <div className="text-[11px] font-medium text-text-muted">Now</div>
          {thought && <div className="line-clamp-3 italic leading-[18px] text-text-secondary">{thought.length > 220 ? `…${thought.slice(-220)}` : thought}</div>}
          {lastTool && lastLabel && (
            <div className="flex items-center gap-2 min-w-0">
              <ToolGlyph tool={lastTool} label={lastLabel} />
              <span className="shrink-0 text-text-secondary">{lastLabel.verb}</span>
              {lastLabel.subject && <span className="truncate font-mono text-[11.5px]">{lastLabel.subject}</span>}
            </div>
          )}
        </div>
      )}
      {comments.length > 0 && (
        <div className="flex flex-col gap-1.5 px-3.5 py-3 border-t border-border-muted">
          <div className="text-[11px] font-medium text-text-muted">Comments so far</div>
          {comments.slice(-4).map((comment) => (
            <div key={comment.id} className="flex items-center gap-2 min-w-0">
              {activity.ref && (
                <button type="button" onClick={() => goToThread(repoPath, { ref: activity.ref!, threadId: comment.id })} className="shrink-0 font-mono text-[11px] text-accent hover:underline cursor-pointer">
                  {commentLabel(comment)}
                </button>
              )}
              <span className="truncate text-text-secondary">{firstLine(comment.body)}</span>
            </div>
          ))}
        </div>
      )}
      <button
        type="button"
        onClick={() => {
          openActivity();
          onOpen();
        }}
        className="flex items-center h-9 px-3.5 border-t border-border-muted font-medium text-left hover:bg-hover cursor-pointer"
      >
        Open activity panel
      </button>
    </div>
  );
}

/** Marks the file the agent is reading right now in the file list. */
export function AgentReadingDot(props: { path: string }) {
  const { path } = props;
  const repoPath = useRepoPath();
  const reading = useRunActivity((state) => {
    const activity = state.byRepo[repoPath];
    return !!activity && activity.outcome === 'running' && currentFile(activity, repoPath) === path;
  });
  if (!reading) {
    return null;
  }
  const name = agentMeta(useRunActivity.getState().byRepo[repoPath]?.agentId ?? 'claude').short;
  return <span className="shrink-0 w-1.5 h-1.5 rounded-full bg-claude animate-pulse" title={`${name} is reading this file`} aria-label={`${name} is reading this file`} />;
}

