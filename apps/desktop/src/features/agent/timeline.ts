import type {
  AgentEvent,
  ChatMessage,
  ContextChip,
  PermissionDiff,
  PermissionOption,
  PlanEntry,
  UserMessageContent,
} from '@/lib/types';

export type PermissionState = 'pending' | 'answered' | 'denied' | 'expired';

export type TimelineItem =
  | { kind: 'user'; id: string; text: string; context: ContextChip[] }
  | { kind: 'text'; id: string; text: string }
  | { kind: 'thought'; id: string; text: string }
  | { kind: 'tool'; id: string; title: string; toolKind: string; status: string; locations: string[] }
  | { kind: 'plan'; id: string; entries: PlanEntry[] }
  | {
      kind: 'permission';
      id: string;
      title: string;
      options: PermissionOption[];
      diff?: PermissionDiff;
      state: PermissionState;
      chosen?: string;
    }
  | { kind: 'error'; id: string; message: string }
  | { kind: 'done'; id: string; stopReason: string }
  | { kind: 'note'; id: string; text: string };

let seq = 0;
export const localId = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${++seq}`;

function lastTurnStart(items: TimelineItem[]) {
  for (let i = items.length - 1; i >= 0; i--) {
    if (items[i].kind === 'user') {
      return i;
    }
  }
  return 0;
}

export function applyEvent(items: TimelineItem[], event: AgentEvent): TimelineItem[] {
  switch (event.type) {
    case 'text': {
      const index = items.findIndex((item) => item.kind === 'text' && item.id === event.messageId);
      if (index === -1) {
        return [...items, { kind: 'text', id: event.messageId, text: event.delta }];
      }
      const current = items[index] as Extract<TimelineItem, { kind: 'text' }>;
      const next = items.slice();
      next[index] = { ...current, text: current.text + event.delta };
      return next;
    }
    case 'thought': {
      const last = items[items.length - 1];
      if (last && last.kind === 'thought') {
        return [...items.slice(0, -1), { ...last, text: last.text + event.delta }];
      }
      return [...items, { kind: 'thought', id: localId('thought'), text: event.delta }];
    }
    case 'toolCall': {
      const index = items.findIndex((item) => item.kind === 'tool' && item.id === event.id);
      const tool: TimelineItem = {
        kind: 'tool',
        id: event.id,
        title: event.title,
        toolKind: event.kind,
        status: event.status,
        locations: event.locations,
      };
      if (index === -1) {
        return [...items, tool];
      }
      const next = items.slice();
      next[index] = tool;
      return next;
    }
    case 'toolCallUpdate': {
      const index = items.findIndex((item) => item.kind === 'tool' && item.id === event.id);
      if (index === -1) {
        return [
          ...items,
          { kind: 'tool', id: event.id, title: event.title ?? 'Tool call', toolKind: 'other', status: event.status, locations: [] },
        ];
      }
      const current = items[index] as Extract<TimelineItem, { kind: 'tool' }>;
      const next = items.slice();
      next[index] = { ...current, status: event.status, title: event.title ?? current.title };
      return next;
    }
    case 'plan': {
      const start = lastTurnStart(items);
      const index = items.findIndex((item, i) => i >= start && item.kind === 'plan');
      if (index === -1) {
        return [...items, { kind: 'plan', id: localId('plan'), entries: event.entries }];
      }
      const next = items.slice();
      next[index] = { ...(items[index] as Extract<TimelineItem, { kind: 'plan' }>), entries: event.entries };
      return next;
    }
    case 'permissionRequest': {
      return [
        ...items,
        {
          kind: 'permission',
          id: event.requestId,
          title: event.title,
          options: event.options,
          diff: event.diff,
          state: 'pending',
        },
      ];
    }
    case 'done': {
      return [...expirePermissions(items), { kind: 'done', id: localId('done'), stopReason: event.stopReason }];
    }
    case 'error': {
      return [...expirePermissions(items), { kind: 'error', id: localId('error'), message: event.message }];
    }
  }
}

export function expirePermissions(items: TimelineItem[]): TimelineItem[] {
  if (!items.some((item) => item.kind === 'permission' && item.state === 'pending')) {
    return items;
  }
  return items.map((item) => {
    if (item.kind !== 'permission' || item.state !== 'pending') {
      return item;
    }
    return { ...item, state: 'expired' };
  });
}

function isUserContent(content: ChatMessage['content']): content is UserMessageContent {
  return !Array.isArray(content);
}

export function timelineFromMessages(messages: ChatMessage[]): TimelineItem[] {
  let items: TimelineItem[] = [];
  for (const message of messages) {
    if (isUserContent(message.content)) {
      items = [
        ...items,
        { kind: 'user', id: message.id, text: message.content.text, context: message.content.context ?? [] },
      ];
      continue;
    }
    for (const event of message.content) {
      items = applyEvent(items, event);
    }
  }
  return expirePermissions(items);
}
