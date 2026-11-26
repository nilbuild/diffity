import type { DiffFileSummary, FileStatus } from './types';
import { FIXTURE_FILES, FIXTURE_PATCH } from './mock-fixtures';

type Args = Record<string, unknown>;
type HunkState = 'staged' | 'unstaged' | 'gone';

interface MockHunk {
  header: { oldStart: number; oldCount: number; newStart: number; newCount: number; context: string };
  body: string[];
  state: HunkState;
}

interface MockFile {
  summary: DiffFileSummary;
  head: string;
  hunks: MockHunk[];
}

const HUNK_HEADER = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@(.*)$/;
/** The fixture starts with these staged, like someone who ran `git add` on them. */
const INITIALLY_STAGED = new Set(['README.md', 'config.json']);

function parseFixture(): MockFile[] {
  const sections = FIXTURE_PATCH.split(/^(?=diff --git )/m).filter(Boolean);
  return FIXTURE_FILES.map((file, index) => {
    const lines = sections[index].replace(/\n$/, '').split('\n');
    const firstHunk = lines.findIndex((line) => line.startsWith('@@'));
    const hunks: MockHunk[] = [];
    for (const line of lines.slice(firstHunk)) {
      const match = HUNK_HEADER.exec(line);
      if (match) {
        hunks.push({
          header: {
            oldStart: Number(match[1]),
            oldCount: match[2] === undefined ? 1 : Number(match[2]),
            newStart: Number(match[3]),
            newCount: match[4] === undefined ? 1 : Number(match[4]),
            context: match[5],
          },
          body: [],
          state: INITIALLY_STAGED.has(file.path) ? 'staged' : 'unstaged',
        });
        continue;
      }
      hunks[hunks.length - 1].body.push(line);
    }
    return {
      summary: { ...file, status: file.status as FileStatus },
      head: lines.slice(0, firstHunk).join('\n'),
      hunks,
    };
  });
}

const delta = (hunk: MockHunk) => hunk.header.newCount - hunk.header.oldCount;

function changedLines(lines: string[]): string {
  return lines.filter((line) => line.startsWith('+') || line.startsWith('-')).join('\n');
}

function patchTarget(patch: string): { path: string; changes: string } {
  const lines = patch.split('\n');
  const plus = lines.find((line) => line.startsWith('+++ '))?.slice(4) ?? '';
  const minus = lines.find((line) => line.startsWith('--- '))?.slice(4) ?? '';
  const raw = plus === '/dev/null' ? minus : plus;
  const start = lines.findIndex((line) => line.startsWith('@@'));
  return { path: raw.replace(/^[ab]\//, ''), changes: changedLines(lines.slice(start + 1)) };
}

/** Uncommitted changes split into staged and unstaged hunks, so Stage / Unstage / Discard change what the views show. */
export function createStagingMock(emitChanged: () => void) {
  const files = parseFixture();
  let version = 0;

  const changed = () => {
    version++;
    emitChanged();
  };

  const includes = (ref: string, state: HunkState) => {
    if (state === 'gone') {
      return false;
    }
    if (ref === 'staged') {
      return state === 'staged';
    }
    if (ref === 'unstaged') {
      return state === 'unstaged';
    }
    return true;
  };

  const statusFor = (file: MockFile, ref: string): FileStatus => {
    const isNew = file.summary.status === 'untracked';
    const anyStaged = file.hunks.some((hunk) => hunk.state === 'staged');
    if (isNew && ref !== 'unstaged' && anyStaged) {
      return 'added';
    }
    return file.summary.status;
  };

  /** Hunk headers shift by the hunks a view leaves out: Staged keeps HEAD's numbers, Unstaged the working tree's. */
  const view = (ref: string): { files: DiffFileSummary[]; patch: string; version: number } => {
    const summaries: DiffFileSummary[] = [];
    const parts: string[] = [];
    for (const file of files) {
      const kept = file.hunks.filter((hunk) => includes(ref, hunk.state));
      if (kept.length === 0) {
        continue;
      }
      let skippedDelta = 0;
      let goneDelta = 0;
      let additions = 0;
      let deletions = 0;
      const body: string[] = [];
      for (const hunk of file.hunks) {
        if (hunk.state === 'gone') {
          goneDelta += delta(hunk);
          continue;
        }
        if (!includes(ref, hunk.state)) {
          skippedDelta += delta(hunk);
          continue;
        }
        const { oldStart, oldCount, newStart, newCount, context } = hunk.header;
        const shiftedOld = ref === 'unstaged' && oldCount > 0 ? oldStart + skippedDelta : oldStart;
        const newShift = goneDelta + (ref === 'staged' ? skippedDelta : 0);
        const shiftedNew = newCount > 0 ? newStart - newShift : newStart;
        body.push(`@@ -${shiftedOld},${oldCount} +${shiftedNew},${newCount} @@${context}`, ...hunk.body);
        additions += hunk.body.filter((line) => line.startsWith('+')).length;
        deletions += hunk.body.filter((line) => line.startsWith('-')).length;
      }
      summaries.push({ ...file.summary, status: statusFor(file, ref), additions, deletions });
      parts.push([file.head, ...body].join('\n'));
    }
    return { files: summaries, patch: parts.length ? parts.join('\n') + '\n' : '', version };
  };

  const fileFor = (path: string) => {
    const file = files.find((item) => item.summary.path === path || item.summary.oldPath === path);
    if (!file) {
      throw { code: 'not_found', message: `${path} not found` };
    }
    return file;
  };

  const hunkFor = (patch: string, states: HunkState[]) => {
    const { path, changes } = patchTarget(patch);
    const file = fileFor(path);
    for (const state of states) {
      const hunk = file.hunks.find((item) => item.state === state && changedLines(item.body).includes(changes));
      if (hunk) {
        return hunk;
      }
    }
    throw { code: 'git', message: `error: patch failed: ${path}\nerror: ${path}: patch does not apply` };
  };

  const counts = () => {
    let staged = 0;
    let unstaged = 0;
    let untracked = 0;
    for (const file of files) {
      const hasStaged = file.hunks.some((hunk) => hunk.state === 'staged');
      const hasUnstaged = file.hunks.some((hunk) => hunk.state === 'unstaged');
      if (hasStaged) {
        staged++;
      }
      if (hasUnstaged && file.summary.status === 'untracked' && !hasStaged) {
        untracked++;
      } else if (hasUnstaged) {
        unstaged++;
      }
    }
    return { staged, unstaged, untracked };
  };

  const handlers: Record<string, (args: Args) => unknown> = {
    stage_hunk: (args) => {
      hunkFor(String(args.patch), ['unstaged']).state = 'staged';
      changed();
      return null;
    },
    unstage_hunk: (args) => {
      hunkFor(String(args.patch), ['staged']).state = 'unstaged';
      changed();
      return null;
    },
    revert_hunk: (args) => {
      hunkFor(String(args.patch), ['unstaged', 'staged']).state = 'gone';
      changed();
      return null;
    },
    stage_file: (args) => {
      for (const hunk of fileFor(String(args.path)).hunks) {
        if (hunk.state === 'unstaged') {
          hunk.state = 'staged';
        }
      }
      changed();
      return null;
    },
    unstage_file: (args) => {
      for (const hunk of fileFor(String(args.path)).hunks) {
        if (hunk.state === 'staged') {
          hunk.state = 'unstaged';
        }
      }
      changed();
      return null;
    },
    revert_file: (args) => {
      const ref = String(args.ref ?? 'work');
      if (ref === 'staged') {
        throw { code: 'invalid', message: 'staged changes are unstaged, not discarded' };
      }
      for (const hunk of fileFor(String(args.path)).hunks) {
        if (ref !== 'unstaged' || hunk.state === 'unstaged') {
          hunk.state = 'gone';
        }
      }
      changed();
      return null;
    },
  };

  return { view, counts, handlers };
}
