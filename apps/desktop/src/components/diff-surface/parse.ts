import { parsePatchFiles } from '@pierre/diffs';
import type { ParsedFileDiff, SurfaceRange, SurfaceSide } from './types';

export function parsePatch(patch: string, cacheKeyPrefix: string): Map<string, ParsedFileDiff> {
  const result = new Map<string, ParsedFileDiff>();
  if (!patch.trim()) {
    return result;
  }
  for (const parsed of parsePatchFiles(patch, cacheKeyPrefix)) {
    for (const file of parsed.files) {
      result.set(file.name, file);
    }
  }
  return result;
}

export interface LineMaps {
  old: Map<number, string>;
  new: Map<number, string>;
}

/** Maps real file line numbers (per side) to their text for every line present in the diff. */
export function buildLineMaps(fileDiff: ParsedFileDiff): LineMaps {
  const maps: LineMaps = { old: new Map(), new: new Map() };
  for (const hunk of fileDiff.hunks) {
    let oldLine = hunk.deletionStart;
    let newLine = hunk.additionStart;
    for (const block of hunk.hunkContent) {
      if (block.type === 'context') {
        for (let i = 0; i < block.lines; i++) {
          maps.old.set(oldLine++, stripNewline(fileDiff.deletionLines[block.deletionLineIndex + i]));
          maps.new.set(newLine++, stripNewline(fileDiff.additionLines[block.additionLineIndex + i]));
        }
        continue;
      }
      for (let i = 0; i < block.deletions; i++) {
        maps.old.set(oldLine++, stripNewline(fileDiff.deletionLines[block.deletionLineIndex + i]));
      }
      for (let i = 0; i < block.additions; i++) {
        maps.new.set(newLine++, stripNewline(fileDiff.additionLines[block.additionLineIndex + i]));
      }
    }
  }
  return maps;
}

function stripNewline(line: string | undefined): string {
  if (line === undefined) {
    return '';
  }
  return line.replace(/\r?\n$/, '');
}

export function snippetFor(maps: LineMaps, range: SurfaceRange): string {
  const lines: string[] = [];
  const map = maps[range.side];
  for (let line = range.start; line <= range.end; line++) {
    const text = map.get(line);
    if (text !== undefined) {
      lines.push(text);
    }
  }
  return lines.join('\n');
}

export function rangeExists(maps: LineMaps, side: SurfaceSide, start: number, end: number): boolean {
  return maps[side].has(end) && maps[side].has(start);
}

export interface HunkInfo {
  index: number;
  header: string;
  oldStart: number;
  oldEnd: number;
  newStart: number;
  newEnd: number;
  firstChange: { side: SurfaceSide; line: number };
}

export function listHunks(fileDiff: ParsedFileDiff): HunkInfo[] {
  return fileDiff.hunks.map((hunk, index) => {
    let firstChange: HunkInfo['firstChange'] = { side: 'new', line: hunk.additionStart };
    let oldLine = hunk.deletionStart;
    let newLine = hunk.additionStart;
    for (const block of hunk.hunkContent) {
      if (block.type === 'context') {
        oldLine += block.lines;
        newLine += block.lines;
        continue;
      }
      firstChange = block.additions > 0 ? { side: 'new', line: newLine } : { side: 'old', line: oldLine };
      break;
    }
    return {
      index,
      header: `@@ -${hunk.deletionStart},${hunk.deletionCount} +${hunk.additionStart},${hunk.additionCount} @@`,
      oldStart: hunk.deletionStart,
      oldEnd: hunk.deletionStart + Math.max(hunk.deletionCount - 1, 0),
      newStart: hunk.additionStart,
      newEnd: hunk.additionStart + Math.max(hunk.additionCount - 1, 0),
      firstChange,
    };
  });
}

export function hunkForRange(hunks: HunkInfo[], range: SurfaceRange): HunkInfo | null {
  for (const hunk of hunks) {
    const [start, end] = range.side === 'old' ? [hunk.oldStart, hunk.oldEnd] : [hunk.newStart, hunk.newEnd];
    if (range.end >= start && range.start <= end) {
      return hunk;
    }
  }
  return null;
}

/** Builds a standalone unified patch for one hunk, suitable for `git apply --reverse`. */
export function hunkToPatch(fileDiff: ParsedFileDiff, hunkIndex: number): string | null {
  const hunk = fileDiff.hunks[hunkIndex];
  if (!hunk) {
    return null;
  }
  const oldName = fileDiff.prevName ?? fileDiff.name;
  const header = [
    `diff --git a/${oldName} b/${fileDiff.name}`,
    fileDiff.type === 'new' ? '--- /dev/null' : `--- a/${oldName}`,
    fileDiff.type === 'deleted' ? '+++ /dev/null' : `+++ b/${fileDiff.name}`,
    `@@ -${hunk.deletionStart},${hunk.deletionCount} +${hunk.additionStart},${hunk.additionCount} @@`,
  ];
  const body: string[] = [];
  for (const block of hunk.hunkContent) {
    if (block.type === 'context') {
      for (let i = 0; i < block.lines; i++) {
        body.push(` ${stripNewline(fileDiff.additionLines[block.additionLineIndex + i])}`);
      }
      continue;
    }
    for (let i = 0; i < block.deletions; i++) {
      body.push(`-${stripNewline(fileDiff.deletionLines[block.deletionLineIndex + i])}`);
    }
    for (let i = 0; i < block.additions; i++) {
      body.push(`+${stripNewline(fileDiff.additionLines[block.additionLineIndex + i])}`);
    }
  }
  if (hunk.noEOFCRAdditions || hunk.noEOFCRDeletions) {
    body.push('\\ No newline at end of file');
  }
  return `${[...header, ...body].join('\n')}\n`;
}

export function diffLineCount(fileDiff: ParsedFileDiff): number {
  return fileDiff.unifiedLineCount;
}
