import * as tauri from '../../lib/tauri';
import type { ContextChip, SentAs } from '../../lib/types';
import { enqueueClaude, interruptRun, steerTarget, updateQueuedMessage, useClaude, type ClaudeRun } from './claude-runner';
import { sameView } from './conversation';
import { lastSentFor, type Editing } from './composer-state';
import type { RunPick } from './model-setting';

interface ChatMessage {
  repoPath: string;
  ref: string;
  text: string;
  chips: ContextChip[];
  pick: RunPick;
  /** ⌘↵: wait for the running turn instead of stopping it. */
  queue: boolean;
  /** The message ↑ brought back, when this saves an edit of it. */
  editing: Editing | null;
}

/**
 * Sends a message typed in the panel. While the agent works on this chat, it stops and reads the message first (a
 * steer) unless asked to queue. Saving an edit changes a queued message in place, or stops the agent and sends the new
 * version in place of the one it's working on; an edited copy of an answered message goes as a new one.
 */
export async function sendChatMessage(message: ChatMessage) {
  const { repoPath, ref, text, chips, pick, queue, editing } = message;
  if (editing?.kind === 'queued' && updateQueuedMessage(editing.id, text, chips)) {
    return;
  }
  const editsSent = editing?.kind === 'queued' || editing?.kind === 'running';
  const replaced = editsSent ? useClaude.getState().runs.find((run) => run.id === editing.id && run.state === 'running') ?? null : null;
  const steered = !editsSent && !queue ? steerTarget(repoPath, ref) : null;
  const stopping = replaced ?? steered;
  const sentAs: SentAs | undefined = editsSent ? 'edit' : steered ? 'steer' : undefined;
  const session = await tauri.getSession(repoPath, ref).catch(() => null);
  enqueueClaude({ kind: 'chat' }, { repoPath, sessionId: session?.id ?? null, ref, pick, text, chips, sentAs, conversation: true }, !!stopping);
  if (stopping) {
    await interruptRun(stopping.id);
  }
}

/** What ↑ brings back to edit: the message still queued, else the one the agent is working on, else a copy of the last one. */
export function messageToEdit(repoPath: string, ref: string): Omit<Editing, 'draft' | 'draftChips'> & { text: string; chips: ContextChip[] } | null {
  const mine = (run: ClaudeRun) => run.context.repoPath === repoPath && !!run.context.conversation && sameView(run.ref, ref);
  const runs = useClaude.getState().runs;
  const queued = [...runs].reverse().find((run) => run.state === 'queued' && mine(run));
  if (queued) {
    return { kind: 'queued', id: queued.id, text: queued.context.text ?? '', chips: queued.context.chips ?? [] };
  }
  const running = runs.find((run) => run.state === 'running' && mine(run));
  if (running) {
    return { kind: 'running', id: running.id, text: running.context.text ?? '', chips: running.context.chips ?? [] };
  }
  const last = lastSentFor(repoPath, ref);
  if (last) {
    return { kind: 'copy', id: last.key, text: last.text, chips: last.chips };
  }
  return null;
}
