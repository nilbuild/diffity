import { create } from 'zustand';
import { closeComments, useUi } from '../../lib/ui-store';
import { flushActivity } from './run-activity';

export type ClaudeCard = 'review' | 'fix';

interface ViewActions {
  ref: string | null;
  reviewable: boolean;
  /** 0 where the agent can't edit. */
  fixCount: number;
}

interface PanelState {
  open: boolean;
  /** A run picked to see in full (from History or a run's Details); null shows the view's chat. */
  details: string | null;
  history: boolean;
  card: ClaudeCard | null;
  /** Where the panel shows that form; the page renders it there, inside its own providers. */
  slot: HTMLElement | null;
  /** Published by the Claude button on the page, which knows the view's comments. */
  actions: ViewActions | null;
}

export const usePanel = create<PanelState>(() => ({ open: false, details: null, history: false, card: null, slot: null, actions: null }));

export function openClaudePanel() {
  flushActivity();
  closeComments();
  usePanel.setState({ open: true, details: null, history: false });
}

// Chat and Comments share the right side of the window, so opening Comments closes the chat.
useUi.subscribe((state, previous) => {
  if (state.commentsOpen && !previous.commentsOpen && usePanel.getState().open) {
    closeClaudePanel();
  }
});

export function closeClaudePanel() {
  usePanel.setState({ open: false });
}

export function toggleClaudePanel() {
  if (usePanel.getState().open) {
    closeClaudePanel();
    return;
  }
  openClaudePanel();
}

export function openClaudeHistory() {
  closeComments();
  usePanel.setState({ open: true, history: true });
}

/** Null goes back to the view's chat. */
export function showRunDetails(chatId: string | null) {
  usePanel.setState({ details: chatId, history: false });
}

export function openClaudeCard(card: ClaudeCard) {
  openClaudePanel();
  usePanel.setState({ card });
}

export function toggleClaudeCard(card: ClaudeCard) {
  usePanel.setState((state) => ({ card: state.card === card ? null : card }));
}

export function closeClaudeCard() {
  usePanel.setState({ card: null });
}

export function setCardSlot(slot: HTMLElement | null) {
  usePanel.setState({ slot });
}

export function publishViewActions(actions: ViewActions | null) {
  const current = usePanel.getState().actions;
  if (current?.ref === actions?.ref && current?.reviewable === actions?.reviewable && current?.fixCount === actions?.fixCount) {
    return;
  }
  usePanel.setState({ actions });
}
