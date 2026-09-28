import { useCallback, useEffect, useLayoutEffect, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import * as api from '@/lib/api';
import { queryKeys } from '@/lib/query';
import { TREE_REF, type AgentAction, type AgentMode, type Chat, type ContextChip } from '@/lib/types';
import { useAgentBus, type AgentBusRequest } from '@/features/workspace/agent-bus';
import { useWorkspace } from '@/features/workspace/workspace-context';
import { agentHint, isAgentUsable, isReadOnlyMode, modeLabel, pickAgent } from './agents';
import { useAgentStore, useChatRuntime, type UiMode } from './agent-store';
import { AgentHeader } from './AgentHeader';
import { answerPermission, cancelChat, createChat, loadChat, sendToChat, sessionForChat } from './chat-actions';
import { Composer } from './Composer';
import { AgentEmptyState } from './AgentEmptyState';
import {
  AgentText,
  DoneRow,
  ErrorRow,
  NoteRow,
  PermissionCard,
  PlanChecklist,
  StreamingIndicator,
  ThoughtBlock,
  ToolCallRow,
  UserBubble,
} from './TimelineRows';
import type { TimelineItem } from './timeline';

interface ActionPlan {
  mode: AgentMode;
  ref: string | null;
  title: string;
  label: string;
}

function planAction(action: AgentAction, workspaceRef: string): ActionPlan {
  switch (action.kind) {
    case 'review': {
      const focus = action.focus && action.focus !== 'all' ? action.focus : null;
      return {
        mode: 'review',
        ref: action.ref,
        title: focus ? `Review (${focus}) · ${action.ref}` : `Review · ${action.ref}`,
        label: focus ? `Review the changes with a focus on ${focus}` : 'Review the changes',
      };
    }
    case 'summarize':
      return { mode: 'ask', ref: action.ref, title: `Summary · ${action.ref}`, label: 'Summarize the changes' };
    case 'explain':
      return { mode: 'ask', ref: workspaceRef, title: `Explain ${action.path}`, label: `Explain \`${action.path}\`` };
    case 'resolve':
      return {
        mode: 'resolve',
        ref: workspaceRef,
        title: action.threadId ? `Resolve thread ${action.threadId.slice(0, 8)}` : 'Resolve all comments',
        label: action.threadId ? `Resolve thread ${action.threadId.slice(0, 8)}` : 'Resolve all open comments',
      };
    case 'chat':
      return { mode: 'ask', ref: null, title: 'Chat', label: '' };
  }
}

function modeClass(mode: AgentMode): UiMode {
  return isReadOnlyMode(mode) ? 'ask' : 'edit';
}

function reviewRef(ref: string) {
  if (ref === TREE_REF) {
    return 'work';
  }
  return ref;
}

function actionLabel(action: AgentAction, fallback: string, context: ContextChip[]) {
  const chip = context[0];
  if (action.kind !== 'explain' || !chip?.startLine) {
    return fallback;
  }
  const range = chip.endLine && chip.endLine !== chip.startLine ? `${chip.startLine}-${chip.endLine}` : `${chip.startLine}`;
  return `Explain \`${chip.filePath}:${range}\``;
}

export function AgentPanel() {
  const { repoPath, ref, sessionId } = useWorkspace();
  const queryClient = useQueryClient();
  const setPanelOpen = useAgentBus((state) => state.setPanelOpen);
  const queue = useAgentBus((state) => state.queue);
  const activeChatId = useAgentStore((state) => state.activeChatId);
  const uiMode = useAgentStore((state) => state.uiMode);
  const runtime = useChatRuntime(activeChatId);

  const agentsQuery = useQuery({ queryKey: queryKeys.agents(), queryFn: () => api.listAgents(), staleTime: 60_000 });
  const chatsQuery = useQuery({ queryKey: queryKeys.chats(repoPath), queryFn: () => api.listChats(repoPath) });

  const agents = agentsQuery.data ?? [];
  const chats = chatsQuery.data ?? [];
  const activeChat = chats.find((chat) => chat.id === activeChatId) ?? null;
  const agent = pickAgent(agents);
  const agentUsable = agent ? isAgentUsable(agent) : false;
  const agentName = agent?.name ?? 'Agent';

  useEffect(() => {
    if (!activeChatId) {
      return;
    }
    loadChat(activeChatId).catch((error) => toast.error(`Could not load chat: ${api.errorMessage(error)}`));
  }, [activeChatId]);

  const resolveSession = useCallback(
    async (targetRef: string | null) => {
      const effective = reviewRef(targetRef ?? ref);
      if (effective === ref && sessionId) {
        return sessionId;
      }
      const session = await api.getSession(repoPath, effective);
      return session.id;
    },
    [repoPath, ref, sessionId],
  );

  const ensureUsableAgent = useCallback(() => {
    if (!agent) {
      toast.error('Claude Code not found. Install the `claude` CLI or set its path in Settings.');
      return null;
    }
    if (!isAgentUsable(agent)) {
      toast.error(`${agent.name} is not ready`, { description: agentHint(agent) ?? undefined });
      return null;
    }
    return agent;
  }, [agent]);

  const runAction = useCallback(
    async (action: AgentAction, text = '', context: ContextChip[] = []) => {
      const selected = ensureUsableAgent();
      if (!selected) {
        return;
      }
      const plan = planAction(action, ref);
      try {
        const targetSession = await resolveSession(plan.ref);
        const store = useAgentStore.getState();
        const current = chats.find((chat) => chat.id === store.activeChatId);
        const currentRuntime = current ? store.runtimes[current.id] : undefined;
        const reusable =
          current &&
          current.mode === plan.mode &&
          current.agentId === selected.id &&
          !currentRuntime?.streaming &&
          (currentRuntime?.items.length ?? 0) === 0;
        const chat = reusable
          ? current
          : await createChat({
              repoPath,
              agentId: selected.id,
              mode: plan.mode,
              sessionId: targetSession,
              title: plan.title,
            });
        store.setUiMode(modeClass(plan.mode));
        await sendToChat({
          repoPath,
          chatId: chat.id,
          sessionId: targetSession,
          text,
          displayText: text || actionLabel(action, plan.label, context),
          context,
          action,
          agentName: selected.name,
        });
      } catch (error) {
        toast.error(`Could not start ${selected.name}`, { description: api.errorMessage(error) });
      }
    },
    [chats, ensureUsableAgent, ref, repoPath, resolveSession],
  );

  const sendMessage = useCallback(
    async (text: string) => {
      const selected = ensureUsableAgent();
      if (!selected) {
        return;
      }
      const store = useAgentStore.getState();
      const context = store.attached;
      try {
        const current = chats.find((chat) => chat.id === store.activeChatId);
        const compatible =
          current && current.agentId === selected.id && modeClass(current.mode) === store.uiMode;
        let chat: Chat;
        let chatSession: string | null;
        if (compatible) {
          chat = current;
          chatSession = sessionForChat(current.id) ?? sessionId;
        } else {
          chatSession = await resolveSession(null);
          chat = await createChat({
            repoPath,
            agentId: selected.id,
            mode: store.uiMode,
            sessionId: chatSession,
            title: (text || context.map((chip) => chip.filePath).join(', ')).slice(0, 80),
          });
        }
        store.clearAttached();
        await sendToChat({
          repoPath,
          chatId: chat.id,
          sessionId: chatSession,
          text,
          context,
          action: { kind: 'chat' },
          agentName: selected.name,
        });
      } catch (error) {
        toast.error(`Could not send to ${selected.name}`, { description: api.errorMessage(error) });
      }
    },
    [chats, ensureUsableAgent, repoPath, resolveSession, sessionId],
  );

  const handleRequest = useCallback(
    (request: AgentBusRequest) => {
      if (request.type === 'ask') {
        useAgentStore.getState().attach(request.chip);
        useAgentStore.getState().focusComposer();
        return;
      }
      if (request.action.kind === 'chat') {
        useAgentStore.getState().focusComposer();
        return;
      }
      void runAction(request.action, '', request.context ?? []);
    },
    [runAction],
  );

  useEffect(() => {
    if (queue.length === 0) {
      return;
    }
    if (agentsQuery.isPending || chatsQuery.isPending) {
      return;
    }
    const pending = useAgentBus.getState().drain();
    for (const request of pending) {
      handleRequest(request);
    }
  }, [queue, handleRequest, agentsQuery.isPending, chatsQuery.isPending]);

  const deleteChat = async (chatId: string) => {
    try {
      await api.deleteChat(chatId);
      useAgentStore.getState().removeRuntime(chatId);
      queryClient.setQueryData<Chat[]>(queryKeys.chats(repoPath), (prev) =>
        (prev ?? []).filter((chat) => chat.id !== chatId),
      );
    } catch (error) {
      toast.error(`Could not delete chat: ${api.errorMessage(error)}`);
    }
  };

  const selectChat = (chatId: string) => {
    const chat = chats.find((item) => item.id === chatId);
    const store = useAgentStore.getState();
    store.setActiveChat(chatId);
    if (!chat) {
      return;
    }
    store.setAgentId(chat.agentId);
    store.setUiMode(modeClass(chat.mode));
  };

  const activeModeMismatch = activeChat && runtime.items.length > 0 && modeClass(activeChat.mode) !== uiMode;
  const modeHint = activeModeMismatch
    ? `Sending starts a new ${uiMode === 'edit' ? 'Edit' : 'Ask'} chat`
    : activeChat && activeChat.mode !== 'ask' && activeChat.mode !== 'edit'
      ? `${modeLabel[activeChat.mode]} chat`
      : null;

  const disabledReason = !agent
    ? agentsQuery.isPending
      ? 'Detecting Claude Code…'
      : 'Claude Code not detected'
    : !agentUsable
      ? agentHint(agent)
      : null;

  return (
    <div className="flex h-full min-h-0 flex-col bg-panel">
      <AgentHeader
        agents={agents}
        agentsLoading={agentsQuery.isPending}
        agent={agent}
        uiMode={uiMode}
        onModeChange={(mode) => useAgentStore.getState().setUiMode(mode)}
        chats={chats}
        activeChatId={activeChatId}
        onSelectChat={selectChat}
        onDeleteChat={deleteChat}
        onNewChat={() => {
          useAgentStore.getState().setActiveChat(null);
          useAgentStore.getState().focusComposer();
        }}
        onClose={() => setPanelOpen(false)}
      />
      {agentsQuery.isError && (
        <div className="border-b border-border bg-danger/10 px-3 py-2 text-xs text-danger">
          Could not detect agents: {api.errorMessage(agentsQuery.error)}
        </div>
      )}
      {agent && !agentUsable && (
        <div className="border-b border-border bg-warning/10 px-3 py-2 text-xs text-warning">
          <span className="font-medium">{agent.name}</span> is not ready. {agentHint(agent)}
        </div>
      )}
      <MessageList
        chatId={activeChatId}
        items={runtime.items}
        streaming={runtime.streaming}
        loaded={runtime.loaded || !activeChatId}
        repoPath={repoPath}
        agentName={agentName}
        onExample={(prompt) => void sendMessage(prompt)}
        canRun={agentUsable}
      />
      <Composer
        disabled={!agentUsable}
        disabledReason={disabledReason}
        streaming={runtime.streaming}
        modeHint={modeHint}
        onSend={(text) => void sendMessage(text)}
        onStop={() => {
          if (!activeChatId) {
            return;
          }
          cancelChat(activeChatId).catch((error) => toast.error(api.errorMessage(error)));
        }}
        onReview={(focus) => void runAction({ kind: 'review', ref: reviewRef(ref), focus: focus === 'all' ? undefined : focus })}
        onResolveAll={() => void runAction({ kind: 'resolve' })}
        onSummarize={() => void runAction({ kind: 'summarize', ref: reviewRef(ref) })}
      />
    </div>
  );
}

function MessageList(props: {
  chatId: string | null;
  items: TimelineItem[];
  streaming: boolean;
  loaded: boolean;
  repoPath: string;
  agentName: string;
  canRun: boolean;
  onExample: (prompt: string) => void;
}) {
  const { chatId, items, streaming, loaded, repoPath, agentName, canRun, onExample } = props;
  const scrollRef = useRef<HTMLDivElement>(null);
  const stickRef = useRef(true);

  useLayoutEffect(() => {
    const element = scrollRef.current;
    if (!element || !stickRef.current) {
      return;
    }
    element.scrollTop = element.scrollHeight;
  }, [items, streaming]);

  useEffect(() => {
    stickRef.current = true;
  }, [chatId]);

  const onScroll = () => {
    const element = scrollRef.current;
    if (!element) {
      return;
    }
    stickRef.current = element.scrollHeight - element.scrollTop - element.clientHeight < 40;
  };

  if (!loaded) {
    return <div className="flex flex-1 items-center justify-center text-xs text-fg-subtle">Loading chat…</div>;
  }

  if (items.length === 0 && !streaming) {
    return <AgentEmptyState agentName={agentName} canRun={canRun} onExample={onExample} />;
  }

  const lastIndex = items.length - 1;
  const last = items[lastIndex];
  const showWorking = streaming && (!last || last.kind === 'user' || last.kind === 'tool' || last.kind === 'note');

  return (
    <div ref={scrollRef} onScroll={onScroll} className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
      <div className="flex flex-col gap-2.5">
        {items.map((item, index) => (
          <TimelineRow
            key={`${item.kind}-${item.id}`}
            item={item}
            chatId={chatId}
            repoPath={repoPath}
            live={streaming && index === lastIndex}
          />
        ))}
        {showWorking && <StreamingIndicator />}
      </div>
    </div>
  );
}

function TimelineRow(props: { item: TimelineItem; chatId: string | null; repoPath: string; live: boolean }) {
  const { item, chatId, repoPath, live } = props;
  switch (item.kind) {
    case 'user':
      return <UserBubble item={item} repoPath={repoPath} />;
    case 'text':
      return <AgentText text={item.text} />;
    case 'thought':
      return <ThoughtBlock text={item.text} live={live} />;
    case 'tool':
      return <ToolCallRow item={item} repoPath={repoPath} />;
    case 'plan':
      return <PlanChecklist entries={item.entries} />;
    case 'permission':
      return (
        <PermissionCard
          item={item}
          onRespond={(optionId) => {
            if (!chatId) {
              return;
            }
            answerPermission(chatId, item.id, optionId).catch((error) => toast.error(api.errorMessage(error)));
          }}
        />
      );
    case 'error':
      return <ErrorRow message={item.message} />;
    case 'done':
      return <DoneRow stopReason={item.stopReason} />;
    case 'note':
      return <NoteRow text={item.text} />;
  }
}
