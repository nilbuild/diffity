import type { AgentInfo, AgentMode } from '@/lib/types';

export const DEFAULT_AGENT_SETTING = 'agent.default';
export const agentPathSetting = (agentId: string) => `agent.${agentId}.path`;

const CLI_NAMES: Record<string, string> = {
  claude: 'claude',
  'claude-code': 'claude',
  codex: 'codex',
  gemini: 'gemini',
};

export function agentCli(agent: AgentInfo) {
  return CLI_NAMES[agent.id] ?? agent.id;
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

export function pickAgent(agents: AgentInfo[], preferred: string | null, fallbackSetting: string | null) {
  const byId = (id: string | null) => (id ? agents.find((agent) => agent.id === id) : undefined);
  const candidate = byId(preferred);
  if (candidate) {
    return candidate;
  }
  const configured = byId(fallbackSetting);
  if (configured && isAgentUsable(configured)) {
    return configured;
  }
  return agents.find(isAgentUsable) ?? configured ?? agents[0] ?? null;
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
