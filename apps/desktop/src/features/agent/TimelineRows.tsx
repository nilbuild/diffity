import { useMemo, useState, type CSSProperties } from 'react';
import { MultiFileDiff } from '@pierre/diffs/react';
import * as api from '@/lib/api';
import { cn } from '@/lib/cn';
import type { ContextChip, PlanEntry } from '@/lib/types';
import { revealLocation } from '@/features/workspace/agent-bus';
import { useResolvedTheme } from '@/lib/theme';
import {
  IconAlert,
  IconBrain,
  IconCheck,
  IconChevronDown,
  IconChevronRight,
  IconCircle,
  IconDot,
  IconFile,
  IconGlobe,
  IconMessage,
  IconPencil,
  IconSearch,
  IconSparkles,
  IconTerminal,
  IconTool,
  IconTrash,
  IconX,
} from './icons';
import { Markdown } from './Markdown';
import { Button, Spinner } from './primitives';
import type { TimelineItem } from './timeline';

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
      className="inline-flex max-w-full items-center gap-1 rounded-md border border-border bg-bg-elevated py-0.5 pr-1 pl-1.5 text-[11px] text-fg-muted"
    >
      <IconFile size={11} className="shrink-0" />
      <button type="button" onClick={onClick} className="truncate font-mono hover:text-fg" disabled={!onClick}>
        {chipLabel(chip)}
      </button>
      {chip.side === 'old' && <span className="text-danger">old</span>}
      {onRemove && (
        <button type="button" onClick={onRemove} className="rounded p-0.5 hover:bg-bg-muted hover:text-fg" aria-label="Remove">
          <IconX size={10} />
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
  const root = repoPath.endsWith('/') ? repoPath : `${repoPath}/`;
  if (path.startsWith(root)) {
    path = path.slice(root.length);
  }
  return { path, line };
}

export function openLocation(repoPath: string, path: string, line: number | null) {
  if (revealLocation(path, line)) {
    return;
  }
  api.openInEditor(repoPath, path, line).catch(() => undefined);
}

function toolIcon(kind: string) {
  switch (kind) {
    case 'read':
      return IconFile;
    case 'edit':
      return IconPencil;
    case 'delete':
      return IconTrash;
    case 'search':
      return IconSearch;
    case 'execute':
      return IconTerminal;
    case 'fetch':
      return IconGlobe;
    case 'think':
      return IconBrain;
    default:
      return IconTool;
  }
}

function StatusIcon(props: { status: string }) {
  const { status } = props;
  if (status === 'completed') {
    return <IconCheck size={12} className="text-success" />;
  }
  if (status === 'failed') {
    return <IconX size={12} className="text-danger" />;
  }
  if (status === 'pending') {
    return <IconCircle size={12} className="text-fg-subtle" />;
  }
  return <Spinner size={12} className="text-accent" />;
}

export function ToolCallRow(props: { item: Extract<TimelineItem, { kind: 'tool' }>; repoPath: string }) {
  const { item, repoPath } = props;
  const Icon = toolIcon(item.toolKind);
  return (
    <div className="rounded-md border border-border bg-bg-elevated px-2 py-1.5">
      <div className="flex items-center gap-2 text-xs">
        <Icon size={12} className="shrink-0 text-fg-subtle" />
        <span className="min-w-0 flex-1 truncate text-fg-muted" title={item.title}>
          {item.title}
        </span>
        <StatusIcon status={item.status} />
      </div>
      {item.locations.length > 0 && (
        <div className="mt-1 flex flex-wrap gap-1 pl-5">
          {item.locations.slice(0, 6).map((location) => {
            const parsed = parseLocation(location, repoPath);
            return (
              <button
                key={location}
                type="button"
                onClick={() => openLocation(repoPath, parsed.path, parsed.line)}
                className="max-w-full truncate rounded bg-bg-muted px-1.5 py-px font-mono text-[10.5px] text-fg-muted hover:text-accent"
                title={location}
              >
                {parsed.path}
                {parsed.line ? `:${parsed.line}` : ''}
              </button>
            );
          })}
          {item.locations.length > 6 && (
            <span className="text-[10.5px] text-fg-subtle">+{item.locations.length - 6} more</span>
          )}
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
        onClick={() => setOpen((value) => !value)}
        className="flex items-center gap-1.5 text-fg-subtle hover:text-fg-muted"
      >
        {open ? <IconChevronDown size={12} /> : <IconChevronRight size={12} />}
        <IconBrain size={12} />
        <span className={cn(live && 'animate-pulse')}>{live ? 'Thinking…' : 'Thought'}</span>
      </button>
      {open && (
        <div className="selectable mt-1 ml-[18px] border-l border-border pl-3 whitespace-pre-wrap text-fg-subtle italic">
          {text}
        </div>
      )}
    </div>
  );
}

function planIcon(status: string) {
  if (status === 'completed') {
    return <IconCheck size={12} className="text-success" />;
  }
  if (status === 'in_progress' || status === 'inProgress') {
    return <IconDot size={12} className="text-accent" />;
  }
  return <IconCircle size={12} className="text-fg-subtle" />;
}

export function PlanChecklist(props: { entries: PlanEntry[] }) {
  const { entries } = props;
  const done = entries.filter((entry) => entry.status === 'completed').length;
  return (
    <div className="rounded-md border border-border bg-bg-elevated p-2">
      <div className="mb-1.5 flex items-center justify-between text-[11px] font-medium text-fg-muted">
        <span>Plan</span>
        <span className="text-fg-subtle">
          {done}/{entries.length}
        </span>
      </div>
      <ul className="space-y-1">
        {entries.map((entry, index) => (
          <li key={index} className="flex items-start gap-2 text-xs">
            <span className="mt-0.5">{planIcon(entry.status)}</span>
            <span className={cn(entry.status === 'completed' && 'text-fg-subtle line-through')}>{entry.content}</span>
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
    <div className="max-h-[320px] overflow-auto rounded border border-border text-[11px]">
      <MultiFileDiff
        {...files}
        disableWorkerPool
        style={{ '--diffs-font-size': '11px', '--diffs-line-height': '17px' } as CSSProperties}
        options={{
          diffStyle: 'unified',
          themeType,
          theme: { dark: 'pierre-dark', light: 'pierre-light' },
          overflow: 'wrap',
          hunkSeparators: 'line-info',
        }}
      />
    </div>
  );
}

function optionVariant(kind: string) {
  if (kind === 'allow_once' || kind === 'allowOnce') {
    return 'primary' as const;
  }
  if (kind.startsWith('reject') || kind === 'deny') {
    return 'ghost' as const;
  }
  return 'secondary' as const;
}

export function PermissionCard(props: {
  item: Extract<TimelineItem, { kind: 'permission' }>;
  onRespond: (optionId: string | null) => void;
}) {
  const { item, onRespond } = props;
  const pending = item.state === 'pending';
  const chosen = item.options.find((option) => option.id === item.chosen);
  const hasReject = item.options.some((option) => option.kind.startsWith('reject'));

  return (
    <div
      className={cn(
        'overflow-hidden rounded-lg border bg-bg-elevated',
        pending ? 'border-warning/60 shadow-sm' : 'border-border opacity-80',
      )}
    >
      <div className="flex items-center gap-2 border-b border-border px-2.5 py-1.5 text-xs">
        <IconAlert size={12} className={pending ? 'text-warning' : 'text-fg-subtle'} />
        <span className="min-w-0 flex-1 truncate font-medium" title={item.title}>
          {item.title}
        </span>
        {item.diff && <span className="truncate font-mono text-[10.5px] text-fg-subtle">{item.diff.path}</span>}
      </div>
      {item.diff && (
        <div className="p-2">
          <PermissionDiffPreview path={item.diff.path} oldText={item.diff.oldText} newText={item.diff.newText} />
        </div>
      )}
      <div className="flex flex-wrap items-center gap-1.5 px-2.5 py-2">
        {pending &&
          item.options.map((option) => (
            <Button key={option.id} size="xs" variant={optionVariant(option.kind)} onClick={() => onRespond(option.id)}>
              {option.name}
            </Button>
          ))}
        {pending && !hasReject && (
          <Button size="xs" variant="ghost" onClick={() => onRespond(null)}>
            Deny
          </Button>
        )}
        {item.state === 'answered' && (
          <span className="text-[11px] text-success">
            <IconCheck size={11} className="mr-1 inline" />
            {chosen?.name ?? 'Allowed'}
          </span>
        )}
        {item.state === 'denied' && <span className="text-[11px] text-danger">Denied</span>}
        {item.state === 'expired' && <span className="text-[11px] text-fg-subtle">No longer pending</span>}
      </div>
    </div>
  );
}

export function UserBubble(props: {
  item: Extract<TimelineItem, { kind: 'user' }>;
  repoPath: string;
}) {
  const { item, repoPath } = props;
  return (
    <div className="ml-6 rounded-lg bg-accent-subtle px-3 py-2">
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
      {item.text ? (
        <div className="selectable text-[13px] whitespace-pre-wrap">{item.text}</div>
      ) : (
        <div className="text-xs text-fg-subtle italic">(no message)</div>
      )}
    </div>
  );
}

export function AgentText(props: { text: string }) {
  return <Markdown>{props.text}</Markdown>;
}

export function NoteRow(props: { text: string }) {
  return (
    <div className="flex items-center gap-2 rounded-md bg-success/10 px-2.5 py-1.5 text-xs text-success">
      <IconMessage size={12} />
      {props.text}
    </div>
  );
}

export function ErrorRow(props: { message: string }) {
  return (
    <div className="flex items-start gap-2 rounded-md border border-danger/40 bg-danger/10 px-2.5 py-2 text-xs text-danger">
      <IconAlert size={12} className="mt-0.5 shrink-0" />
      <div className="selectable min-w-0 whitespace-pre-wrap">{props.message}</div>
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
          ? 'The agent declined to continue'
          : null;
  if (!label) {
    return null;
  }
  return (
    <div className="flex items-center gap-2 text-[11px] text-fg-subtle">
      <span className="h-px flex-1 bg-border" />
      {label}
      <span className="h-px flex-1 bg-border" />
    </div>
  );
}

export function StreamingIndicator() {
  return (
    <div className="flex items-center gap-2 text-xs text-fg-subtle">
      <IconSparkles size={12} className="animate-pulse text-accent" />
      Working…
    </div>
  );
}
