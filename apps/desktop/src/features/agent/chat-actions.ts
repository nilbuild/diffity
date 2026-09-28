import * as api from '@/lib/api';
import { queryClient, queryKeys } from '@/lib/query';
import type { AgentAction, AgentMode, Chat, ContextChip } from '@/lib/types';
import { useAgentStore } from './agent-store';
import { applyEvent, expirePermissions, localId, timelineFromMessages, type TimelineItem } from './timeline';

export interface CreateChatInput {
  repoPath: string;
  agentId: string;
  mode: AgentMode;
  sessionId: string;
  title?: string;
}

const chatSessions = new Map<string, string>();

export function sessionForChat(chatId: string): string | null {
  return chatSessions.get(chatId) ?? null;
}

export async function loadChat(chatId: string) {
  const runtime = useAgentStore.getState().runtimes[chatId];
  if (runtime?.loaded || runtime?.streaming) {
    return;
  }
  const messages = await api.getChatMessages(chatId);
  useAgentStore.getState().markLoaded(chatId, timelineFromMessages(messages));
}

export async function createChat(input: CreateChatInput): Promise<Chat> {
  const chat = await api.startChat({
    repoPath: input.repoPath,
    agentId: input.agentId,
    mode: input.mode,
    sessionId: input.sessionId,
    title: input.title,
  });
  queryClient.setQueryData<Chat[]>(queryKeys.chats(input.repoPath), (prev) => [
    chat,
    ...(prev ?? []).filter((existing) => existing.id !== chat.id),
  ]);
  chatSessions.set(chat.id, input.sessionId);
  useAgentStore.getState().markLoaded(chat.id, []);
  useAgentStore.getState().setActiveChat(chat.id);
  return chat;
}

export interface SendInput {
  repoPath: string;
  chatId: string;
  sessionId: string | null;
  text: string;
  displayText?: string;
  context: ContextChip[];
  action: AgentAction;
  agentName: string;
}

function moveToEnd(items: TimelineItem[], item: TimelineItem) {
  return [...items.filter((existing) => existing.id !== item.id), item];
}

export function friendlyAgentError(message: string, agentName: string) {
  const lower = message.toLowerCase();
  if (lower.includes('auth') || lower.includes('login') || lower.includes('log in') || lower.includes('api key')) {
    return `${message}\n\n${agentName} is not logged in. Open a terminal, run the agent CLI once and complete the login, then try again.`;
  }
  if (lower.includes('not found') || lower.includes('not installed') || lower.includes('no such file')) {
    return `${message}\n\n${agentName} could not be started. Check that it is installed, or set a custom binary path in Settings → Agents.`;
  }
  return message;
}

export async function sendToChat(input: SendInput) {
  const store = useAgentStore.getState();
  const { chatId, sessionId } = input;
  const turnId = localId('turn');
  store.setItems(chatId, (items) => [
    ...expirePermissions(items),
    { kind: 'user', id: turnId, text: input.displayText ?? input.text, context: input.context },
  ]);
  store.setStreaming(chatId, true);

  let baseline: Set<string> | null = null;
  let unlisten: (() => void) | null = null;
  const noteId = `note-${turnId}`;

  const refreshNote = async () => {
    if (!sessionId || !baseline) {
      return;
    }
    const threads = await api.listThreads(sessionId).catch(() => null);
    if (!threads) {
      return;
    }
    const known = baseline;
    const added = threads.filter((thread) => !known.has(thread.id) && thread.comments[0]?.authorType === 'agent');
    if (added.length === 0) {
      return;
    }
    const text = `${input.agentName} added ${added.length} comment${added.length === 1 ? '' : 's'}`;
    useAgentStore.getState().setItems(chatId, (items) => moveToEnd(items, { kind: 'note', id: noteId, text }));
  };

  if (sessionId) {
    const threads = await api.listThreads(sessionId).catch(() => []);
    baseline = new Set(threads.map((thread) => thread.id));
    unlisten = await api
      .onThreadsChanged((payload) => {
        if (payload.sessionId !== sessionId) {
          return;
        }
        queryClient.invalidateQueries({ queryKey: queryKeys.threads(sessionId) });
        void refreshNote();
      })
      .catch(() => null);
  }

  try {
    await api.sendPrompt(chatId, input.text, input.context, input.action, (event) => {
      useAgentStore.getState().setItems(chatId, (items) => applyEvent(items, event));
    });
  } catch (error) {
    const message = friendlyAgentError(api.errorMessage(error), input.agentName);
    useAgentStore.getState().setItems(chatId, (items) => [
      ...expirePermissions(items),
      { kind: 'error', id: localId('error'), message },
    ]);
  } finally {
    unlisten?.();
    await refreshNote();
    useAgentStore.getState().setStreaming(chatId, false);
    useAgentStore.getState().setItems(chatId, expirePermissions);
    queryClient.invalidateQueries({ queryKey: queryKeys.chats(input.repoPath) });
    if (sessionId) {
      queryClient.invalidateQueries({ queryKey: queryKeys.threads(sessionId) });
    }
  }
}

export async function cancelChat(chatId: string) {
  await api.cancelPrompt(chatId);
}

export async function answerPermission(chatId: string, requestId: string, optionId: string | null) {
  useAgentStore.getState().setItems(chatId, (items) =>
    items.map((item) => {
      if (item.kind !== 'permission' || item.id !== requestId) {
        return item;
      }
      return { ...item, state: optionId ? 'answered' : 'denied', chosen: optionId ?? undefined };
    }),
  );
  await api.respondPermission(requestId, optionId);
}
