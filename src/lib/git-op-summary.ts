export type GitOp = 'fetch' | 'pull' | 'push';

const REF_LINE = /^\s*[*+\-t!= ]?\s*(\[[^\]]+\]|[0-9a-f]+\.{2,3}[0-9a-f]+)\s+(\S+)\s+->\s+(\S+)/;
const STAT_LINE = /^\s*\d+ files? changed/;
const UP_TO_DATE = /^(Already up to date|Everything up-to-date)/i;
const ERROR_LINE = /^(fatal|error):\s*/i;
const MAX_ERROR_LINES = 2;

interface RefCounts {
  newBranches: number;
  newTags: number;
  updated: number;
  pruned: number;
  arrows: string[];
}

function countRefs(lines: string[]): RefCounts {
  const counts: RefCounts = { newBranches: 0, newTags: 0, updated: 0, pruned: 0, arrows: [] };
  for (const line of lines) {
    const match = REF_LINE.exec(line);
    if (!match) {
      continue;
    }
    const [, kind, from, to] = match;
    if (kind === '[up to date]' || kind.startsWith('[rejected')) {
      continue;
    }
    counts.arrows.push(`${from} → ${to}`);
    if (kind === '[new branch]') {
      counts.newBranches++;
    } else if (kind === '[new tag]') {
      counts.newTags++;
    } else if (kind === '[deleted]') {
      counts.pruned++;
    } else {
      counts.updated++;
    }
  }
  return counts;
}

function plural(count: number, word: string) {
  return `${count} ${word}${count === 1 ? '' : word.endsWith('ch') ? 'es' : 's'}`;
}

function refParts(counts: RefCounts) {
  const parts: string[] = [];
  if (counts.newBranches) {
    parts.push(plural(counts.newBranches, 'new branch'));
  }
  if (counts.newTags) {
    parts.push(plural(counts.newTags, 'new tag'));
  }
  if (counts.updated) {
    parts.push(`${counts.updated} updated`);
  }
  if (counts.pruned) {
    parts.push(`${counts.pruned} pruned`);
  }
  return parts;
}

function summarizeSuccess(op: GitOp, lines: string[]) {
  const counts = countRefs(lines);
  if (op === 'push') {
    if (counts.arrows.length === 1) {
      return counts.arrows[0];
    }
    const parts = refParts(counts);
    return parts.length ? parts.join(' · ') : 'Everything up to date';
  }
  const parts: string[] = [];
  const stat = lines.find((line) => STAT_LINE.test(line));
  if (stat) {
    parts.push(stat.trim());
  } else if (op === 'pull' && lines.some((line) => UP_TO_DATE.test(line.trim()))) {
    parts.push('Already up to date');
  }
  parts.push(...refParts(counts));
  return parts.length ? parts.join(' · ') : 'Already up to date';
}

function summarizeFailure(lines: string[]) {
  const errors = lines.filter((line) => ERROR_LINE.test(line)).map((line) => line.replace(ERROR_LINE, ''));
  if (errors.length) {
    return errors.slice(0, MAX_ERROR_LINES).join('\n');
  }
  const rest = lines.filter((line) => !REF_LINE.test(line) && !/^(hint|remote|From|To)\b/.test(line));
  return rest.slice(-MAX_ERROR_LINES).join('\n') || undefined;
}

/** Condenses fetch/pull/push output into a line short enough for a toast. */
export function summarizeGitOp(op: GitOp, ok: boolean, output: string): string | undefined {
  const lines = output.split('\n').map((line) => line.trimEnd()).filter((line) => line.trim());
  if (ok) {
    return summarizeSuccess(op, lines);
  }
  return summarizeFailure(lines);
}
