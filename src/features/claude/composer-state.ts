import { create } from 'zustand';
import type { ContextChip } from '../../lib/types';
import { writeDraft, draftKey } from './agent-drafts';
import { viewKey } from './conversation';
import { closeClaudeCard, openClaudePanel } from './panel-store';

/**
 * The message box's state per view, outside the box so other parts of the app can fill it: lines picked with ⌘L, the
 * message ↑ brought back to edit, and a request to put the cursor in it.
 */

/**
 * `queued` hasn't started: saving changes it in place. `running` is what the agent is working on: saving stops it and
 * sends the new version instead. `copy` was already answered: what it did can't be taken back, so saving sends a new
 * message.
 */
export interface Editing {
  kind: 'queued' | 'running' | 'copy';
  /** The queued or running run; for a copy, the saved message's key. */
  id: string;
  /** What the box held before, put back on Cancel. */
  draft: string;
  draftChips: ContextChip[];
}

interface LastSent {
  key: string;
  text: string;
  chips: ContextChip[];
}

interface ComposerState {
  chips: Record<string, ContextChip[]>;
  editing: Record<string, Editing | null>;
  /** The view's latest message, which ↑ brings back when nothing is queued or running. */
  lastSent: Record<string, LastSent | null>;
  /** Bumped to move the cursor into the message box. */
  focus: number;
}

export const useComposer = create<ComposerState>(() => ({ chips: {}, editing: {}, lastSent: {}, focus: 0 }));

function sameChip(a: ContextChip, b: ContextChip) {
  return a.filePath === b.filePath && a.side === b.side && a.startLine === b.startLine && a.endLine === b.endLine;
}

export function useChips(repoPath: string, ref: string | null): ContextChip[] | undefined {
  return useComposer((state) => state.chips[viewKey(repoPath, ref)]);
}

export function setChips(repoPath: string, ref: string | null, chips: ContextChip[]) {
  const key = viewKey(repoPath, ref);
  useComposer.setState((state) => ({ chips: { ...state.chips, [key]: chips } }));
}

export function addChip(repoPath: string, ref: string | null, chip: ContextChip) {
  const current = useComposer.getState().chips[viewKey(repoPath, ref)] ?? [];
  if (current.some((item) => sameChip(item, chip))) {
    return;
  }
  setChips(repoPath, ref, [...current, chip]);
}

export function removeChip(repoPath: string, ref: string | null, index: number) {
  const current = useComposer.getState().chips[viewKey(repoPath, ref)] ?? [];
  setChips(repoPath, ref, current.filter((_, at) => at !== index));
}

export function focusComposer() {
  useComposer.setState((state) => ({ focus: state.focus + 1 }));
}

export function useEditing(repoPath: string, ref: string | null): Editing | null {
  return useComposer((state) => state.editing[viewKey(repoPath, ref)] ?? null);
}

export function setEditing(repoPath: string, ref: string | null, editing: Editing | null) {
  const key = viewKey(repoPath, ref);
  useComposer.setState((state) => ({ editing: { ...state.editing, [key]: editing } }));
}

export function setLastSent(repoPath: string, ref: string | null, last: LastSent | null) {
  const key = viewKey(repoPath, ref);
  if (useComposer.getState().lastSent[key]?.key === last?.key) {
    return;
  }
  useComposer.setState((state) => ({ lastSent: { ...state.lastSent, [key]: last } }));
}

export function lastSentFor(repoPath: string, ref: string | null): LastSent | null {
  return useComposer.getState().lastSent[viewKey(repoPath, ref)] ?? null;
}

/** Puts `text` in the view's message box and opens the panel there, for a request that's better sent as a chat message. */
export function askInChat(repoPath: string, ref: string | null, text: string) {
  writeDraft(draftKey('chat', repoPath, ref), text);
  closeClaudeCard();
  openClaudePanel();
  focusComposer();
}
