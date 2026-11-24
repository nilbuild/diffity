import { describe, it, expect } from 'vitest';
import { mentionedAgent, mentionsAgent } from '../src/lib/mentions';

describe('mentionsAgent', () => {
  it('matches @claude as a whole word', () => {
    expect(mentionsAgent('@claude can you check this?')).toBe(true);
    expect(mentionsAgent('Hey @Claude, thoughts')).toBe(true);
  });

  it('ignores emails, other handles and code', () => {
    expect(mentionsAgent('mail bob@claude.ai')).toBe(false);
    expect(mentionsAgent('@claude_bot')).toBe(false);
    expect(mentionsAgent('use `@claude` here')).toBe(false);
    expect(mentionsAgent('```\n@claude\n```')).toBe(false);
  });
});

describe('mentionedAgent', () => {
  it('returns the first mentioned agent outside code', () => {
    expect(mentionedAgent('@codex please look')).toBe('codex');
    expect(mentionedAgent('@Codex or @claude')).toBe('codex');
    expect(mentionedAgent('@claude then @codex')).toBe('claude');
    expect(mentionedAgent('`@claude` but @codex')).toBe('codex');
    expect(mentionedAgent('@codexx and bob@codex.dev')).toBe(null);
    expect(mentionedAgent('thoughts, @OpenCode?')).toBe('opencode');
    expect(mentionedAgent('@pi can you fix this')).toBe('pi');
    expect(mentionedAgent('@pipeline and mail@pi.dev')).toBe(null);
  });
});

describe('splitMentions', () => {
  it('splits whole-word mentions only', async () => {
    const { splitMentions } = await import('../src/lib/mentions');
    expect(splitMentions('Hey @Claude, check this')).toEqual([
      { text: 'Hey ', mention: false },
      { text: '@Claude', mention: true },
      { text: ', check this', mention: false },
    ]);
    expect(splitMentions('@claude')).toEqual([{ text: '@claude', mention: true }]);
    expect(splitMentions('@codex fix')).toEqual([{ text: '@codex', mention: true }, { text: ' fix', mention: false }]);
    expect(splitMentions('bob@claude.ai and @claude_bot')).toEqual([{ text: 'bob@claude.ai and @claude_bot', mention: false }]);
  });
});
