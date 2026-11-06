import type { DiffFile } from '@/lib/diff-parser';
import type { ViewedFile } from './types';
import { hashString } from './hash';

export interface ChangedSinceViewed {
  /** A snapshot of the viewed version exists, so the changes since then can be shown. */
  canDiff: boolean;
}

export interface ViewedState {
  reviewed: Set<string>;
  changed: Map<string, ChangedSinceViewed>;
  /** Marks stored with the old hash that still match: re-save them with the current one. */
  upgrade: string[];
}

const HASH_VERSION = 'v2:';

export function isLegacyHash(hash: string): boolean {
  return !hash.startsWith(HASH_VERSION);
}

/**
 * What a file's change amounts to, independent of how git happened to lay out the diff: for every line (whitespace
 * removed) how many more times it occurs after the change than before. Context lines count on both sides, so hunk
 * headers, shifted line numbers (a rebase) and "hide whitespace changes" (`git diff -w`) all leave it the same.
 */
export function fileHash(file: DiffFile): string {
  const net = new Map<string, number>();
  for (const hunk of file.hunks) {
    for (const line of hunk.lines) {
      if (line.type === 'context') {
        continue;
      }
      const key = line.content.replace(/\s+/g, '');
      net.set(key, (net.get(key) ?? 0) + (line.type === 'add' ? 1 : -1));
    }
  }
  const changes = [...net].filter(([, count]) => count !== 0).sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0));
  const parts: string[] = [file.status, file.oldPath, file.newPath];
  for (const [key, count] of changes) {
    parts.push(`${count}\t${key}`);
  }
  return HASH_VERSION + hashString(parts.join('\n'));
}

/** The hash marks were stored with before `fileHash` ignored layout and whitespace. */
export function legacyFileHash(file: DiffFile): string {
  const parts: string[] = [file.status, file.oldPath, file.newPath];
  for (const hunk of file.hunks) {
    parts.push(hunk.header);
    for (const line of hunk.lines) {
      parts.push(line.type, line.content);
    }
  }
  return hashString(parts.join('\n'));
}

/**
 * Splits stored viewed marks against the current diff: a file is viewed while its diff still matches the one marked,
 * and "changed since viewed" once it differs. Marks for files no longer in the diff count as neither. A mark saved
 * with the legacy hash counts as viewed when it matches `legacy` and is listed in `upgrade`.
 */
export function computeViewedState(entries: ViewedFile[], hashes: Map<string, string>, legacy?: Map<string, string>): ViewedState {
  const reviewed = new Set<string>();
  const changed = new Map<string, ChangedSinceViewed>();
  const upgrade: string[] = [];
  for (const entry of entries) {
    const current = hashes.get(entry.filePath);
    if (current === undefined) {
      continue;
    }
    if (current === entry.contentHash) {
      reviewed.add(entry.filePath);
      continue;
    }
    if (isLegacyHash(entry.contentHash) && legacy?.get(entry.filePath) === entry.contentHash) {
      reviewed.add(entry.filePath);
      upgrade.push(entry.filePath);
      continue;
    }
    changed.set(entry.filePath, { canDiff: !!entry.blobId });
  }
  return { reviewed, changed, upgrade };
}
