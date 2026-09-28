import { useMemo, useState, type CSSProperties } from 'react';
import { MultiFileDiff } from '@pierre/diffs/react';
import * as api from '@/lib/api';
import { cn } from '@/lib/cn';
import type { AgentAction, ContextChip, PlanEntry } from '@/lib/types';
import { revealLocation } from '@/features/workspace/agent-bus';
import { useResolvedTheme } from '@/lib/theme';
import { DIFF_THEMES, SURFACE_TOKEN_CSS } from '@/components/diff-surface/theme';
import {
  AlertIcon,
  BrainIcon,
  CheckCircleIcon,
  CheckIcon,
  ChevronRightIcon,
  CommentIcon,
  ConversationIcon,
  FileIcon,
  GlobeIcon,
  LightbulbIcon,
  ListChecksIcon,
  PencilIcon,
  PermissionIcon,
  SearchIcon,
  SparklesIcon,
  SummaryIcon,
  TerminalIcon,
  ToolIcon,
  TrashIcon,
  XCircleIcon,
  XIcon,
  type IconComponent,
} from '@/components/ui/icon';
import { Markdown } from '@/components/markdown/Markdown';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import type { RunMeta, TimelineItem } from './timeline';

type ToolItem = Extract<TimelineItem, { kind: 'tool' }>;

export function chipLabel(chip: ContextChip) {
  const name = chip.filePath.split('/').pop() ?? chip.filePath;
  if (!chip.startLine) {
    return name;
  }
  if (chip.endLine && chip.endLine !== chip.startLine) {
    return `${name}:${chip.startLine}-${chip.endLine}`;
  }
  return `${name}:${chip.startLine}`;
}

export function ContextChipView(props: { chip: ContextChip; onRemove?: () => void; onClick?: () => void }) {
  const { chip, onRemove, onClick } = props;
  return (
    <span
      title={chip.filePath}
      className="inline-flex h-6 max-w-full items-center gap-1 rounded-md border border-border bg-raised pr-1 pl-1.5 text-2xs text-fg-muted"
    >
      <FileIcon size={12} className="shrink-0 text-fg-subtle" />
      <button
        type="button"
        onClick={onClick}
        className="cursor-default truncate font-mono enabled:hover:text-accent"
        disabled={!onClick}
      >
        {chipLabel(chip)}
      </button>
      {chip.side === 'old' && <span className="text-removed">old</span>}
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          className="cursor-default rounded-sm p-0.5 text-fg-subtle hover:bg-hover hover:text-fg"
          aria-label="Remove"
        >
          <XIcon size={12} />
        </button>
      )}
    </span>
  );
}

export function parseLocation(location: string, repoPath: string) {
  let path = location;
  let line: number | null = null;
  const match = /^(.*?):(\d+)(?::\d+)?$/.exec(location);
  if (match) {
    path = match[1];
    line = Number(match[2]);
  }
  return { path: relativePath(path, repoPath), line };
}

export function relativePath(path: string, repoPath: string) {
  const root = repoPath.endsWith('/') ? repoPath : `${repoPath}/`;
  if (path.startsWith(root)) {
    return path.slice(root.length);
  }
  return path;
}

export function openLocation(repoPath: string, path: string, line: number | null) {
  if (revealLocation(path, line)) {
    return;
  }
  api.openInEditor(repoPath, path, line).catch(() => undefined);
}

function toolIcon(kind: string): IconComponent {
  switch (kind) {
    case 'read':
      return FileIcon;
    case 'edit':
      return PencilIcon;
    case 'delete':
      return TrashIcon;
    case 'search':
      return SearchIcon;
    case 'execute':
      return TerminalIcon;
    case 'fetch':
      return GlobeIcon;
    case 'think':
      return BrainIcon;
    case 'comment':
      return CommentIcon;
    default:
      return ToolIcon;
  }
}

interface HumanTool {
  title: string;
  kind: string;
}

const DIFFITY_TOOLS: Record<string, { done: string; running: string; kind: string }> = {
  get_diff: { done: 'Read the diff', running: 'Reading the diff', kind: 'read' },
  list_threads: { done: 'Listed comments', running: 'Listing comments', kind: 'read' },
  add_comment: { done: 'Added comment', running: 'Adding comment', kind: 'comment' },
  add_general_comment: { done: 'Added a general comment', running: 'Adding a general comment', kind: 'comment' },
  reply: { done: 'Replied to thread', running: 'Replying to thread', kind: 'comment' },
  resolve: { done: 'Resolved thread', running: 'Resolving thread', kind: 'comment' },
  dismiss: { done: 'Dismissed thread', running: 'Dismissing thread', kind: 'comment' },
};

/** Turns raw ACP tool titles ("mcp__diffity__add_comment src/a.ts:3", "Read /abs/path") into short labels. */
export function humanizeTool(item: ToolItem, repoPath: string): HumanTool {
  const root = repoPath.endsWith('/') ? repoPath : `${repoPath}/`;
  const raw = item.title.split(root).join('').replace(/`/g, '').trim();
  const match = /^(?:mcp__diffity__|diffity__|diffity\.)?([a-z_]+)\b\s*(.*)$/.exec(raw);
  const known = match ? DIFFITY_TOOLS[match[1]] : undefined;
  if (!match || !known) {
    return { title: raw || 'Tool call', kind: item.toolKind };
  }
  const running = item.status === 'in_progress' || item.status === 'pending';
  const verb = running ? known.running : known.done;
  const firstLocation = item.locations[0] ? parseLocation(item.locations[0], repoPath) : null;
  if (match[1] === 'add_comment') {
    const target = firstLocation
      ? `${firstLocation.path.split('/').pop()}${firstLocation.line ? `:${firstLocation.line}` : ''}`
      : (match[2].split('/').pop() ?? '');
    return { title: target ? `${verb} on ${target}` : verb, kind: known.kind };
  }
  return { title: verb, kind: known.kind };
}

function ToolStatus(props: { status: string }) {
  const { status } = props;
  if (status === 'completed') {
    return <CheckIcon size={12} className="text-success" />;
  }
  if (status === 'failed') {
    return <XCircleIcon size={12} className="text-danger" />;
  }
  if (status === 'pending') {
    return <PendingRing size={12} />;
  }
  return <Spinner size={12} className="text-accent" />;
}

function ToolRow(props: { item: ToolItem; repoPath: string }) {
  const { item, repoPath } = props;
  const human = humanizeTool(item, repoPath);
  const Icon = toolIcon(human.kind);
  const location = item.locations[0] ? parseLocation(item.locations[0], repoPath) : null;
  const failed = item.status === 'failed';
  return (
    <div className="group/tool flex h-6 min-w-0 items-center gap-2 text-xs">
      <Icon size={12} className={cn('shrink-0', failed ? 'text-danger' : 'text-fg-subtle')} />
      <span className={cn('min-w-0 truncate', failed ? 'text-danger' : 'text-fg-muted')} title={item.title}>
        {human.title}
      </span>
      {location && human.kind !== 'comment' && !human.title.includes(location.path) && (
        <button
          type="button"
          title={item.locations[0]}
          onClick={() => openLocation(repoPath, location.path, location.line)}
          className="min-w-0 shrink cursor-default truncate font-mono text-2xs text-fg-subtle hover:text-accent"
        >
          {location.path}
          {location.line ? `:${location.line}` : ''}
        </button>
      )}
      {location && (human.kind === 'comment' || human.title.includes(location.path)) && (
        <button
          type="button"
          title={`Show ${item.locations[0]}`}
          onClick={() => openLocation(repoPath, location.path, location.line)}
          className="shrink-0 cursor-default text-2xs text-fg-subtle opacity-0 group-hover/tool:opacity-100 hover:text-accent"
        >
          Show
        </button>
      )}
      <span className="ml-auto flex shrink-0 pl-1">
        <ToolStatus status={item.status} />
      </span>
    </div>
  );
}

/** A run of consecutive tool calls. One call renders as a plain row; more collapse into "N steps". */
export function ToolGroup(props: { items: ToolItem[]; repoPath: string; live: boolean }) {
  const { items, repoPath, live } = props;
  const [open, setOpen] = useState(false);

  if (items.length === 1) {
    return <ToolRow item={items[0]} repoPath={repoPath} />;
  }

  const failed = items.filter((item) => item.status === 'failed').length;
  const running = items.find((item) => item.status === 'in_progress' || item.status === 'pending');
  const current = running ?? (live ? items[items.length - 1] : null);

  return (
    <div className="text-xs">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="group/steps flex h-6 w-full min-w-0 cursor-default items-center gap-2 text-left text-fg-subtle hover:text-fg-muted"
      >
        <ChevronRightIcon size={12} className={cn('shrink-0 transition-transform', open && 'rotate-90')} />
        <span className="shrink-0 font-medium text-fg-muted">{items.length} steps</span>
        {failed > 0 && <span className="shrink-0 text-danger">· {failed} failed</span>}
        {current && !open && (
          <span className="min-w-0 truncate">· {humanizeTool(current, repoPath).title}</span>
        )}
        <span className="ml-auto flex shrink-0 pl-1">
          {running ? <Spinner size={12} className="text-accent" /> : <CheckIcon size={12} className={failed ? 'text-fg-subtle' : 'text-success'} />}
        </span>
      </button>
      {open && (
        <div className="mt-0.5 ml-1.5 border-l border-border pl-3">
          {items.map((item) => (
            <ToolRow key={item.id} item={item} repoPath={repoPath} />
          ))}
        </div>
      )}
    </div>
  );
}

export function ThoughtBlock(props: { text: string; live: boolean }) {
  const { text, live } = props;
  const [open, setOpen] = useState(false);
  return (
    <div className="text-xs">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="flex h-6 cursor-default items-center gap-2 text-fg-subtle hover:text-fg-muted"
      >
        <ChevronRightIcon size={12} className={cn('shrink-0 transition-transform', open && 'rotate-90')} />
        <BrainIcon size={12} className="shrink-0" />
        <span className={cn(live && 'animate-pulse')}>{live ? 'Thinking…' : 'Thought process'}</span>
      </button>
      {open && (
        <div className="selectable mt-0.5 mb-1 ml-1.5 border-l border-border pl-3 leading-relaxed whitespace-pre-wrap text-fg-subtle">
          {text}
        </div>
      )}
    </div>
  );
}

function PlanStatus(props: { status: string; live: boolean }) {
  const { status, live } = props;
  if (status === 'completed') {
    return <CheckCircleIcon size={14} className="text-success" />;
  }
  if ((status === 'in_progress' || status === 'inProgress') && live) {
    return <Spinner size={14} className="text-accent" />;
  }
  return <PendingRing size={14} />;
}

function PendingRing(props: { size: 12 | 14 }) {
  return (
    <span
      aria-hidden
      className={cn('m-px inline-block shrink-0 rounded-full border-[1.5px] border-border-strong', props.size === 12 ? 'size-2.5' : 'size-3')}
    />
  );
}

export function PlanChecklist(props: { entries: PlanEntry[]; live: boolean }) {
  const { entries, live } = props;
  const done = entries.filter((entry) => entry.status === 'completed').length;
  const percent = entries.length === 0 ? 0 : Math.round((done / entries.length) * 100);
  return (
    <div className="overflow-hidden rounded-md border border-border bg-raised">
      <div className="flex h-8 items-center gap-2 border-b border-border-subtle px-2.5 text-xs">
        <ListChecksIcon size={14} className="text-fg-subtle" />
        <span className="font-medium text-fg">Plan</span>
        <span className="ml-auto text-2xs text-fg-subtle tabular-nums">
          {done} of {entries.length}
        </span>
        <span className="h-1 w-12 overflow-hidden rounded-full bg-muted">
          <span className="block h-full rounded-full bg-success transition-[width]" style={{ width: `${percent}%` }} />
        </span>
      </div>
      <ul className="space-y-1 px-2.5 py-2">
        {entries.map((entry, index) => (
          <li key={index} className="flex items-start gap-2 text-xs leading-5">
            <span className="mt-[3px] flex shrink-0">
              <PlanStatus status={entry.status} live={live} />
            </span>
            <span
              className={cn(
                entry.status === 'completed' ? 'text-fg-subtle' : 'text-fg',
                (entry.status === 'in_progress' || entry.status === 'inProgress') && 'font-medium',
              )}
            >
              {entry.content}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function PermissionDiffPreview(props: { path: string; oldText: string | null; newText: string }) {
  const { path, oldText, newText } = props;
  const themeType = useResolvedTheme();
  const files = useMemo(() => {
    const newFile = { name: path, contents: newText };
    if (oldText === null) {
      return { oldFile: null, newFile } as const;
    }
    return { oldFile: { name: path, contents: oldText }, newFile } as const;
  }, [path, oldText, newText]);

  return (
    <div className="max-h-[300px] overflow-auto border-y border-border bg-canvas text-2xs">
      <MultiFileDiff
        {...files}
        disableWorkerPool
        style={{ '--diffs-font-size': '11px', '--diffs-line-height': '17px' } as CSSProperties}
        options={{
          diffStyle: 'unified',
          themeType,
          theme: DIFF_THEMES,
          unsafeCSS: SURFACE_TOKEN_CSS,
          overflow: 'wrap',
          hunkSeparators: 'line-info-basic',
          disableFileHeader: true,
        }}
      />
    </div>
  );
}

function isAllow(kind: string) {
  return kind.startsWith('allow');
}

function isReject(kind: string) {
  return kind.startsWith('reject') || kind === 'deny';
}

function lowerFirst(text: string) {
  return text.charAt(0).toLowerCase() + text.slice(1);
}

function permissionHeadline(item: Extract<TimelineItem, { kind: 'permission' }>, agentName: string, repoPath: string) {
  const root = repoPath.endsWith('/') ? repoPath : `${repoPath}/`;
  const title = item.title.split(root).join('').replace(/`/g, '').trim();
  if (item.diff) {
    const path = relativePath(item.diff.path, repoPath);
    return { verb: item.diff.oldText === null ? 'create' : 'edit', target: path };
  }
  const match = /^(edit|write|delete|move|run|execute|fetch|read)\s+(.+)$/i.exec(title);
  if (match) {
    return { verb: lowerFirst(match[1]) === 'write' ? 'write' : lowerFirst(match[1]), target: match[2] };
  }
  if (!title) {
    return { verb: 'continue', target: '' };
  }
  return { verb: 'run', target: title || `${agentName} tool` };
}

export function PermissionCard(props: {
  item: Extract<TimelineItem, { kind: 'permission' }>;
  agentName: string;
  repoPath: string;
  onRespond: (optionId: string | null) => void;
}) {
  const { item, agentName, repoPath, onRespond } = props;
  const pending = item.state === 'pending';
  const chosen = item.options.find((option) => option.id === item.chosen);
  const headline = permissionHeadline(item, agentName, repoPath);
  const shortName = agentName.replace(/ Code$/, '');
  const allowOptions = item.options.filter((option) => !isReject(option.kind));
  const rejectOption = item.options.find((option) => isReject(option.kind));

  if (!pending) {
    const allowed = item.state === 'answered' && (!chosen || isAllow(chosen.kind));
    const always = chosen?.kind === 'allow_always' || chosen?.kind === 'allowAlways';
    const label = item.state === 'expired' ? 'Expired' : allowed ? (always ? 'Always allowed' : 'Allowed') : 'Denied';
    return (
      <div className="flex h-6 min-w-0 items-center gap-2 text-xs">
        {allowed ? (
          <CheckIcon size={12} className="shrink-0 text-success" />
        ) : (
          <XCircleIcon size={12} className={cn('shrink-0', item.state === 'expired' ? 'text-fg-subtle' : 'text-danger')} />
        )}
        <span className="shrink-0 text-fg-muted">{label}</span>
        <span className="min-w-0 truncate font-mono text-2xs text-fg-subtle" title={item.title}>
          {headline.verb} {headline.target}
        </span>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-warning/50 bg-raised">
      <div className="flex items-start gap-2.5 px-3 py-2.5">
        <span className="mt-px flex size-6 shrink-0 items-center justify-center rounded-md bg-warning/12 text-warning">
          <PermissionIcon size={14} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium text-fg">
            {shortName} wants to {headline.verb}
            {headline.target && (
              <>
                {' '}
                <span className="font-mono text-xs break-all">{headline.target}</span>
              </>
            )}
          </div>
          <div className="mt-0.5 text-2xs text-fg-subtle">
            {item.diff ? 'Review the change below before allowing it.' : 'This action needs your approval.'}
            {item.diff?.oldText === null && (
              <Badge tone="success" className="ml-1.5">
                New file
              </Badge>
            )}
          </div>
        </div>
      </div>
      {item.diff && <PermissionDiffPreview path={item.diff.path} oldText={item.diff.oldText} newText={item.diff.newText} />}
      <div className={cn('flex flex-wrap items-center gap-1.5 bg-panel px-3 py-2', !item.diff && 'border-t border-border')}>
        {allowOptions.map((option) => (
          <Button
            key={option.id}
            size="sm"
            variant={option.kind === 'allow_once' || option.kind === 'allowOnce' ? 'primary' : 'secondary'}
            onClick={() => onRespond(option.id)}
          >
            {option.name}
          </Button>
        ))}
        <Button
          size="sm"
          variant="ghost"
          className="ml-auto hover:text-danger"
          onClick={() => onRespond(rejectOption?.id ?? null)}
        >
          {rejectOption?.name ?? 'Deny'}
        </Button>
      </div>
    </div>
  );
}

export function UserBubble(props: { item: Extract<TimelineItem, { kind: 'user' }>; repoPath: string }) {
  const { item, repoPath } = props;
  return (
    <div className="flex justify-end pl-8">
      <div className="max-w-full min-w-0 rounded-lg border border-accent/20 bg-accent-soft px-3 py-2">
        {item.context.length > 0 && (
          <div className="mb-1.5 flex flex-wrap gap-1">
            {item.context.map((chip, index) => (
              <ContextChipView
                key={index}
                chip={chip}
                onClick={() => openLocation(repoPath, chip.filePath, chip.startLine ?? null)}
              />
            ))}
          </div>
        )}
        {item.text && <div className="selectable text-sm break-words whitespace-pre-wrap text-fg">{item.text}</div>}
      </div>
    </div>
  );
}

function runIcon(kind: AgentAction['kind']): IconComponent {
  switch (kind) {
    case 'review':
      return SparklesIcon;
    case 'summarize':
      return SummaryIcon;
    case 'explain':
      return LightbulbIcon;
    case 'resolve':
      return CheckCircleIcon;
    case 'thread':
      return CommentIcon;
    case 'reviewFeedback':
      return ConversationIcon;
    case 'chat':
      return SparklesIcon;
  }
}

/** Header for a run started by an action (Review, Resolve, `@claude` thread…) instead of a typed message. */
export function RunHeader(props: { run: RunMeta; context: ContextChip[]; repoPath: string }) {
  const { run, context, repoPath } = props;
  const Icon = runIcon(run.kind);
  return (
    <div className="flex items-center gap-2 pt-1">
      <span className="flex size-6 shrink-0 items-center justify-center rounded-md border border-accent/20 bg-accent-soft text-accent">
        <Icon size={12} />
      </span>
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-1.5 gap-y-1">
        <span className="truncate text-xs font-semibold text-fg">{run.title}</span>
        {run.detail && <span className="truncate font-mono text-2xs text-fg-subtle">{run.detail}</span>}
        {context.map((chip, index) => (
          <ContextChipView
            key={index}
            chip={chip}
            onClick={() => openLocation(repoPath, chip.filePath, chip.startLine ?? null)}
          />
        ))}
      </div>
    </div>
  );
}

export function AgentText(props: { text: string }) {
  return <Markdown compact>{props.text}</Markdown>;
}

export function NoteRow(props: { text: string }) {
  return (
    <div className="flex h-6 items-center gap-2 text-xs text-success">
      <CommentIcon size={12} className="shrink-0" />
      <span className="font-medium">{props.text}</span>
    </div>
  );
}

export function ErrorRow(props: { message: string }) {
  return (
    <div className="flex items-start gap-2 rounded-md border border-danger/40 bg-danger/10 px-2.5 py-2 text-xs text-danger">
      <AlertIcon size={14} className="shrink-0" />
      <div className="selectable min-w-0 break-words whitespace-pre-wrap">{props.message}</div>
    </div>
  );
}

export function DoneRow(props: { stopReason: string }) {
  const { stopReason } = props;
  const label =
    stopReason === 'cancelled'
      ? 'Stopped'
      : stopReason === 'max_tokens' || stopReason === 'maxTokens'
        ? 'Stopped: output limit reached'
        : stopReason === 'refusal'
          ? 'Claude declined to continue'
          : null;
  if (!label) {
    return null;
  }
  return (
    <div className="flex items-center gap-2 text-2xs text-fg-subtle">
      <span className="h-px flex-1 bg-border" />
      {label}
      <span className="h-px flex-1 bg-border" />
    </div>
  );
}

export function StreamingIndicator(props: { agentName: string }) {
  return (
    <div className="flex h-6 items-center gap-2 text-xs text-fg-subtle">
      <SparklesIcon size={12} className="animate-pulse text-accent" />
      <span>{props.agentName} is working…</span>
    </div>
  );
}
