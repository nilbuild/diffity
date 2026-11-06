import { describe, expect, it, vi } from 'vitest';

vi.mock('../src/lib/tauri', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/lib/tauri')>()),
  listAgents: async () => [],
}));

const { canRunAgain, rememberRun, runAgain, useClaude } = await import('../src/features/claude/claude-runner');

describe('runAgain', () => {
  it('queues the same action with the same threads, note and model', () => {
    const action = { kind: 'resolve' as const, threadIds: ['t1', 't2'], note: 'keep the API' };
    const context = { repoPath: '/again', sessionId: 's1', pick: { agent: 'codex', model: 'gpt-5', effort: 'high' } };
    rememberRun('run-old', action, context);
    expect(canRunAgain('run-old')).toBe(true);
    expect(runAgain('run-old')).toBe(true);
    const run = useClaude.getState().runs.find((item) => item.context.repoPath === '/again');
    expect(run?.action).toEqual(action);
    expect(run?.context).toEqual(context);
    expect(run?.threadIds).toEqual(['t1', 't2']);
  });

  it('does nothing for a run it never saw', () => {
    expect(canRunAgain('run-unknown')).toBe(false);
    expect(runAgain('run-unknown')).toBe(false);
  });
});
