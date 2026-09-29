import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import * as tauri from '../../lib/tauri';
import { queryClient } from '../../lib/query-client';
import type { AgentAction, AgentMode } from '../../lib/types';

export type PermissionSetting = 'skip' | 'askOnce' | 'askEach';

export const PERMISSIONS_KEY = 'agent.permissions';
const QUERY_KEY = ['setting', PERMISSIONS_KEY];
const NOTICE_KEY = 'diffity.bypass-notice-seen';

export const PERMISSION_OPTIONS: { value: PermissionSetting; label: string; hint: string }[] = [
  {
    value: 'skip',
    label: 'Skip all permission prompts',
    hint: 'Claude edits files and runs commands without asking when it fixes comments. Reviews stay read-only.',
  },
  {
    value: 'askOnce',
    label: 'Ask once per run',
    hint: 'Approve the first edit and Claude keeps going for the rest of that run. Commands still ask.',
  },
  {
    value: 'askEach',
    label: 'Ask for each edit',
    hint: 'Review every file change before it is written.',
  },
];

export function parsePermissionSetting(value: string | null | undefined): PermissionSetting {
  if (value === 'askOnce' || value === 'askEach') {
    return value;
  }
  return 'skip';
}

async function loadSetting(): Promise<PermissionSetting> {
  const value = await tauri.getSetting(PERMISSIONS_KEY).catch(() => null);
  return parsePermissionSetting(value);
}

export function usePermissionSetting(): PermissionSetting {
  const { data } = useQuery({ queryKey: QUERY_KEY, queryFn: loadSetting, staleTime: Infinity });
  return data ?? 'skip';
}

export async function getPermissionSetting(): Promise<PermissionSetting> {
  return queryClient.fetchQuery({ queryKey: QUERY_KEY, queryFn: loadSetting, staleTime: Infinity });
}

export async function savePermissionSetting(value: PermissionSetting) {
  await tauri.setSetting(PERMISSIONS_KEY, value);
  queryClient.setQueryData(QUERY_KEY, value);
}

/** Mirrors `policy::run_permissions` in crates/agents: only editing runs in a writable chat skip prompts. */
export function runSkipsPrompts(mode: AgentMode, action: AgentAction, setting: PermissionSetting): boolean {
  if (setting !== 'skip' || (mode !== 'resolve' && mode !== 'edit')) {
    return false;
  }
  return action.kind === 'chat' || action.kind === 'resolve' || action.kind === 'thread' || action.kind === 'reviewFeedback';
}

function noticeSeen(): boolean {
  try {
    return localStorage.getItem(NOTICE_KEY) === '1';
  } catch {
    return false;
  }
}

function markNoticeSeen() {
  try {
    localStorage.setItem(NOTICE_KEY, '1');
  } catch {
    // Private mode: the notice may show again, which is harmless.
  }
}

/** Shown the first time a run starts without permission prompts. */
export function showBypassNotice(openSettings: () => void) {
  if (noticeSeen()) {
    return;
  }
  markNoticeSeen();
  toast('Claude runs without permission prompts', {
    description: 'It can edit files and run commands without asking.',
    duration: 15_000,
    action: { label: 'Change in Settings', onClick: openSettings },
    cancel: { label: 'Got it', onClick: () => undefined },
  });
}
