import { create } from 'zustand';
import { flushActivity } from './run-activity';

export type ClaudeCard = 'review' | 'fix';

interface ViewActions {
  ref: string | null;
  /** The view has changes an agent can review. */
  reviewable: boolean;
  /** Open comments an agent can fix here; 0 where it can't edit. */
  fixCount: number;
}

interface PanelState {
  open: boolean;
  /** A run picked to see in full (from History or a run's Details); null shows the view's chat. */
  details: string | null;
  history: boolean;
  /** The review or fix form open above the message box. */
  card: ClaudeCard | null;
  /** Where the panel shows that form; the page renders it there, inside its own providers. */
  slot: HTMLElement | null;
  /** Published by the Claude button on the page, which knows the view's comments. */
  actions: ViewActions | null;
}

/** The agent panel docked beside the page: whether it shows, and what it shows. */
export const usePanel = create<PanelState>(() => ({ open: false, details: null, history: false, card: null, slot: null, actions: null }));

export function openClaudePanel() {
  flushActivity();
  usePanel.setState({ open: true, details: null, history: false });
}

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
  usePanel.setState({ open: true, history: true });
}

/** Shows one run in full; null goes back to the view's chat. */
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
