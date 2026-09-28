import { useState } from 'react';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import type { AgentInfo, Chat } from '@/lib/types';
import { cn } from '@/lib/cn';
import { agentHint, isAgentUsable, modeLabel } from './agents';
import type { UiMode } from './agent-store';
import { IconChevronDown, IconHistory, IconPlus, IconTrash, IconX } from './icons';
import { Badge, IconButton, MenuItem, Popover, SegmentedControl, Spinner } from './primitives';

dayjs.extend(relativeTime);

export interface AgentHeaderProps {
  agents: AgentInfo[];
  agentsLoading: boolean;
  agent: AgentInfo | null;
  onSelectAgent: (agentId: string) => void;
  uiMode: UiMode;
  onModeChange: (mode: UiMode) => void;
  chats: Chat[];
  activeChatId: string | null;
  onSelectChat: (chatId: string) => void;
  onDeleteChat: (chatId: string) => void;
  onNewChat: () => void;
  onClose: () => void;
}

function AgentPicker(props: Pick<AgentHeaderProps, 'agents' | 'agentsLoading' | 'agent' | 'onSelectAgent'>) {
  const { agents, agentsLoading, agent, onSelectAgent } = props;
  const [open, setOpen] = useState(false);

  const trigger = (
    <button
      type="button"
      onClick={() => setOpen((value) => !value)}
      className="flex h-7 items-center gap-1.5 rounded-md px-2 text-[13px] font-medium hover:bg-bg-muted"
    >
      {agentsLoading && <Spinner size={12} />}
      {agent && (
        <span
          className={cn('h-1.5 w-1.5 rounded-full', isAgentUsable(agent) ? 'bg-success' : 'bg-warning')}
          aria-hidden
        />
      )}
      <span className="max-w-[120px] truncate">{agent?.name ?? (agentsLoading ? 'Loading…' : 'No agents')}</span>
      <IconChevronDown size={12} className="text-fg-subtle" />
    </button>
  );

  return (
    <Popover open={open} onOpenChange={setOpen} trigger={trigger} className="w-[260px]">
      {agents.length === 0 && <div className="px-2 py-1.5 text-xs text-fg-subtle">No agents detected</div>}
      {agents.map((item) => {
        const usable = isAgentUsable(item);
        return (
          <MenuItem
            key={item.id}
            active={item.id === agent?.id}
            disabled={!usable}
            hint={usable ? item.binaryPath : agentHint(item)}
            onSelect={() => {
              onSelectAgent(item.id);
              setOpen(false);
            }}
          >
            <span className="flex items-center gap-2">
              {item.name}
              {!item.installed && <Badge>Not installed</Badge>}
              {item.installed && item.authenticated === false && <Badge tone="warning">Logged out</Badge>}
            </span>
          </MenuItem>
        );
      })}
    </Popover>
  );
}

function ChatHistory(
  props: Pick<AgentHeaderProps, 'chats' | 'activeChatId' | 'onSelectChat' | 'onDeleteChat' | 'agents'>,
) {
  const { chats, activeChatId, onSelectChat, onDeleteChat, agents } = props;
  const [open, setOpen] = useState(false);

  const trigger = (
    <IconButton label="Chat history" active={open} onClick={() => setOpen((value) => !value)}>
      <IconHistory />
    </IconButton>
  );

  return (
    <Popover open={open} onOpenChange={setOpen} trigger={trigger} align="end" className="max-h-[360px] w-[300px] overflow-auto">
      {chats.length === 0 && <div className="px-2 py-3 text-center text-xs text-fg-subtle">No chats yet</div>}
      {chats.map((chat) => {
        const agentName = agents.find((agent) => agent.id === chat.agentId)?.name ?? chat.agentId;
        return (
          <div
            key={chat.id}
            className={cn(
              'group flex items-center gap-1 rounded-md hover:bg-bg-muted',
              chat.id === activeChatId && 'bg-accent-subtle',
            )}
          >
            <button
              type="button"
              className="min-w-0 flex-1 px-2 py-1.5 text-left"
              onClick={() => {
                onSelectChat(chat.id);
                setOpen(false);
              }}
            >
              <div className="truncate text-xs">{chat.title || 'Untitled chat'}</div>
              <div className="mt-0.5 flex items-center gap-1.5 text-[10.5px] text-fg-subtle">
                <span>{agentName}</span>·<span>{modeLabel[chat.mode]}</span>·<span>{dayjs(chat.updatedAt).fromNow()}</span>
              </div>
            </button>
            <IconButton
              label="Delete chat"
              className="mr-1 h-6 w-6 opacity-0 group-hover:opacity-100"
              onClick={() => onDeleteChat(chat.id)}
            >
              <IconTrash size={12} />
            </IconButton>
          </div>
        );
      })}
    </Popover>
  );
}

export function AgentHeader(props: AgentHeaderProps) {
  const { uiMode, onModeChange, onNewChat, onClose } = props;
  return (
    <div className="flex h-10 shrink-0 items-center gap-1 border-b border-border px-2">
      <AgentPicker
        agents={props.agents}
        agentsLoading={props.agentsLoading}
        agent={props.agent}
        onSelectAgent={props.onSelectAgent}
      />
      <SegmentedControl
        className="ml-1"
        value={uiMode}
        onChange={onModeChange}
        options={[
          { value: 'ask', label: 'Ask', title: 'Read-only: the agent can read code and leave comments' },
          { value: 'edit', label: 'Edit', title: 'The agent may edit files (each write asks for approval)' },
        ]}
      />
      <div className="ml-auto flex items-center">
        <ChatHistory
          chats={props.chats}
          activeChatId={props.activeChatId}
          onSelectChat={props.onSelectChat}
          onDeleteChat={props.onDeleteChat}
          agents={props.agents}
        />
        <IconButton label="New chat" onClick={onNewChat}>
          <IconPlus />
        </IconButton>
        <IconButton label="Close panel" onClick={onClose}>
          <IconX />
        </IconButton>
      </div>
    </div>
  );
}
