import type { AgentInfo, AgentMode } from '@/lib/types';

export const agentPathSetting = (agentId: string) => `agent.${agentId}.path`;

export function agentCli(agent: AgentInfo) {
  return agent.id;
}

export function isAgentUsable(agent: AgentInfo) {
  return agent.installed && agent.authenticated !== false;
}

export function agentHint(agent: AgentInfo): string | null {
  if (!agent.installed) {
    return agent.note ?? `Not installed. Install the \`${agentCli(agent)}\` CLI or set its path in Settings.`;
  }
  if (agent.authenticated === false) {
    return agent.note ?? `Run \`${agentCli(agent)}\` in a terminal to log in.`;
  }
  return agent.note;
}

/** Only Claude Code is supported for now; the backend reports a single agent. */
export function pickAgent(agents: AgentInfo[]) {
  return agents.find((agent) => agent.id === 'claude') ?? agents[0] ?? null;
}

export function isReadOnlyMode(mode: AgentMode) {
  return mode === 'ask' || mode === 'review';
}

export const modeLabel: Record<AgentMode, string> = {
  ask: 'Ask',
  review: 'Review',
  resolve: 'Resolve',
  edit: 'Edit',
};

export const REVIEW_FOCUSES = [
  { value: 'all', label: 'Everything' },
  { value: 'security', label: 'Security' },
  { value: 'performance', label: 'Performance' },
  { value: 'naming', label: 'Naming' },
  { value: 'errors', label: 'Error handling' },
  { value: 'types', label: 'Types' },
  { value: 'logic', label: 'Logic' },
] as const;
