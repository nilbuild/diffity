import type { PushResult, ReviewCandidate, ReviewEvent, ReviewVerdict } from '../../lib/types';

const GENERAL = '__general__';

export interface CandidateItem {
  id: string;
  sessionId: string;
  filePath: string;
  location: string;
  body: string;
  draft: boolean;
  /** Left in another view than the PR diff (e.g. Uncommitted changes). */
  viewLabel: string | null;
  blockedReason: string | null;
}

export function plural(count: number, word: string) {
  return `${count} ${word}${count === 1 ? '' : 's'}`;
}

function viewLabel(sessionRef: string, prRef: string | null): string | null {
  if (!sessionRef || sessionRef === prRef) {
    return null;
  }
  if (sessionRef === 'work' || sessionRef === '.') {
    return 'Uncommitted changes';
  }
  if (sessionRef === 'staged') {
    return 'Staged changes';
  }
  if (sessionRef === '__tree__') {
    return 'Files';
  }
  return sessionRef;
}

function location(filePath: string, startLine: number, endLine: number): string {
  if (filePath === GENERAL) {
    return 'General';
  }
  if (endLine === 0) {
    return 'File';
  }
  if (startLine === 0 || startLine === endLine) {
    return `L${endLine}`;
  }
  return `L${startLine}–${endLine}`;
}

export function toCandidateItems(candidates: ReviewCandidate[], prRef: string | null): CandidateItem[] {
  return candidates.map((candidate) => {
    const { thread } = candidate;
    return {
      id: thread.id,
      sessionId: thread.sessionId,
      filePath: thread.filePath,
      location: location(thread.filePath, thread.startLine, thread.endLine),
      body: thread.comments[0]?.body ?? '',
      draft: candidate.draft,
      viewLabel: viewLabel(candidate.sessionRef, prRef),
      blockedReason: candidate.blockedReason,
    };
  });
}

/** Items grouped by file (general comments first), keeping the given order inside each group. */
export function groupByFile(items: CandidateItem[]): [string, CandidateItem[]][] {
  const groups = new Map<string, CandidateItem[]>();
  for (const item of items) {
    const key = item.filePath === GENERAL ? 'General comments' : item.filePath;
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  return [...groups.entries()].sort(([a], [b]) => {
    if (a === 'General comments') {
      return -1;
    }
    if (b === 'General comments') {
      return 1;
    }
    return 0;
  });
}

/** Postable items not unchecked by the user; every postable comment (draft or local) starts checked. */
export function selectedItems(items: CandidateItem[], excluded: Set<string>): CandidateItem[] {
  return items.filter((item) => !item.blockedReason && !excluded.has(item.id));
}

/** Sessions other than the current one that hold selected drafts: their pending reviews are submitted first. */
export function otherDraftSessions(selected: CandidateItem[], sessionId: string | null): string[] {
  return [...new Set(selected.filter((item) => item.draft && item.sessionId !== sessionId).map((item) => item.sessionId))];
}

export interface DisabledInput {
  postToGitHub: boolean;
  sendClaude: boolean;
  draftCount: number;
  selectedCount: number;
  postableCount: number;
  blockedCount: number;
  hasBody: boolean;
  verdict: ReviewVerdict;
  loading: boolean;
  blocker: string | null;
  needsPendingChoice: boolean;
  claudeHasWork: boolean;
  claudeProblem: string | null;
}

/** Why the submit button is disabled (exactly what is missing), or null when it can run. */
export function disabledReason(input: DisabledInput): string | null {
  if (!input.postToGitHub) {
    if (!input.sendClaude && input.draftCount === 0) {
      return 'Choose where the review goes: GitHub, Claude, or both.';
    }
    if (input.sendClaude && !input.claudeHasWork) {
      return input.draftCount === 0 && !input.hasBody
        ? 'Add draft comments or a summary for Claude.'
        : 'None of your draft comments mention @claude.';
    }
    return input.sendClaude && input.claudeProblem ? input.claudeProblem : null;
  }
  if (input.blocker) {
    return input.blocker;
  }
  const hasVerdict = input.verdict !== 'comment';
  if (input.selectedCount === 0 && !input.hasBody && !hasVerdict) {
    if (input.loading) {
      return 'Checking which comments can be posted…';
    }
    if (input.postableCount > 0) {
      return 'Select at least one comment, add a summary, or choose Approve or Request changes.';
    }
    if (input.blockedCount > 0) {
      return 'None of your comments can be posted to the PR (see why above). Add a summary, or choose Approve or Request changes.';
    }
    return 'No comments to post yet. Comment on the diff, add a summary, or choose Approve or Request changes.';
  }
  if (input.needsPendingChoice) {
    return 'Choose what to do with your pending review on GitHub.';
  }
  if (input.sendClaude && input.claudeProblem) {
    return input.claudeProblem;
  }
  return null;
}

export function headerLine(selectedCount: number, blockedCount: number, loading: boolean): string {
  if (loading) {
    return 'Checking your comments…';
  }
  const parts: string[] = [];
  parts.push(selectedCount > 0 ? `${plural(selectedCount, 'comment')} will be posted` : 'No comments selected');
  if (blockedCount > 0) {
    parts.push(`${blockedCount} can't be posted`);
  }
  return parts.join(' · ');
}

export const VERDICT_EVENT: Record<ReviewVerdict, ReviewEvent> = {
  comment: 'COMMENT',
  approve: 'APPROVE',
  requestChanges: 'REQUEST_CHANGES',
};

export function postLabel(prNumber: number, verdict: ReviewVerdict, selectedCount: number): string {
  if (verdict === 'approve') {
    return `Approve #${prNumber}`;
  }
  if (verdict === 'requestChanges') {
    return `Request changes on #${prNumber}`;
  }
  return selectedCount > 0 ? `Post ${plural(selectedCount, 'comment')} to #${prNumber}` : `Post review to #${prNumber}`;
}

/** Toast after a push: "Posted 3 comments to #145", plus what was skipped. */
export function postedToast(prNumber: number, verdict: ReviewVerdict, result: PushResult): { title: string; description?: string } {
  const count = result.dryRun ? result.pushed : result.postedThreadIds?.length ?? result.pushed;
  const skipped = result.errors.length > 0 ? result.errors.join('\n') : undefined;
  if (result.dryRun) {
    return {
      title: `Dry run: ${plural(count, 'comment')} for #${prNumber} not sent`,
      description: ['The GitHub payload is in the terminal log (DIFFITY_GITHUB_DRY_RUN=1).', skipped].filter(Boolean).join('\n'),
    };
  }
  let title = count > 0 ? `Posted ${plural(count, 'comment')} to #${prNumber}` : `Posted review to #${prNumber}`;
  if (verdict === 'approve') {
    title = count > 0 ? `Approved #${prNumber} with ${plural(count, 'comment')}` : `Approved #${prNumber}`;
  }
  if (verdict === 'requestChanges') {
    title = count > 0 ? `Requested changes on #${prNumber} with ${plural(count, 'comment')}` : `Requested changes on #${prNumber}`;
  }
  return { title, description: skipped };
}
