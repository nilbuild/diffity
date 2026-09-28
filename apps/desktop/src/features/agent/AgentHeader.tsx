import { useRef, useState } from 'react';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import type { AgentInfo, Chat } from '@/lib/types';
import { cn } from '@/lib/cn';
import { agentHint, isAgentUsable, modeLabel } from './agents';
import type { UiMode } from './agent-store';
import { HistoryIcon, PlusIcon, TrashIcon, XIcon } from '@/components/ui/icon';
import { Badge } from '@/components/ui/Badge';
import { IconButton } from '@/components/ui/IconButton';
import { MenuList } from '@/components/ui/Menu';
import { Popover } from '@/components/ui/Popover';
import { SegmentedToggle } from '@/components/ui/SegmentedToggle';
import { Spinner } from '@/components/ui/Spinner';

dayjs.extend(relativeTime);

export interface AgentHeaderProps {
  agents: AgentInfo[];
  agentsLoading: boolean;
  agent: AgentInfo | null;
  uiMode: UiMode;
  onModeChange: (mode: UiMode) => void;
  chats: Chat[];
  activeChatId: string | null;
  onSelectChat: (chatId: string) => void;
  onDeleteChat: (chatId: string) => void;
  onNewChat: () => void;
  onClose: () => void;
}

function AgentLabel(props: Pick<AgentHeaderProps, 'agentsLoading' | 'agent'>) {
  const { agentsLoading, agent } = props;
  const usable = agent ? isAgentUsable(agent) : false;
  const title = agent ? (usable ? (agent.binaryPath ?? agent.name) : (agentHint(agent) ?? agent.name)) : undefined;
  return (
    <div className="flex h-7 items-center gap-1.5 px-2 text-sm font-medium" title={title}>
      {agentsLoading && <Spinner size={12} />}
      {agent && (
        <span className={cn('h-1.5 w-1.5 rounded-full', usable ? 'bg-success' : 'bg-warning')} aria-hidden />
      )}
      <span className="truncate">{agent?.name ?? (agentsLoading ? 'Loading…' : 'Claude Code')}</span>
      {agent && !agent.installed && <Badge>Not installed</Badge>}
      {agent?.installed && agent.authenticated === false && <Badge tone="warning">Logged out</Badge>}
    </div>
  );
}

function ChatHistory(
  props: Pick<AgentHeaderProps, 'chats' | 'activeChatId' | 'onSelectChat' | 'onDeleteChat' | 'agents'>,
) {
  const { chats, activeChatId, onSelectChat, onDeleteChat, agents } = props;
  const [open, setOpen] = useState(false);
  const anchorRef = useRef<HTMLButtonElement>(null);

  return (
    <>
      <IconButton ref={anchorRef} label="Chat history" active={open} onClick={() => setOpen((value) => !value)}>
        <HistoryIcon size={16} />
      </IconButton>
      <Popover open={open} onOpenChange={setOpen} anchorRef={anchorRef} align="end" className="max-h-[360px] w-[300px] overflow-auto">
        <MenuList>
          {chats.length === 0 && <div className="px-2 py-3 text-center text-xs text-fg-subtle">No chats yet</div>}
          {chats.map((chat) => {
            const agentName = agents.find((agent) => agent.id === chat.agentId)?.name ?? chat.agentId;
            return (
              <div
                key={chat.id}
                className={cn('group flex items-center gap-1 rounded-sm hover:bg-hover', chat.id === activeChatId && 'bg-accent-soft hover:bg-accent-soft')}
              >
                <button
                  type="button"
                  className="min-w-0 flex-1 cursor-default px-2 py-1.5 text-left"
                  onClick={() => {
                    onSelectChat(chat.id);
                    setOpen(false);
                  }}
                >
                  <div className="truncate text-sm text-fg">{chat.title || 'Untitled chat'}</div>
                  <div className="mt-0.5 flex items-center gap-1.5 text-2xs text-fg-subtle">
                    <span>{agentName}</span>·<span>{modeLabel[chat.mode]}</span>·<span>{dayjs(chat.updatedAt).fromNow()}</span>
                  </div>
                </button>
                <IconButton
                  size="sm"
                  label="Delete chat"
                  className="mr-1 opacity-0 group-hover:opacity-100"
                  onClick={() => onDeleteChat(chat.id)}
                >
                  <TrashIcon size={14} />
                </IconButton>
              </div>
            );
          })}
        </MenuList>
      </Popover>
    </>
  );
}

export function AgentHeader(props: AgentHeaderProps) {
  const { uiMode, onModeChange, onNewChat, onClose } = props;
  return (
    <div className="flex h-10 shrink-0 items-center gap-1 border-b border-border px-2">
      <AgentLabel agentsLoading={props.agentsLoading} agent={props.agent} />
      <SegmentedToggle
        size="sm"
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
          <PlusIcon size={16} />
        </IconButton>
        <IconButton label="Close panel" onClick={onClose}>
          <XIcon size={16} />
        </IconButton>
      </div>
    </div>
  );
}
