import { describe, expect, it } from 'vitest';
import { summarizeGitOp } from '../src/lib/git-op-summary';

const fetchNoise = ['From github.com:acme/app', ...Array.from({ length: 60 }, (_, i) => ` * [new branch]      fix/b${i} -> origin/fix/b${i}`), '   1a2b3c4..5d6e7f8  main       -> origin/main', ' - [deleted]         (none)     -> origin/old'].join('\n');

describe('summarizeGitOp', () => {
  it('condenses a pull that fetched many branches', () => {
    const output = `Updating 1a2b3c4..5d6e7f8\nFast-forward\n src/a.ts | 2 +-\n 1 file changed, 1 insertion(+), 1 deletion(-)\n${fetchNoise}`;
    expect(summarizeGitOp('pull', true, output)).toBe('1 file changed, 1 insertion(+), 1 deletion(-) · 60 new branches · 1 updated · 1 pruned');
  });

  it('reports an up-to-date pull', () => {
    expect(summarizeGitOp('pull', true, 'Already up to date.')).toBe('Already up to date');
  });

  it('reports an empty fetch', () => {
    expect(summarizeGitOp('fetch', true, '')).toBe('Already up to date');
  });

  it('shows the pushed ref', () => {
    expect(summarizeGitOp('push', true, 'To github.com:acme/app\n   1a2b3c4..5d6e7f8  main -> main')).toBe('main → main');
  });

  it('keeps only the errors of a failed pull', () => {
    const output = `${fetchNoise}\nhint: Diverging branches can't be fast-forwarded.\nfatal: Not possible to fast-forward, aborting.`;
    expect(summarizeGitOp('pull', false, output)).toBe('Not possible to fast-forward, aborting.');
  });

  it('falls back to the last lines when there is no error prefix', () => {
    expect(summarizeGitOp('push', false, 'To github.com:acme/app\n ! [rejected]        main -> main (fetch first)\nUpdates were rejected')).toBe('Updates were rejected');
  });
});
