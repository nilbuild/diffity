import { describe, it, expect } from 'vitest';
import { agentOfComments } from '../src/features/claude/claude-runner';
import { hasManyProviders, modelName, modelProvider, pickForAgent, providerLabel, resolvePick, runModelLabel } from '../src/features/claude/model-setting';

const user = (body: string) => ({ authorType: 'user', authorName: 'You', body });
const agent = (name: string) => ({ authorType: 'agent', authorName: name, body: 'Done.' });
const info = (id: string, installed: boolean, authenticated: boolean | null = true) => ({ id, name: id, installed, binaryPath: null, authenticated, note: null });

describe('agentOfComments', () => {
  it('follows the newest mention or agent reply', () => {
    expect(agentOfComments([user('@codex why?')])).toBe('codex');
    expect(agentOfComments([user('@codex why?'), agent('Codex'), user('and this?')])).toBe('codex');
    expect(agentOfComments([user('@codex why?'), agent('Codex'), user('@claude second opinion')])).toBe('claude');
    expect(agentOfComments([agent('Claude Code'), user('thanks')])).toBe('claude');
    expect(agentOfComments([user('plain comment')])).toBe(null);
    expect(agentOfComments([user('@opencode why?'), agent('OpenCode'), user('and this?')])).toBe('opencode');
  });
});

describe('resolvePick', () => {
  it('keeps a usable saved agent, else falls back to the first usable one', () => {
    expect(resolvePick({ agent: 'codex', model: 'gpt' }, [info('claude', true), info('codex', true)])).toEqual({ agent: 'codex', model: 'gpt', effort: undefined });
    expect(resolvePick({ agent: 'claude', model: 'opus' }, [info('claude', false), info('codex', true)])).toEqual({ agent: 'codex' });
    expect(resolvePick({}, [info('claude', true, false), info('codex', true)])).toEqual({ agent: 'codex' });
    expect(resolvePick({}, [info('claude', true), info('codex', true)])).toEqual({ agent: 'claude' });
    expect(resolvePick({ agent: 'codex' }, [])).toEqual({ agent: 'codex', model: undefined, effort: undefined });
    expect(resolvePick({}, [])).toEqual({ agent: 'claude' });
  });

  it('drops the model when another agent takes the run', () => {
    expect(pickForAgent({ agent: 'claude', model: 'opus' }, 'codex')).toEqual({ agent: 'codex' });
    expect(pickForAgent({ agent: 'claude', model: 'opus' }, 'claude')).toEqual({ agent: 'claude', model: 'opus' });
  });
});

describe('model names', () => {
  const choice = (value: string, name: string) => ({ value, name, efforts: [] });
  const catalog = (...models: ReturnType<typeof choice>[]) => ({ models, currentModel: models[0]?.value ?? null, fetchedAt: '' });

  it('drops the provider from OpenCode-style names', () => {
    expect(modelName(choice('opencode/big-pickle', 'opencode/Big Pickle'))).toBe('Big Pickle');
    expect(modelProvider(choice('opencode/big-pickle', 'opencode/Big Pickle'))).toBe('opencode');
    expect(modelName(choice('opus', 'Opus 5.5'))).toBe('Opus 5.5');
    expect(modelProvider(choice('opus', 'Opus 5.5'))).toBe(null);
    expect(runModelLabel(catalog(choice('opencode/big-pickle', 'opencode/Big Pickle')), { model: 'opencode/big-pickle' })).toBe('Big Pickle');
  });

  it('reads pi model names the same way and names providers properly', () => {
    const opus = choice('anthropic/claude-opus-5-5', 'anthropic/Claude Opus 5.5');
    expect(modelName(opus)).toBe('Claude Opus 5.5');
    expect(providerLabel(modelProvider(opus)!)).toBe('Anthropic');
    expect(providerLabel('openai')).toBe('OpenAI');
    expect(providerLabel('openrouter')).toBe('OpenRouter');
    expect(providerLabel('my-proxy')).toBe('My-proxy');
    expect(modelName(choice('openrouter/deepseek/deepseek-v4', 'openrouter/DeepSeek V4'))).toBe('DeepSeek V4');
  });

  it('needs providers shown only when a list mixes them', () => {
    expect(hasManyProviders(catalog(choice('opencode/a', 'opencode/A'), choice('opencode/b', 'opencode/B')))).toBe(false);
    expect(hasManyProviders(catalog(choice('anthropic/s', 'anthropic/Sonnet'), choice('openrouter/s', 'openrouter/Sonnet')))).toBe(true);
    expect(hasManyProviders(catalog(choice('opus', 'Opus 5.5'), choice('sonnet', 'Sonnet 5.5')))).toBe(false);
  });
});
