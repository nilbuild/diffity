import { useEffect, useRef, useState, type ReactNode } from 'react';
import { cn } from '../../lib/cn';
import { modKey } from '../../lib/platform';
import { goToThread } from '../../lib/thread-location';
import { MentionTextarea } from '../../components/comments/mention-textarea';
import { buttonIcon, buttonOutline } from '../../components/ui/button-styles';
import { ArrowUpIcon, EyeOffIcon, GitBranchIcon, HistoryIcon, PencilIcon, StopIcon } from '../../components/ui/icon';
import { Spinner } from '../../components/icons/spinner';
import { plural } from '../review/review-candidates';
import { agentMeta } from './agents';
import { clearDraft, draftKey, useDraft } from './agent-drafts';
import { showApprovals, useWaitingApprovals } from './claude-approval-modal';
import { canSteer, runViewLabel, stopRun, useClaude, useRunInTheWay, useRunningRuns, waitLabel, type ClaudeRun } from './claude-runner';
import { messageToEdit, sendChatMessage } from './chat-send';
import { ChipTag } from './chat-stream';
import { removeChip, setChips, setEditing, useChips, useComposer, useEditing, type Editing } from './composer-state';
import { useEditTarget, whereEditsShow, type EditTarget } from './edit-target';
import { sameView, viewKey } from './conversation';
import { ModelPicker } from './model-picker';
import { useRunPick, writeRepoPick, type RunPick } from './model-setting';
import { setCardSlot, toggleClaudeCard, usePanel, type ClaudeCard } from './panel-store';

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
  const hasLastSent = useComposer((state) => !!state.lastSent[viewKey(repoPath, viewRef)]);
  const target = useEditTarget(repoPath, viewRef);
  const inTheWay = useRunInTheWay(repoPath, 'edit', target !== 'none');
  const steerable = useClaude(() => canSteer(repoPath, viewRef));
  const viewRuns = useRunningRuns(repoPath).filter((run) => sameView(run.ref, viewRef));
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
    : waitsFor
      ? 'Queue a message for after this run…'
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
      await sendChatMessage({ repoPath, ref: viewRef, text: message, chips: chips ?? [], pick, queue, editing });
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
      <div ref={setCardSlot} className={cn(!card && 'hidden', 'max-h-[60vh] overflow-y-auto rounded-xl border border-border bg-bg')} />
      <ApprovalBar repoPath={repoPath} agent={agent.short} />
      <QuickActions viewRef={viewRef} card={card} />
      {!card && (
        <div className="flex flex-col">
          {!editing && <Notices repoPath={repoPath} viewRef={viewRef} agent={agent.short} target={target} waitsFor={waitsFor} steerable={steerable} />}
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void send(false);
            }}
            className={cn(
              'flex flex-col gap-2 px-2.5 pt-2 pb-2 rounded-xl border bg-raised overflow-hidden',
              editing ? 'border-claude/60' : 'border-control-border focus-within:border-claude/50',
            )}
          >
            {editing && (
              <div className="flex items-center gap-1.5 -mx-2.5 -mt-2 px-2.5 py-1.5 bg-claude/10 border-b border-claude/25 text-[11.5px] leading-4 text-claude">
                <PencilIcon size="xs" className="shrink-0" />
                <span className="flex-1 min-w-0">{editingLabel(editing.kind, agent.short)}</span>
                <button type="button" onClick={stopEditing} className="shrink-0 text-text-secondary hover:text-text cursor-pointer">
                  Cancel <kbd className="font-sans opacity-70">Esc</kbd>
                </button>
              </div>
            )}
            {chips && chips.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {chips.map((chip, index) => <ChipTag key={index} chip={chip} onRemove={() => removeChip(repoPath, viewRef, index)} />)}
              </div>
            )}
            <MentionTextarea
              ref={textRef}
              value={text}
              onChange={setText}
              rows={2}
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
              className="w-full max-h-48 resize-none bg-transparent border-0 outline-none text-[13px] leading-5 text-text placeholder:text-text-muted"
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
  action?: { label: string; onClick: () => void };
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
}

/** What to know before sending, as a tab on top of the message box: where edits go, and when the message sends. */
function Notices(props: NoticesProps) {
  const { repoPath, viewRef, agent, target, waitsFor, steerable } = props;
  const notices: Notice[] = [];
  const seeEdits = whereEditsShow(viewRef);

  if (target === 'none') {
    notices.push({
      key: 'where',
      icon: <GitBranchIcon size="xs" />,
      text: `Not checked out: ${agent} can answer and comment`,
      detail: `${agent} can’t edit this code because it isn’t checked out. Check out the branch to let it edit.`,
    });
  }
  if (target === 'working-copy') {
    notices.push({
      key: 'where',
      icon: <EyeOffIcon size="xs" />,
      text: seeEdits.allChanges ? 'Edits won’t show in this view' : 'Edits go to your working copy',
      detail: seeEdits.allChanges
        ? `This view shows committed changes only. ${agent}’s edits are uncommitted, so they show in All changes.`
        : `This view compares commits. ${agent}’s edits go to your working copy, next to any changes of your own.`,
      action: { label: seeEdits.allChanges ? 'Show all changes' : 'View uncommitted', onClick: () => goToThread(repoPath, { ref: seeEdits.ref, threadId: null }) },
    });
  }
  if (waitsFor) {
    const where = sameView(waitsFor.ref, viewRef) ? 'here' : `in ${runViewLabel(repoPath, waitsFor.ref ?? 'work')}`;
    notices.push({ key: 'wait', icon: <HistoryIcon size="xs" />, text: `Sends after ${waitLabel(waitsFor)} ${where}` });
  }
  if (steerable) {
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
                {item.key}
              </kbd>
              {item.label}
            </span>
          ))}
          {notice.action && (
            <button
              type="button"
              onClick={notice.action.onClick}
              className="shrink-0 h-6 px-2 rounded-md border border-control-border bg-raised text-text whitespace-nowrap hover:bg-control-hover cursor-pointer"
            >
              {notice.action.label}
            </button>
          )}
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
  const chip = (value: ClaudeCard, label: string) => (
    <button
      type="button"
      onClick={() => toggleClaudeCard(value)}
      aria-pressed={card === value}
      className={cn(
        'h-6 px-2.5 rounded-full border text-xs cursor-pointer transition-colors',
        card === value ? 'border-claude/50 bg-claude/12 text-claude' : 'border-control-border text-text-secondary hover:text-text hover:bg-hover',
      )}
    >
      {label}
    </button>
  );
  return (
    <div className="flex flex-wrap gap-1.5">
      {actions.reviewable && chip('review', 'Review changes')}
      {actions.fixCount > 0 && chip('fix', `Fix ${plural(actions.fixCount, 'open comment')}`)}
    </div>
  );
}
