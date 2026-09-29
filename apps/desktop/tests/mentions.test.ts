import { describe, it, expect } from 'vitest';
import { mentionsAgent } from '../src/lib/mentions';

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

describe('splitMentions', () => {
  it('splits whole-word mentions only', async () => {
    const { splitMentions } = await import('../src/lib/mentions');
    expect(splitMentions('Hey @Claude, check this')).toEqual([
      { text: 'Hey ', mention: false },
      { text: '@Claude', mention: true },
      { text: ', check this', mention: false },
    ]);
    expect(splitMentions('@claude')).toEqual([{ text: '@claude', mention: true }]);
    expect(splitMentions('bob@claude.ai and @claude_bot')).toEqual([{ text: 'bob@claude.ai and @claude_bot', mention: false }]);
  });
});
