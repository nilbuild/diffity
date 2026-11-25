import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router';
import { cn } from '../../lib/cn';
import { TREE_REF, type ContextChip } from '../../lib/types';
import { getFilePath } from '../../lib/diff-utils';
import { diffOptions } from '../../queries/diff';
import { treePathsOptions } from '../../queries/tree';
import { modKey } from '../../lib/platform';
import { MentionTextarea } from '../../components/comments/mention-textarea';
import { buttonIcon, buttonOutline } from '../../components/ui/button-styles';
import { ArrowUpIcon, CommentIcon, GitBranchIcon, HistoryIcon, PencilIcon, StopIcon } from '../../components/ui/icon';
import { Spinner } from '../../components/icons/spinner';
import { plural } from '../review/review-candidates';
import { agentMeta } from './agents';
import { clearDraft, draftKey, useDraft } from './agent-drafts';
import { showApprovals, useWaitingApprovals } from './claude-approval-modal';
import { canSteer, commentOf, runViewLabel, stopRun, useClaude, useRunInTheWay, useRunningRuns, waitLabel, type ClaudeRun } from './claude-runner';
import { messageToEdit, sendChatMessage } from './chat-send';
import { ChipTag } from './chat-stream';
import { removeChip, setChips, setEditing, useChips, useComposer, useEditing, type Editing } from './composer-state';
import { useEditTarget, type EditTarget } from './edit-target';
import { sameView, viewKey } from './conversation';
import { ModelPicker } from './model-picker';
import { useRunPick, writeRepoPick, type RunPick } from './model-setting';
import { setCardSlot, toggleClaudeCard, usePanel, type ClaudeCard } from './panel-store';
import { KeyLabel } from '../../components/ui/key-label';

/** The file open in the file browser, which a message there is about unless it says otherwise. */
function useOpenFile(viewRef: string): string | null {
  const [params] = useSearchParams();
  if (viewRef !== TREE_REF || params.get('type') !== 'file') {
    return null;
  }
  return params.get('path') || null;
}

/** About ten lines; longer messages scroll. */
const GROW_TO = 216;

/** Files @ offers: the view's changed files first, then the rest of the checked-out code. */
function useMentionFiles(viewRef: string): string[] {
  const { data: diff } = useQuery({ ...diffOptions(false, viewRef), staleTime: 30_000, enabled: viewRef !== TREE_REF });
  const { data: tree } = useQuery(treePathsOptions());
  return useMemo(() => {
    const changed = (diff?.files ?? []).map(getFilePath);
    const seen = new Set(changed);
    return [...changed, ...(tree?.paths ?? []).filter((path) => !seen.has(path))];
  }, [diff, tree]);
}

function editingLabel(kind: Editing['kind'], agent: string): string {
  if (kind === 'queued') {
    return 'Editing your queued message';
  }
  if (kind === 'running') {
    return `Editing · ${agent} switches to this version`;
  }
  return 'Editing a copy · sends as a new message';
}

/** The message box and what sits above it: approvals, where edits land, the review and fix forms, the steer hint. */
export function ChatComposer(props: { repoPath: string; viewRef: string }) {
  const { repoPath, viewRef } = props;
  const textKey = draftKey('chat', repoPath, viewRef);
  const [text, setText] = useDraft(textKey);
  const chips = useChips(repoPath, viewRef);
  const focus = useComposer((state) => state.focus);
  const editing = useEditing(repoPath, viewRef);
  const openFile = useOpenFile(viewRef);
  const [droppedFile, setDroppedFile] = useState<string | null>(null);
  // In Files, the file on screen goes along with the message unless removed or already attached.
  const openChip: ContextChip | null =
    openFile && !editing && droppedFile !== openFile && !chips?.some((chip) => chip.filePath === openFile) ? { filePath: openFile } : null;
  const sentChips = [...(openChip ? [openChip] : []), ...(chips ?? [])];
  const hasLastSent = useComposer((state) => !!state.lastSent[viewKey(repoPath, viewRef)]);
  const target = useEditTarget(repoPath, viewRef);
  const files = useMentionFiles(viewRef);
  const inTheWay = useRunInTheWay(repoPath, 'edit', target !== 'none');
  const steerable = useClaude(() => canSteer(repoPath, viewRef));
  const viewRuns = useRunningRuns(repoPath).filter((run) => sameView(run.ref, viewRef) && !commentOf(run.action));
  const waitsFor = !steerable ? inTheWay : null;
  const savedPick = useRunPick('fix', repoPath);
  const [picked, setPicked] = useState<RunPick | null>(null);
  const pick = picked ?? savedPick;
  const agent = agentMeta(pick.agent);
  const card = usePanel((state) => state.card);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    textRef.current?.focus();
  }, [focus]);

  const placeholder = steerable
    ? `Tell ${agent.short} something now…`
    : hasLastSent
        ? `Message ${agent.short}… (↑ to edit your last)`
        : `Message ${agent.short}…`;

  const startEditing = (): boolean => {
    const found = messageToEdit(repoPath, viewRef);
    if (!found) {
      return false;
    }
    setEditing(repoPath, viewRef, { kind: found.kind, id: found.id, draft: text, draftChips: chips ?? [] });
    setText(found.text);
    setChips(repoPath, viewRef, found.chips);
    return true;
  };

  const stopEditing = () => {
    if (!editing) {
      return;
    }
    setEditing(repoPath, viewRef, null);
    setText(editing.draft);
    setChips(repoPath, viewRef, editing.draftChips);
  };

  const send = async (queue: boolean) => {
    const message = text.trim();
    if (!message || sending) {
      return;
    }
    if (picked) {
      writeRepoPick('fix', repoPath, picked);
    }
    setSending(true);
    try {
      await sendChatMessage({ repoPath, ref: viewRef, text: message, chips: sentChips, pick, queue, editing });
      if (editing) {
        stopEditing();
        return;
      }
      clearDraft(textKey);
      setChips(repoPath, viewRef, []);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="flex flex-col gap-2 shrink-0 px-3 pb-3 pt-1">
      <div ref={setCardSlot} className={cn(!card && 'hidden', 'max-h-[60vh] overflow-y-auto rounded-xl border border-control-border bg-bg-secondary shadow-lg shadow-black/25')} />
      <ApprovalBar repoPath={repoPath} agent={agent.short} />
      <QuickActions viewRef={viewRef} card={card} />
      {!card && (
        <div className="flex flex-col">
          {!editing && <Notices repoPath={repoPath} viewRef={viewRef} agent={agent.short} target={target} waitsFor={waitsFor} steerable={steerable} typing={text.trim().length > 0} />}
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void send(false);
            }}
            className={cn(
              'relative flex flex-col gap-2 px-2.5 pt-2 pb-2 rounded-xl border bg-raised',
              editing ? 'border-claude/60' : 'border-control-border focus-within:border-claude/50',
            )}
          >
            {editing && (
              <div className="flex items-center gap-1.5 -mx-2.5 -mt-2 px-2.5 py-1.5 rounded-t-[11px] bg-claude/10 border-b border-claude/25 text-[11.5px] leading-4 text-claude">
                <PencilIcon size="xs" className="shrink-0" />
                <span className="flex-1 min-w-0">{editingLabel(editing.kind, agent.short)}</span>
                <button type="button" onClick={stopEditing} className="shrink-0 text-text-secondary hover:text-text cursor-pointer">
                  Cancel <kbd className="font-sans opacity-70">Esc</kbd>
                </button>
              </div>
            )}
            {sentChips.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {openChip && <ChipTag chip={openChip} onRemove={() => setDroppedFile(openChip.filePath)} />}
                {chips?.map((chip, index) => <ChipTag key={index} chip={chip} onRemove={() => removeChip(repoPath, viewRef, index)} />)}
              </div>
            )}
            <MentionTextarea
              ref={textRef}
              value={text}
              onChange={setText}
              rows={2}
              growTo={GROW_TO}
              files={files}
              agents={false}
              placeholder={placeholder}
              spellCheck={false}
              menuAbove
              onKeyDown={(event) => {
                if (event.nativeEvent.isComposing) {
                  return;
                }
                const plain = !event.shiftKey && !event.altKey && !event.metaKey && !event.ctrlKey;
                if (event.key === 'ArrowUp' && plain && !text && !editing && startEditing()) {
                  event.preventDefault();
                  return;
                }
                if (event.key === 'Escape' && editing) {
                  event.preventDefault();
                  event.stopPropagation();
                  stopEditing();
                  return;
                }
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault();
                  void send(event.metaKey || event.ctrlKey);
                }
              }}
              className="w-full resize-none bg-transparent border-0 outline-none text-[13px] leading-5 text-text placeholder:text-text-muted"
            />
            <div className="flex items-center gap-1.5">
              <ModelPicker value={pick} onChange={setPicked} className="-ml-1.5 mr-auto" />
              {viewRuns.length > 0 && (
                <button type="button" onClick={() => viewRuns.forEach((run) => void stopRun(run.id))} className={buttonIcon} aria-label="Stop" title={`Stop ${agent.short} here`}>
                  <StopIcon size="xs" />
                </button>
              )}
              <button
                type="submit"
                disabled={!text.trim() || sending}
                aria-label={editing ? 'Save' : steerable ? 'Send now' : waitsFor ? 'Queue message' : 'Send'}
                title={editing ? 'Save (↵)' : steerable ? `Send now (↵) · queue (${modKey}↵)` : waitsFor ? `Queue for after ${waitLabel(waitsFor)} (↵)` : 'Send (↵)'}
                className="flex items-center justify-center w-7 h-7 rounded-lg bg-claude text-white disabled:opacity-40 disabled:cursor-default hover:bg-claude-hover transition-colors cursor-pointer"
              >
                <ArrowUpIcon size="sm" />
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

function ApprovalBar(props: { repoPath: string; agent: string }) {
  const { repoPath, agent } = props;
  const waiting = useWaitingApprovals(repoPath);

  if (waiting === 0) {
    return null;
  }
  return (
    <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-claude/30 bg-claude/8">
      <span className="w-1.5 h-1.5 rounded-full bg-claude" />
      <span className="flex-1 min-w-0 truncate">{agent} is waiting for your approval</span>
      <button type="button" onClick={() => showApprovals(repoPath)} className={cn(buttonOutline, 'h-6 px-2 text-xs')}>
        Review
      </button>
    </div>
  );
}

/** Says where edits land when this view won't show them, with a way there. */
interface Notice {
  key: string;
  icon: ReactNode;
  text: string;
  /** The longer explanation, on hover. */
  detail?: string;
  /** Shortcuts shown as keys, e.g. ↵ send now. */
  keys?: { key: string; label: string }[];
}

interface NoticesProps {
  repoPath: string;
  viewRef: string;
  agent: string;
  target: EditTarget;
  waitsFor: ClaudeRun | null;
  steerable: boolean;
  /** Whether there is a message in the box; how Enter sends only matters then. */
  typing: boolean;
}

/** What to know before sending, as a tab on top of the message box: what the agent can't do here, and when the message sends. */
function Notices(props: NoticesProps) {
  const { repoPath, viewRef, agent, target, waitsFor, steerable, typing } = props;
  const notices: Notice[] = [];

  if (target === 'none') {
    notices.push({
      key: 'where',
      icon: <GitBranchIcon size="xs" />,
      text: `Not checked out: ${agent} can answer and comment`,
      detail: `${agent} can’t edit this code because it isn’t checked out. Check out the branch to let it edit.`,
    });
  }
  if (waitsFor && typing) {
    const where = sameView(waitsFor.ref, viewRef) ? 'here' : `in ${runViewLabel(repoPath, waitsFor.ref ?? 'work')}`;
    notices.push({ key: 'wait', icon: <HistoryIcon size="xs" />, text: `Sends after ${waitLabel(waitsFor)} ${where}` });
  }
  if (steerable && typing) {
    notices.push({
      key: 'steer',
      icon: <Spinner className="text-claude" />,
      text: `${agent} is working`,
      detail: `↵ stops ${agent}’s current step and sends your message now; ${modKey}↵ sends it after this turn.`,
      keys: [
        { key: '↵', label: 'send now' },
        { key: `${modKey}↵`, label: 'queue' },
      ],
    });
  }
  if (notices.length === 0) {
    return null;
  }
  return (
    <div className="mx-2 rounded-t-lg border border-b-0 border-control-border bg-bg-secondary divide-y divide-border-muted">
      {notices.map((notice) => (
        <div key={notice.key} title={notice.detail} className="flex items-center gap-2 min-h-8 px-2.5 py-1 text-[11.5px] leading-4">
          <span className="flex shrink-0 text-text-muted">{notice.icon}</span>
          <span className="flex-1 min-w-0 truncate text-text-secondary">{notice.text}</span>
          {notice.keys?.map((item) => (
            <span key={item.key} className="flex items-center gap-1 shrink-0 text-text-muted">
              <kbd className="inline-flex items-center justify-center min-w-4 h-4 px-1 rounded border border-control-border bg-raised font-sans text-[10.5px] text-text-secondary">
                <KeyLabel keys={item.key} size={10} />
              </kbd>
              {item.label}
            </span>
          ))}
        </div>
      ))}
    </div>
  );
}

function QuickActions(props: { viewRef: string; card: ClaudeCard | null }) {
  const { viewRef, card } = props;
  const actions = usePanel((state) => (state.actions?.ref === viewRef ? state.actions : null));

  if (!actions || (!actions.reviewable && actions.fixCount === 0)) {
    return null;
  }
  const chip = (value: ClaudeCard, label: string, pending = false) => (
    <button
      type="button"
      onClick={() => toggleClaudeCard(value)}
      aria-pressed={card === value}
      className={cn(
        'flex items-center gap-1.5 h-6 px-2.5 rounded-full border text-xs cursor-pointer transition-colors',
        card === value && 'border-claude/60 bg-claude/16 text-claude',
        card !== value && pending && 'border-claude/40 bg-claude/8 text-claude hover:bg-claude/14',
        card !== value && !pending && 'border-control-border text-text-secondary hover:text-text hover:bg-hover',
      )}
    >
      {pending && <CommentIcon size="xs" />}
      {label}
    </button>
  );
  // Open comments are work waiting on you, so their chip stands out from the plain actions.
  return (
    <div className="flex flex-wrap gap-1.5">
      {actions.fixCount > 0 && chip('fix', `Answer or fix ${plural(actions.fixCount, 'comment')}`, true)}
      {actions.reviewable && chip('review', 'Review changes')}
    </div>
  );
}
