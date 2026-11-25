import { create } from 'zustand';
import { isWorkingTreeRef, parseCommitRef } from '../../lib/api';
import { TREE_REF, type Chat } from '../../lib/types';

/** Each view has its own conversation with the agent; this remembers which chat that is. */

export function isConversation(chat: Pick<Chat, 'kind'>): boolean {
  return chat.kind === 'conversation';
}

/** A conversation is listed under its first message. */
export function conversationTitle(text: string): string {
  const line = text.trim().split('\n')[0] ?? '';
  return line.length > 60 ? `${line.slice(0, 57)}…` : line || 'Chat';
}

/**
 * A branch's All changes view (`main`) and its Committed only twin (`main...HEAD`) are one review with one chat, so
 * switching between them keeps the conversation.
 */
function sharedRef(ref: string | null): string {
  if (!ref || ref.includes('..') || ref === TREE_REF || ref === '__home__' || isWorkingTreeRef(ref) || parseCommitRef(ref)) {
    return ref ?? '';
  }
  return `${ref}...HEAD`;
}

/** Whether two refs are the same view for chatting: equal, or a branch's All changes and Committed only twins. */
export function sameView(a: string | null | undefined, b: string | null | undefined): boolean {
  return sharedRef(a ?? null) === sharedRef(b ?? null);
}

export function viewKey(repoPath: string, ref: string | null): string {
  return `${repoPath}::${sharedRef(ref)}`;
}

interface ViewConversation {
  /** The chat new messages go to; null until the first one is sent. */
  chatId: string | null;
  agentId: string | null;
  /** Whether the chat was started where the agent can edit; a chat can't change that later. */
  editable: boolean;
  /** The panel shows what happened in the view from here on; "New chat" moves it to now. */
  since: number;
}

const STORAGE_KEY = 'diffity-conversations';
const MAX_VIEWS = 200;

function read(): Record<string, ViewConversation> {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}');
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function write(byView: Record<string, ViewConversation>) {
  const entries = Object.entries(byView).sort((a, b) => b[1].since - a[1].since).slice(0, MAX_VIEWS);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(Object.fromEntries(entries)));
  } catch {
    return;
  }
}

export const useConversations = create<{ byView: Record<string, ViewConversation> }>(() => ({ byView: read() }));

export function conversationFor(repoPath: string, ref: string | null): ViewConversation | null {
  return useConversations.getState().byView[viewKey(repoPath, ref)] ?? null;
}

export function useConversation(repoPath: string, ref: string | null): ViewConversation | null {
  return useConversations((state) => state.byView[viewKey(repoPath, ref)] ?? null);
}

function setConversation(repoPath: string, ref: string | null, value: ViewConversation) {
  const byView = { ...useConversations.getState().byView, [viewKey(repoPath, ref)]: value };
  useConversations.setState({ byView });
  write(byView);
}

/** Messages now go to `chat`; what the panel already shows stays. */
export function continueConversation(repoPath: string, ref: string | null, chat: Pick<Chat, 'id' | 'agentId' | 'mode' | 'createdAt'>) {
  const current = conversationFor(repoPath, ref);
  const since = Math.min(current?.since ?? Infinity, Date.parse(chat.createdAt) || Date.now());
  setConversation(repoPath, ref, { chatId: chat.id, agentId: chat.agentId, editable: chat.mode !== 'review' && chat.mode !== 'ask', since });
}

/** Clears the panel for the view; the next message starts a new chat. */
export function startNewConversation(repoPath: string, ref: string | null) {
  setConversation(repoPath, ref, { chatId: null, agentId: null, editable: false, since: Date.now() });
}
