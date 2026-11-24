import { useEffect } from 'react';
import { useQueries, useQuery } from '@tanstack/react-query';
import * as tauri from '../../lib/tauri';
import { queryClient } from '../../lib/query-client';
import type { AgentInfo, ModelCatalog, ModelChoice, RunModel } from '../../lib/types';
import { AGENTS, getAgents, useAgents, usableAgents } from './agents';

/** Reviews read the diff; fixes edit code and answer threads. Each has its own default model. */
export type ModelPurpose = 'review' | 'fix';

export const MODEL_PURPOSES: { value: ModelPurpose; label: string; hint: string }[] = [
  { value: 'review', label: 'Reviews', hint: 'Ask to review' },
  { value: 'fix', label: 'Fixes, replies and @mentions', hint: 'Send comments, Ask on a thread, @mentions' },
];

const STALE_MS = 24 * 60 * 60 * 1000;

const refreshing = new Map<string, Promise<ModelCatalog | null>>();

/** A run's agent plus its model and effort; an unset model or effort keeps the agent's own setting. */
export interface RunPick extends RunModel {
  agent: string;
}

/** As saved: no agent means the first usable one. */
interface SavedPick extends RunModel {
  agent?: string;
}

function catalogKey(agentId: string) {
  return ['agent-models', agentId];
}

function settingKey(purpose: ModelPurpose) {
  return `agent.model.${purpose}`;
}

function repoKey(purpose: ModelPurpose, repoPath: string) {
  return `diffity-claude-model:${purpose}:${repoPath}`;
}

/** Picks saved before other agents existed have a model but no agent; they were Claude's. */
function parsePick(value: string | null | undefined): SavedPick {
  if (!value) {
    return {};
  }
  try {
    const parsed = JSON.parse(value) as SavedPick;
    const model = typeof parsed.model === 'string' ? parsed.model : undefined;
    const effort = typeof parsed.effort === 'string' ? parsed.effort : undefined;
    const known = AGENTS.some((agent) => agent.id === parsed.agent);
    const agent = known ? parsed.agent : model || effort ? 'claude' : undefined;
    return { agent, model, effort };
  } catch {
    return {};
  }
}

/** The saved pick when its agent is usable; otherwise the first usable agent with its own model. */
export function resolvePick(saved: SavedPick, agents: AgentInfo[] | undefined): RunPick {
  const usable = usableAgents(agents);
  if (saved.agent && (usable.length === 0 || usable.some((agent) => agent.id === saved.agent))) {
    return { agent: saved.agent, model: saved.model, effort: saved.effort };
  }
  return { agent: usable[0]?.id ?? AGENTS[0].id };
}

/** Keeps the pick's model only when it belongs to `agentId`. */
export function pickForAgent(pick: RunPick, agentId: string): RunPick {
  return pick.agent === agentId ? pick : { agent: agentId };
}

/** Asks the agent again for its models (a throwaway session; no tokens). */
export function refreshModelCatalog(agentId: string): Promise<ModelCatalog | null> {
  const pending = refreshing.get(agentId);
  if (pending) {
    return pending;
  }
  const next = tauri
    .agentModels(agentId, true)
    .then((catalog) => {
      queryClient.setQueryData(catalogKey(agentId), catalog);
      return catalog;
    })
    .finally(() => {
      refreshing.delete(agentId);
    });
  refreshing.set(agentId, next);
  return next;
}

function catalogQuery(agentId: string) {
  return { queryKey: catalogKey(agentId), queryFn: () => tauri.agentModels(agentId), staleTime: Infinity, retry: false };
}

/** Model lists of several agents at once, in the order given. */
export function useModelCatalogs(agentIds: string[]) {
  return useQueries({ queries: agentIds.map(catalogQuery) });
}

export function useModelCatalog(agentId: string) {
  const query = useQuery(catalogQuery(agentId));
  const fetchedAt = query.data?.fetchedAt;

  useEffect(() => {
    if (!fetchedAt || Date.now() - Date.parse(fetchedAt) < STALE_MS) {
      return;
    }
    void refreshModelCatalog(agentId).catch(() => undefined);
  }, [agentId, fetchedAt]);

  return query;
}

export function findModel(catalog: ModelCatalog | null | undefined, value: string | undefined): ModelChoice | undefined {
  if (!catalog || !value) {
    return undefined;
  }
  return catalog.models.find((model) => model.value === value);
}

/** The provider in a `provider/Name` model name (OpenCode lists models that way), else null. */
export function modelProvider(model: ModelChoice): string | null {
  const slash = model.name.indexOf('/');
  return slash > 0 ? model.name.slice(0, slash) : null;
}

const PROVIDER_NAMES: Record<string, string> = {
  anthropic: 'Anthropic',
  openai: 'OpenAI',
  'openai-codex': 'OpenAI Codex',
  'azure-openai': 'Azure OpenAI',
  google: 'Google',
  'google-vertex': 'Vertex AI',
  'amazon-bedrock': 'Bedrock',
  openrouter: 'OpenRouter',
  opencode: 'OpenCode',
  'github-copilot': 'GitHub Copilot',
  xai: 'xAI',
  deepseek: 'DeepSeek',
  mistral: 'Mistral',
  groq: 'Groq',
  cerebras: 'Cerebras',
  fireworks: 'Fireworks',
  together: 'Together',
  huggingface: 'Hugging Face',
  moonshot: 'Moonshot',
  zai: 'Z.ai',
  minimax: 'MiniMax',
  nvidia: 'NVIDIA',
  'vercel-ai-gateway': 'Vercel AI Gateway',
  'llama.cpp': 'llama.cpp',
  ollama: 'Ollama',
  lmstudio: 'LM Studio',
};

/** How a provider id reads in the picker: "OpenAI" for `openai`, else the id with its first letter raised. */
export function providerLabel(provider: string): string {
  const known = PROVIDER_NAMES[provider.toLowerCase()];
  if (known) {
    return known;
  }
  return provider.charAt(0).toUpperCase() + provider.slice(1);
}

/** A model's name without its provider: "Big Pickle" for "opencode/Big Pickle". */
export function modelName(model: ModelChoice): string {
  const provider = modelProvider(model);
  return provider ? model.name.slice(provider.length + 1) : model.name;
}

/** Whether a catalog mixes providers, so each model needs its provider shown to tell them apart. */
export function hasManyProviders(catalog: ModelCatalog): boolean {
  return new Set(catalog.models.map(modelProvider)).size > 1;
}

/** Short label like "Opus 5.5 · High"; an unset model shows the one the agent uses on its own. */
export function runModelLabel(catalog: ModelCatalog | null | undefined, runModel: RunModel, fallback = 'Default model'): string {
  const model = findModel(catalog, runModel.model) ?? findModel(catalog, catalog?.currentModel);
  const name = model ? modelName(model) : runModel.model ?? fallback;
  const effort = runModel.effort ? model?.efforts.find((item) => item.value === runModel.effort)?.name ?? runModel.effort : null;
  return effort ? `${name} · ${effort}` : name;
}

/** Keeps the effort only when the newly picked model (unset: the agent's own) takes it. */
export function withModel(catalog: ModelCatalog | null | undefined, current: RunModel, model: string | undefined): RunModel {
  const efforts = findModel(catalog, model ?? catalog?.currentModel)?.efforts ?? [];
  const effort = current.effort && efforts.some((item) => item.value === current.effort) ? current.effort : undefined;
  return { model, effort };
}

async function loadSetting(purpose: ModelPurpose): Promise<SavedPick> {
  const value = await tauri.getSetting(settingKey(purpose)).catch(() => null);
  return parsePick(value);
}

function useSavedSetting(purpose: ModelPurpose): SavedPick {
  const { data } = useQuery({ queryKey: ['setting', settingKey(purpose)], queryFn: () => loadSetting(purpose), staleTime: Infinity });
  return data ?? {};
}

/** Settings' pick for this kind of run. */
export function useModelSetting(purpose: ModelPurpose): RunPick {
  const saved = useSavedSetting(purpose);
  const { data: agents } = useAgents();
  return resolvePick(saved, agents);
}

export async function saveModelSetting(purpose: ModelPurpose, value: RunPick) {
  await tauri.setSetting(settingKey(purpose), JSON.stringify(value));
  queryClient.setQueryData(['setting', settingKey(purpose)], value);
}

function readRepoPick(purpose: ModelPurpose, repoPath: string): SavedPick | null {
  try {
    const value = localStorage.getItem(repoKey(purpose, repoPath));
    return value ? parsePick(value) : null;
  } catch {
    return null;
  }
}

/** Remembers a popover pick for this repo; Settings holds the fallback. */
export function writeRepoPick(purpose: ModelPurpose, repoPath: string, value: RunPick) {
  try {
    localStorage.setItem(repoKey(purpose, repoPath), JSON.stringify(value));
  } catch {
    return;
  }
}

/** What a run of this kind uses in this repo: the last popover pick, else Settings. */
export function useRunPick(purpose: ModelPurpose, repoPath: string): RunPick {
  const saved = useSavedSetting(purpose);
  const { data: agents } = useAgents();
  return resolvePick(readRepoPick(purpose, repoPath) ?? saved, agents);
}

export async function getRunPick(purpose: ModelPurpose, repoPath: string): Promise<RunPick> {
  const [saved, agents] = await Promise.all([
    queryClient.fetchQuery({ queryKey: ['setting', settingKey(purpose)], queryFn: () => loadSetting(purpose), staleTime: Infinity }),
    getAgents(),
  ]);
  return resolvePick(readRepoPick(purpose, repoPath) ?? saved, agents);
}

/** The agent from cached data, for messages outside React. */
export function cachedRunAgent(purpose: ModelPurpose, repoPath: string): string {
  const saved = queryClient.getQueryData<SavedPick>(['setting', settingKey(purpose)]) ?? {};
  const agents = queryClient.getQueryData<AgentInfo[]>(['agents']);
  return resolvePick(readRepoPick(purpose, repoPath) ?? saved, agents).agent;
}
