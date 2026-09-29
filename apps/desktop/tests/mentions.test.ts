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
