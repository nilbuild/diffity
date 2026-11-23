import { describe, expect, it } from 'vitest';
import { pickColors } from '../src/features/welcome/project-colors';
import { projectInitials } from '../src/features/welcome/repo-badge';
import { groupColor, groupEmoji, guessEmoji } from '../src/features/groups/group-look';

describe('project colours', () => {
  it('gives every project a colour, spreading them before repeating', () => {
    const paths = Array.from({ length: 8 }, (_, index) => `/p${index}`);
    const colors = pickColors(paths, {});
    expect(new Set(paths.map((path) => colors[path])).size).toBe(8);
  });

  it('keeps colours already picked and never picks gray', () => {
    const colors = pickColors(['/a', '/b'], { '/a': 'gray' });
    expect(colors['/a']).toBe('gray');
    expect(colors['/b']).not.toBe('gray');
  });

  it('replaces a colour it no longer knows', () => {
    expect(pickColors(['/a'], { '/a': 'mauve' })['/a']).not.toBe('mauve');
  });
});

describe('project initials', () => {
  it('uses the part that tells siblings apart', () => {
    const rail = ['shop-web', 'shop-api', 'shop-admin-panel', 'diffity-app'];
    expect(projectInitials('shop-web', rail)).toBe('WE');
    expect(projectInitials('shop-admin-panel', rail)).toBe('AP');
    expect(projectInitials('diffity-app', rail)).toBe('DA');
  });

  it('falls back to plain initials for one-word names', () => {
    expect(projectInitials('axol', ['axol', 'axolotl'])).toBe('AX');
  });
});

describe('group look', () => {
  it('guesses an emoji from words in the name, not parts of words', () => {
    expect(guessEmoji('shop')).toBe('🛒');
    expect(guessEmoji('acme-payments')).toBe('💳');
    expect(guessEmoji('Docs site')).toBe('📚');
    expect(guessEmoji('build')).toBeNull();
    expect(guessEmoji('diffity')).toBeNull();
  });

  it('uses the picked emoji, and none when it was cleared', () => {
    const base = { id: 'g1', name: 'shop', paths: ['/a', '/b'] };
    expect(groupEmoji(base)).toBe('🛒');
    expect(groupEmoji({ ...base, emoji: '🚀' })).toBe('🚀');
    expect(groupEmoji({ ...base, emoji: '' })).toBeNull();
  });

  it('keeps a stable colour until one is picked', () => {
    const base = { id: 'g1', name: 'shop', paths: ['/a', '/b'] };
    expect(groupColor(base).id).toBe(groupColor({ ...base }).id);
    expect(groupColor(base).id).not.toBe('gray');
    expect(groupColor({ ...base, color: 'gray' }).id).toBe('gray');
  });
});
