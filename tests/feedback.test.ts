import { describe, expect, it } from 'vitest';
import { feedbackUrl } from '../src/features/feedback/feedback';

describe('feedbackUrl', () => {
  it('fills the feature request for an idea', () => {
    expect(feedbackUrl('idea', '  Stage with S ')).toBe('https://github.com/nilbuild/diffity/issues/new?template=feature_request.yml&proposal=Stage+with+S');
  });

  it('fills the bug report for a bug, escaping the text', () => {
    expect(feedbackUrl('bug', 'Crash & burn')).toBe('https://github.com/nilbuild/diffity/issues/new?template=bug_report.yml&what-happened=Crash+%26+burn');
  });
});
