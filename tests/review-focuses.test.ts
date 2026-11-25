import { describe, expect, it } from 'vitest';
import { focusesForRepo, nameProblem, parseCustomFocuses, reviewRequest, type CustomFocus } from '../src/features/claude/review-focuses';

const perf: CustomFocus = { id: '1', name: 'Perf review', instructions: 'Use the perf-review skill.', repoPath: null };
const api: CustomFocus = { id: '2', name: 'API rules', instructions: 'Check the API guide.', repoPath: '/repo' };

describe('reviewRequest', () => {
  it('sends nothing extra when nothing is picked', () => {
    expect(reviewRequest([], [perf], '  ')).toEqual({ focus: undefined, instructions: undefined });
  });

  it('names every chip and adds custom instructions after the typed text', () => {
    expect(reviewRequest(['Security', 'Perf review'], [perf, api], 'Look at the cache.')).toEqual({
      focus: 'Security, Perf review',
      instructions: 'Look at the cache.\n\nPerf review: Use the perf-review skill.',
    });
  });

  it('sends an edited built-in chip’s instructions, named once', () => {
    const security: CustomFocus = { id: '3', name: 'Security', instructions: 'Check the auth middleware.', repoPath: null, builtIn: true };
    expect(reviewRequest(['Security'], [security, perf], '')).toEqual({
      focus: 'Security',
      instructions: 'Security: Check the auth middleware.',
    });
  });

  it('ignores a picked name whose focus was deleted', () => {
    expect(reviewRequest(['Gone'], [perf], '')).toEqual({ focus: undefined, instructions: undefined });
  });
});

describe('custom focuses', () => {
  it('shows global ones everywhere and repository ones only there', () => {
    expect(focusesForRepo([perf, api], '/other')).toEqual([perf]);
    expect(focusesForRepo([perf, api], '/repo')).toEqual([perf, api]);
  });

  it('needs a unique name', () => {
    expect(nameProblem(' ', [perf], null)).toBe('Give it a name');
    expect(nameProblem('security', [perf], null)).toBe('A focus with this name already exists');
    expect(nameProblem('perf REVIEW', [perf], null)).toBe('A focus with this name already exists');
    expect(nameProblem('Perf review', [perf], perf.id)).toBeNull();
    expect(nameProblem('Mine', [{ ...perf, name: 'Security', builtIn: true }], null)).toBeNull();
  });

  it('reads only well-formed entries', () => {
    expect(parseCustomFocuses('nope')).toEqual([]);
    expect(parseCustomFocuses(JSON.stringify([perf, { id: 3 }, { ...api, repoPath: 5 }]))).toEqual([perf, { ...api, repoPath: null }]);
  });
});
