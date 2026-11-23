import { describe, expect, it } from 'vitest';
import { pickColors } from '../src/features/welcome/project-colors';
import { projectInitials } from '../src/features/welcome/repo-badge';

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
