import { describe, expect, it } from 'vitest';
import { sharedPrefix } from '../src/features/palette/quick-open';

describe('sharedPrefix', () => {
  it('stops where the matching folders part ways', () => {
    expect(sharedPrefix(['web-roadmap', 'web-xyz', 'web-avc'])).toBe('web-');
    expect(sharedPrefix(['roadmap.sh', 'roadmap-editor'])).toBe('roadmap');
  });

  it('completes the whole name when only one matches, and ignores case like the list does', () => {
    expect(sharedPrefix(['web-roadmap'])).toBe('web-roadmap');
    expect(sharedPrefix(['Web-app', 'web-api'])).toBe('Web-ap');
    expect(sharedPrefix([])).toBe('');
  });
});
