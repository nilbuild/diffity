import { useCallback, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import * as api from '@/lib/api';
import { queryKeys } from '@/lib/query';
import { TREE_REF, type AgentAction, type AgentMode, type Chat, type ContextChip } from '@/lib/types';
import { useAgentBus, type AgentBusRequest } from '@/features/workspace/agent-bus';
import { useWorkspace } from '@/features/workspace/workspace-context';
import { REVIEW_FOCUSES, agentHint, isAgentUsable, isReadOnlyMode, modeLabel, pickAgent } from './agents';
import { useAgentStore, useChatRuntime, type UiMode } from './agent-store';
import { AgentHeader } from './AgentHeader';
import { answerPermission, cancelChat, createChat, loadChat, sendToChat, sessionForChat } from './chat-actions';
import { Composer } from './Composer';
import { Spinner } from '@/components/ui/Spinner';
import { AgentEmptyState } from './AgentEmptyState';
import { RunQueue } from './RunQueue';
import { enqueueThreadAction, isThreadAction, trackExternalRun } from './run-queue';
import {
  AgentText,
  DoneRow,
  ErrorRow,
  NoteRow,
  PermissionCard,
  PlanChecklist,
  RunHeader,
  StreamingIndicator,
  ThoughtBlock,
  ToolGroup,
  UserBubble,
} from './TimelineRows';
import type { RunMeta, TimelineItem } from './timeline';

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
    case 'thread':
      return { mode: 'resolve', ref: null, title: 'Reply to thread', label: 'Reply to thread' };
    case 'reviewFeedback':
      return { mode: 'resolve', ref: null, title: 'Address review', label: 'Address review' };
    case 'chat':
      return { mode: 'ask', ref: null, title: 'Chat', label: '' };
  }
}

function focusLabel(focus: string | undefined) {
  if (!focus || focus === 'all') {
    return null;
  }
  return REVIEW_FOCUSES.find((item) => item.value === focus)?.label ?? focus;
}

function runMeta(action: AgentAction, context: ContextChip[]): RunMeta | undefined {
  switch (action.kind) {
    case 'review': {
      const focus = focusLabel(action.focus);
      return {
        kind: 'review',
        title: focus ? `Review · ${focus}` : 'Review changes',
        detail: action.ref === 'work' ? null : action.ref,
      };
    }
    case 'summarize':
      return { kind: 'summarize', title: 'Summarize changes' };
    case 'explain':
      return { kind: 'explain', title: 'Explain', detail: context.length > 0 ? null : action.path };
    case 'resolve':
      return action.threadId
        ? { kind: 'resolve', title: 'Resolve thread', detail: action.threadId.slice(0, 8), threadIds: [action.threadId] }
        : { kind: 'resolve', title: 'Resolve open comments' };
    case 'thread':
    case 'reviewFeedback':
    case 'chat':
      return undefined;
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
      if (isThreadAction(action)) {
        enqueueThreadAction(action, { repoPath, agentId: selected.id, agentName: selected.name, sessionId });
        return;
      }
      const plan = planAction(action, ref);
      await trackExternalRun(async () => {
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
            run: text ? undefined : runMeta(action, context),
          });
        } catch (error) {
          toast.error(`Could not start ${selected.name}`, { description: api.errorMessage(error) });
        }
      });
    },
    [chats, ensureUsableAgent, ref, repoPath, resolveSession, sessionId],
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
        chatTitle={activeChat?.title ?? null}
        chatAction={activeChat ? chatRunKind(activeChat) : 'chat'}
      />
      <RunQueue />
      <Composer
        agentName={agentName}
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

function chatRunKind(chat: Chat): AgentAction['kind'] {
  if (chat.mode === 'review') {
    return 'review';
  }
  if (chat.mode === 'resolve') {
    return 'resolve';
  }
  return 'chat';
}

type Block =
  | { type: 'item'; item: TimelineItem; index: number }
  | { type: 'tools'; items: Extract<TimelineItem, { kind: 'tool' }>[]; lastIndex: number };

function toBlocks(items: TimelineItem[]): Block[] {
  const blocks: Block[] = [];
  items.forEach((item, index) => {
    const previous = blocks[blocks.length - 1];
    if (item.kind === 'tool' && previous?.type === 'tools') {
      previous.items.push(item);
      previous.lastIndex = index;
      return;
    }
    if (item.kind === 'tool') {
      blocks.push({ type: 'tools', items: [item], lastIndex: index });
      return;
    }
    blocks.push({ type: 'item', item, index });
  });
  return blocks;
}

function MessageList(props: {
  chatId: string | null;
  items: TimelineItem[];
  streaming: boolean;
  loaded: boolean;
  repoPath: string;
  agentName: string;
  canRun: boolean;
  chatTitle: string | null;
  chatAction: AgentAction['kind'];
  onExample: (prompt: string) => void;
}) {
  const { chatId, items, streaming, loaded, repoPath, agentName, canRun, chatTitle, chatAction, onExample } = props;
  const scrollRef = useRef<HTMLDivElement>(null);
  const stickRef = useRef(true);
  const blocks = useMemo(() => toBlocks(items), [items]);

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
    return (
      <div className="flex flex-1 items-center justify-center gap-2 text-xs text-fg-subtle">
        <Spinner size={12} /> Loading chat…
      </div>
    );
  }

  if (items.length === 0 && !streaming) {
    return <AgentEmptyState agentName={agentName} canRun={canRun} onExample={onExample} />;
  }

  const lastIndex = items.length - 1;
  const last = items[lastIndex];
  const showWorking =
    streaming && (!last || last.kind === 'user' || last.kind === 'note' || (last.kind === 'tool' && last.status === 'completed'));

  return (
    <div ref={scrollRef} onScroll={onScroll} className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
      <div className="flex flex-col gap-2">
        {blocks.map((block) => {
          if (block.type === 'tools') {
            return (
              <ToolGroup
                key={`tools-${block.items[0].id}`}
                items={block.items}
                repoPath={repoPath}
                live={streaming && block.lastIndex === lastIndex}
              />
            );
          }
          return (
            <TimelineRow
              key={`${block.item.kind}-${block.item.id}`}
              item={block.item}
              chatId={chatId}
              repoPath={repoPath}
              agentName={agentName}
              fallbackRun={chatTitle ? { kind: chatAction, title: chatTitle } : null}
              live={streaming && block.index === lastIndex}
              streaming={streaming}
            />
          );
        })}
        {showWorking && <StreamingIndicator agentName={agentName} />}
      </div>
    </div>
  );
}

function TimelineRow(props: {
  item: TimelineItem;
  chatId: string | null;
  repoPath: string;
  agentName: string;
  fallbackRun: RunMeta | null;
  live: boolean;
  streaming: boolean;
}) {
  const { item, chatId, repoPath, agentName, fallbackRun, live, streaming } = props;
  switch (item.kind) {
    case 'user': {
      const run = item.run ?? (!item.text && item.context.length === 0 ? (fallbackRun ?? { kind: 'chat', title: 'Run' }) : null);
      if (run) {
        return <RunHeader run={run} context={item.context} repoPath={repoPath} />;
      }
      return <UserBubble item={item} repoPath={repoPath} />;
    }
    case 'text':
      return <AgentText text={item.text} />;
    case 'thought':
      return <ThoughtBlock text={item.text} live={live} />;
    case 'tool':
      return <ToolGroup items={[item]} repoPath={repoPath} live={live} />;
    case 'plan':
      return <PlanChecklist entries={item.entries} live={streaming} />;
    case 'permission':
      return (
        <PermissionCard
          item={item}
          agentName={agentName}
          repoPath={repoPath}
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
