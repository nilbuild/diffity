import { describe, expect, it } from 'vitest';
import { useConversations, viewKey } from '../src/features/claude/conversation';
import { setLastSent } from '../src/features/claude/composer-state';
import { messageToEdit } from '../src/features/claude/chat-send';
import { canSteer, updateQueuedMessage, useClaude, type ClaudeRun } from '../src/features/claude/claude-runner';

function run(patch: Partial<ClaudeRun>): ClaudeRun {
  return {
    id: 'r1',
    action: { kind: 'chat' },
    context: { repoPath: '/r', sessionId: 's', ref: 'work', text: 'hi', conversation: true },
    state: 'queued',
    threadIds: [],
    startedAt: null,
    commentsAdded: 0,
    onCheckout: true,
    chatId: null,
    sessionId: null,
    ref: 'work',
    newThreadIds: [],
    agentId: null,
    skipsPrompts: false,
    editsApproved: false,
    model: null,
    ...patch,
  };
}

describe('messageToEdit', () => {
  it('brings back the queued message first, then the running one, then a copy of the last', () => {
    setLastSent('/r', 'work', { key: 'm1', text: 'answered', chips: [] });
    useClaude.setState({
      runs: [run({ id: 'running', state: 'running', context: { repoPath: '/r', sessionId: 's', text: 'working on it', conversation: true } }), run({ id: 'waiting', text: undefined, context: { repoPath: '/r', sessionId: 's', text: 'next', conversation: true } } as Partial<ClaudeRun>)],
      permissions: [],
    });
    expect(messageToEdit('/r', 'work')).toMatchObject({ kind: 'queued', id: 'waiting', text: 'next' });

    useClaude.setState({ runs: [run({ id: 'running', state: 'running', context: { repoPath: '/r', sessionId: 's', text: 'working on it', conversation: true } })], permissions: [] });
    expect(messageToEdit('/r', 'work')).toMatchObject({ kind: 'running', id: 'running', text: 'working on it' });

    useClaude.setState({ runs: [], permissions: [] });
    expect(messageToEdit('/r', 'work')).toMatchObject({ kind: 'copy', id: 'm1', text: 'answered' });
    expect(messageToEdit('/r', 'abc~1..abc')).toBeNull();
  });
});

describe('editing a queued message', () => {
  it('changes it in place while it waits, and refuses once it has started', () => {
    useClaude.setState({ runs: [run({ id: 'q' })], permissions: [] });
    expect(updateQueuedMessage('q', 'new text', [{ filePath: 'a.ts' }])).toBe(true);
    expect(useClaude.getState().runs[0].context.text).toBe('new text');
    expect(useClaude.getState().runs[0].context.chips).toEqual([{ filePath: 'a.ts' }]);

    useClaude.setState({ runs: [run({ id: 'q', state: 'running' })], permissions: [] });
    expect(updateQueuedMessage('q', 'too late', [])).toBe(false);
    expect(useClaude.getState().runs[0].context.text).toBe('hi');
  });
});

describe('canSteer', () => {
  it('steers only a running turn of the chat open in the same view', () => {
    useConversations.setState({ byView: { [viewKey('/r', 'work')]: { chatId: 'c1', agentId: 'claude', editable: true, since: 0 } } });
    useClaude.setState({ runs: [run({ state: 'running', chatId: 'c1' })], permissions: [] });
    expect(canSteer('/r', 'work')).toBe(true);
    expect(canSteer('/r', 'abc~1..abc')).toBe(false);
    expect(canSteer('/other', 'work')).toBe(false);

    useClaude.setState({ runs: [run({ state: 'running', action: { kind: 'review', ref: 'work' }, context: { repoPath: '/r', sessionId: 's' } })], permissions: [] });
    expect(canSteer('/r', 'work')).toBe(false);

    useClaude.setState({ runs: [run({ state: 'queued' })], permissions: [] });
    expect(canSteer('/r', 'work')).toBe(false);

    useConversations.setState({ byView: { [viewKey('/r', 'work')]: { chatId: null, agentId: null, editable: false, since: 0 } } });
    useClaude.setState({ runs: [run({ state: 'running', chatId: 'c1' })], permissions: [] });
    expect(canSteer('/r', 'work')).toBe(false);
  });
});

describe('sameView', () => {
  it('treats a branch’s All changes and Committed only views as one chat, and nothing else', async () => {
    const { sameView } = await import('../src/features/claude/conversation');
    expect(sameView('main', 'main...HEAD')).toBe(true);
    expect(sameView('origin/main', 'origin/main...HEAD')).toBe(true);
    expect(sameView('work', 'work')).toBe(true);
    expect(sameView('work', 'staged')).toBe(false);
    expect(sameView('main', 'dev...HEAD')).toBe(false);
    expect(sameView('abc1234~1..abc1234', 'abc1234~1..abc1234...HEAD')).toBe(false);
  });
});
