import type { DiffFile, DiffHunk, DiffLine } from '@diffity/parser';
import type { CommentSide } from '../components/comments/types';

export type ViewMode = 'unified' | 'split';

const WORKING_TREE_REFS = new Set(['work', 'staged', 'unstaged']);

export function isWorkingTreeRef(ref?: string): boolean {
  return !!ref && WORKING_TREE_REFS.has(ref);
}

export function getFilePath(file: DiffFile): string {
  if (file.status === 'deleted') {
    return file.oldPath;
  }
  return file.newPath;
}

export function getLineBg(type: string): string {
  switch (type) {
    case 'add':
      return 'bg-diff-add-bg';
    case 'delete':
      return 'bg-diff-del-bg';
    default:
      return 'bg-bg';
  }
}

const LOCK_FILES = new Set([
  'package-lock.json',
  'pnpm-lock.yaml',
  'pnpm-lock.yml',
  'bun.lock',
  'bun.lockb',
  'yarn.lock',
  'Cargo.lock',
  'Gemfile.lock',
  'composer.lock',
  'poetry.lock',
  'Pipfile.lock',
  'go.sum',
  'flake.lock',
  'pubspec.lock',
  'Podfile.lock',
  'packages.lock.json',
  'project.assets.json',
  'paket.lock',
  'pnpm-workspace.yaml',
  'shrinkwrap.yaml',
]);

const GENERATED_EXTENSIONS = [
  '.min.js',
  '.min.css',
  '.min.mjs',
  '.bundle.js',
  '.bundle.css',
  '.chunk.js',
  '.chunk.css',
  '.generated.ts',
  '.generated.js',
  '.g.dart',
  '.freezed.dart',
  '.pb.go',
  '.pb.ts',
  '.pb.js',
];

const GENERATED_PATTERNS = [
  /\.d\.ts$/,
  /\.map$/,
  /\.snap$/,
  /dist\//,
  /build\//,
  /generated\//,
  /__generated__\//,
  /\.lock$/,
];

/** Files with more diff rows than this are not rendered until "Load diff". */
export const DEFER_ROW_THRESHOLD = 1000;
/** A line this long marks minified / generated content. */
export const LONG_LINE_LENGTH = 1000;

export function getRowCount(file: DiffFile): number {
  if (file.patchOmitted) {
    return file.additions + file.deletions;
  }
  let count = 0;
  for (const hunk of file.hunks) {
    count += hunk.lines.length;
  }
  return count;
}

function hasLongLine(file: DiffFile): boolean {
  for (const hunk of file.hunks) {
    for (const line of hunk.lines) {
      if (line.content.length > LONG_LINE_LENGTH) {
        return true;
      }
    }
  }
  return false;
}

function isGeneratedPath(path: string): boolean {
  const lowerPath = path.toLowerCase();
  if (GENERATED_EXTENSIONS.some((ext) => lowerPath.endsWith(ext))) {
    return true;
  }
  return GENERATED_PATTERNS.some((pattern) => pattern.test(path));
}

/**
 * Why a file's diff is held back behind "Load diff" (lock, generated, minified or large), or null to render it.
 * Binary files and files without hunks have nothing to hold back.
 */
export function deferReason(file: DiffFile): string | null {
  if (file.isBinary || (!file.patchOmitted && file.hunks.length === 0)) {
    return null;
  }
  const path = getFilePath(file);
  const fileName = path.split('/').pop() || '';
  const rows = getRowCount(file);
  if (LOCK_FILES.has(fileName)) {
    return 'Lock file';
  }
  if (/\.min\.(js|mjs|css)$/i.test(path) || hasLongLine(file)) {
    return 'Minified file';
  }
  if (isGeneratedPath(path)) {
    return 'Generated file';
  }
  if (file.patchOmitted || rows >= DEFER_ROW_THRESHOLD) {
    return 'Large diff';
  }
  return null;
}

function isAutoCollapsible(file: DiffFile): boolean {
  return file.status === 'deleted' || file.status === 'renamed';
}

export function getAutoCollapsedPaths(files: DiffFile[]): Set<string> {
  const paths = new Set<string>();
  for (const file of files) {
    if (isAutoCollapsible(file)) {
      paths.add(getFilePath(file));
    }
  }
  return paths;
}

/** Files with more rows than this render their hunks in slices that mount only near the viewport. */
export const SLICE_ROW_THRESHOLD = 400;
export const SLICE_SIZE = 120;

function sliceOf(hunk: DiffHunk, lines: DiffLine[], first: boolean): DiffHunk {
  if (first) {
    return { ...hunk, lines };
  }
  let oldCount = 0;
  let newCount = 0;
  for (const line of lines) {
    if (line.type !== 'add') {
      oldCount++;
    }
    if (line.type !== 'delete') {
      newCount++;
    }
  }
  const oldStart = lines.find((line) => line.oldLineNumber !== null)?.oldLineNumber ?? hunk.oldStart;
  const newStart = lines.find((line) => line.newLineNumber !== null)?.newLineNumber ?? hunk.newStart;
  return { header: '', oldStart, oldCount, newStart, newCount, lines };
}

/**
 * Splits a long hunk into slices of about `size` lines. The first slice keeps the header; the rest have an empty one
 * (HunkHeader renders nothing for it). A cut never falls inside a delete/add run, so split view still pairs lines,
 * unless the run is over four slices long.
 */
export function sliceHunk(hunk: DiffHunk, size = SLICE_SIZE): DiffHunk[] {
  const lines = hunk.lines;
  if (lines.length <= size * 1.5) {
    return [hunk];
  }
  const slices: DiffHunk[] = [];
  let start = 0;
  let runHasDelete = false;
  for (let i = 1; i < lines.length; i++) {
    const prev = lines[i - 1];
    if (prev.type === 'context') {
      runHasDelete = false;
    }
    if (prev.type === 'delete') {
      runHasDelete = true;
    }
    if (i - start < size) {
      continue;
    }
    if (runHasDelete && lines[i].type !== 'context' && i - start < size * 4) {
      continue;
    }
    slices.push(sliceOf(hunk, lines.slice(start, i), start === 0));
    start = i;
  }
  slices.push(sliceOf(hunk, lines.slice(start), start === 0));
  return slices;
}

/** Rows a slice takes: every line in unified view; context plus the longer side of each change run in split. */
export function sliceRowCount(lines: DiffLine[], split: boolean): number {
  if (!split) {
    return lines.length;
  }
  let rows = 0;
  let dels = 0;
  let adds = 0;
  for (const line of lines) {
    if (line.type === 'context') {
      rows += Math.max(dels, adds) + 1;
      dels = 0;
      adds = 0;
      continue;
    }
    if (line.type === 'delete') {
      dels++;
    } else {
      adds++;
    }
  }
  return rows + Math.max(dels, adds);
}

export function buildHunkPatch(file: DiffFile, hunk: DiffHunk): string {
  const oldPath = file.status === 'added' ? '/dev/null' : `a/${file.oldPath}`;
  const newPath = file.status === 'deleted' ? '/dev/null' : `b/${file.newPath}`;
  const lines: string[] = [
    `--- ${oldPath}`,
    `+++ ${newPath}`,
    hunk.header,
  ];
  for (const line of hunk.lines) {
    const prefix = line.type === 'add' ? '+' : line.type === 'delete' ? '-' : ' ';
    lines.push(`${prefix}${line.content}`);
    if (line.noNewline) {
      lines.push('\\ No newline at end of file');
    }
  }
  return lines.join('\n') + '\n';
}

export interface ChangeGroup {
  startIndex: number;
  endIndex: number;
}

export function getChangeGroups(lines: { type: string }[]): ChangeGroup[] {
  const groups: ChangeGroup[] = [];
  let i = 0;
  while (i < lines.length) {
    if (lines[i].type !== 'context') {
      const start = i;
      while (i < lines.length && lines[i].type !== 'context') {
        i++;
      }
      groups.push({ startIndex: start, endIndex: i - 1 });
    } else {
      i++;
    }
  }
  return groups;
}

export function buildChangeGroupPatch(file: DiffFile, hunk: DiffHunk, startIndex: number, endIndex: number): string {
  const CONTEXT = 3;
  const lines = hunk.lines;

  const contextBefore: typeof lines = [];
  for (let i = startIndex - 1; i >= Math.max(0, startIndex - CONTEXT); i--) {
    if (lines[i].type === 'context') {
      contextBefore.unshift(lines[i]);
    } else {
      break;
    }
  }

  const changeLines = lines.slice(startIndex, endIndex + 1);

  const contextAfter: typeof lines = [];
  for (let i = endIndex + 1; i < Math.min(lines.length, endIndex + 1 + CONTEXT); i++) {
    if (lines[i].type === 'context') {
      contextAfter.push(lines[i]);
    } else {
      break;
    }
  }

  const allLines = [...contextBefore, ...changeLines, ...contextAfter];

  let oldStart = 0;
  let oldCount = 0;
  let newStart = 0;
  let newCount = 0;

  for (const line of allLines) {
    if (line.oldLineNumber !== null && oldStart === 0) {
      oldStart = line.oldLineNumber;
    }
    if (line.newLineNumber !== null && newStart === 0) {
      newStart = line.newLineNumber;
    }
    if (line.type === 'context' || line.type === 'delete') {
      oldCount++;
    }
    if (line.type === 'context' || line.type === 'add') {
      newCount++;
    }
  }

  if (oldStart === 0) {
    oldStart = hunk.oldStart;
  }
  if (newStart === 0) {
    newStart = hunk.newStart;
  }

  const oldPath = file.status === 'added' ? '/dev/null' : `a/${file.oldPath}`;
  const newPath = file.status === 'deleted' ? '/dev/null' : `b/${file.newPath}`;
  const header = `@@ -${oldStart},${oldCount} +${newStart},${newCount} @@`;

  const patchLines: string[] = [
    `--- ${oldPath}`,
    `+++ ${newPath}`,
    header,
  ];

  for (const line of allLines) {
    const prefix = line.type === 'add' ? '+' : line.type === 'delete' ? '-' : ' ';
    patchLines.push(`${prefix}${line.content}`);
    if (line.noNewline) {
      patchLines.push('\\ No newline at end of file');
    }
  }

  return patchLines.join('\n') + '\n';
}


export function extractLinesFromDiff(
  hunks: DiffHunk[],
  side: CommentSide,
  startLine: number,
  endLine: number,
): string {
  const result: string[] = [];
  for (const hunk of hunks) {
    for (const line of hunk.lines) {
      const lineNum = side === 'old' ? line.oldLineNumber : line.newLineNumber;
      if (lineNum === null || lineNum < startLine || lineNum > endLine) {
        continue;
      }
      if (side === 'old' && (line.type === 'delete' || line.type === 'context')) {
        result.push(line.content);
      } else if (side === 'new' && (line.type === 'add' || line.type === 'context')) {
        result.push(line.content);
      }
    }
  }
  return result.join('\n');
}

export function extractLinesFromExpandedLines(
  lines: { type: string; content: string; oldLineNumber: number | null; newLineNumber: number | null }[],
  side: CommentSide,
  startLine: number,
  endLine: number,
): string {
  const result: string[] = [];
  for (const line of lines) {
    const lineNum = side === 'old' ? line.oldLineNumber : line.newLineNumber;
    if (lineNum === null || lineNum < startLine || lineNum > endLine) {
      continue;
    }
    result.push(line.content);
  }
  return result.join('\n');
}

export function getStatusColor(status: string): string {
  switch (status) {
    case 'added':
      return 'bg-added/15 text-added';
    case 'deleted':
      return 'bg-deleted/15 text-deleted';
    case 'renamed':
      return 'bg-renamed/15 text-renamed';
    default:
      return 'bg-modified/15 text-modified';
  }
}
