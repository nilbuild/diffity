import { useQuery } from '@tanstack/react-query';
import * as tauri from '../../lib/tauri';
import { queryClient } from '../../lib/query-client';
import type { AgentInfo } from '../../lib/types';

export interface AgentMeta {
  id: string;
  /** Product name, e.g. "Claude Code". */
  name: string;
  /** Name in running text, e.g. "Claude is reviewing". */
  short: string;
  /** Mention handle without the `@`. */
  handle: string;
  install: string;
  login: string;
  /** What a custom binary path may point to. */
  pathHint: string;
}

/** Mirrors `AgentKind::ENABLED` and `AGENT_HANDLES` in src-tauri; the order is the fallback order. */
export const AGENTS: AgentMeta[] = [
  {
    id: 'claude',
    name: 'Claude Code',
    short: 'Claude',
    handle: 'claude',
    install: 'npm i -g @anthropic-ai/claude-code',
    login: 'Run `claude` in a terminal to log in.',
    pathHint: 'Point to the claude CLI or claude-agent-acp.',
  },
  {
    id: 'codex',
    name: 'Codex',
    short: 'Codex',
    handle: 'codex',
    install: 'npm i -g @openai/codex',
    login: 'Run `codex login` in a terminal to sign in.',
    pathHint: 'Point to the codex CLI or codex-acp.',
  },
  {
    id: 'opencode',
    name: 'opencode',
    short: 'opencode',
    handle: 'opencode',
    install: 'npm i -g @opencode/cli',
    login: 'Run `opencode auth login` in a terminal to sign in.',
    pathHint: 'Point to the opencode CLI.',
  },
];

const AGENTS_KEY = ['agents'];

export function agentMeta(id: string | null | undefined): AgentMeta {
  return AGENTS.find((agent) => agent.id === id) ?? AGENTS[0];
}

/** The agent that wrote a comment, from its author name ("Codex"). */
export function agentByName(name: string | null | undefined): AgentMeta | undefined {
  return AGENTS.find((agent) => agent.name === name || agent.short === name);
}

export function isReady(agent: AgentInfo | undefined): boolean {
  return !!agent && agent.installed && agent.authenticated !== false;
}

/** Ready agents first, then installed ones, in fallback order. Empty when none is installed. */
export function usableAgents(agents: AgentInfo[] | undefined): AgentMeta[] {
  const info = (meta: AgentMeta) => agents?.find((agent) => agent.id === meta.id);
  const ready = AGENTS.filter((meta) => isReady(info(meta)));
  const installed = AGENTS.filter((meta) => info(meta)?.installed && !ready.includes(meta));
  return [...ready, ...installed];
}

export function useAgents() {
  return useQuery({ queryKey: AGENTS_KEY, queryFn: () => tauri.listAgents(), staleTime: 30_000 });
}

export function getAgents(): Promise<AgentInfo[]> {
  return queryClient.fetchQuery({ queryKey: AGENTS_KEY, queryFn: () => tauri.listAgents(), staleTime: 30_000 });
}

/** Installed agents, in fallback order. Grouping and agent names only matter with two or more. */
export function useInstalledAgents(): AgentMeta[] {
  const { data: agents } = useAgents();
  return AGENTS.filter((meta) => agents?.some((agent) => agent.id === meta.id && agent.installed));
}
