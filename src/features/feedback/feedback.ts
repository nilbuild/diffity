export type FeedbackKind = 'idea' | 'bug';

export const REPO_URL = 'https://github.com/nilbuild/diffity';
const NEW_ISSUE_URL = `${REPO_URL}/issues/new`;

/** The browser-only fallback of the backend's `send_feedback`: the matching issue template, pre-filled. */
export function feedbackUrl(kind: FeedbackKind, text: string): string {
  const params = new URLSearchParams();
  const body = text.trim();
  if (kind === 'idea') {
    params.set('template', 'feature_request.yml');
    if (body) {
      params.set('proposal', body);
    }
  } else {
    params.set('template', 'bug_report.yml');
    if (body) {
      params.set('what-happened', body);
    }
  }
  return `${NEW_ISSUE_URL}?${params.toString()}`;
}
