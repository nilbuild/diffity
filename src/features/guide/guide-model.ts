import type { DiffFile } from '@/lib/diff-parser';
import { getFilePath } from '../../lib/diff-utils';
import type { Guide, GuideAttention, GuideCall, GuideNote } from '../../lib/types';
import type { DiagramFocus } from '../../components/mermaid-diagram';
import { edgeKey } from './guide-refs';

export const NOT_IN_GUIDE_TITLE = 'Not in the guide';

/** Below this a diff reads fine file by file, and the guide's start screen says so. */
export const GUIDE_MIN_FILES = 6;
export const GUIDE_MIN_LINES = 300;

export function isGuideWorthy(fileCount: number, changedLines: number): boolean {
  return fileCount >= GUIDE_MIN_FILES || changedLines >= GUIDE_MIN_LINES;
}

export interface ReadingChapter {
  /** Stable within a guide: the chapter's position, or `extra` for the files the guide does not cover. */
  key: string;
  title: string;
  summary: string;
  points: string[];
  focus: string[];
  attention: GuideAttention;
  phase?: string;
  files: DiffFile[];
  /** Notes on the files still in the diff. */
  notes: GuideNote[];
  /** Rows pointing at files that left the diff keep their text but lose the link. */
  callstack: GuideCall[];
  additions: number;
  deletions: number;
  /** Files that changed after the guide was written and are not in any of its chapters. */
  extra: boolean;
}

/**
 * The guide's chapters over the diff as it is now: files that left the diff are dropped, chapters left empty are
 * dropped, and files the guide never saw are collected in a last chapter.
 */
export function readingChapters(guide: Guide, files: DiffFile[]): ReadingChapter[] {
  const byPath = new Map(files.map((file) => [getFilePath(file), file]));
  const placed = new Set<string>();
  const chapters: ReadingChapter[] = [];
  guide.chapters.forEach((chapter, index) => {
    const chapterFiles: DiffFile[] = [];
    for (const path of chapter.files) {
      const file = byPath.get(path);
      if (file && !placed.has(path)) {
        placed.add(path);
        chapterFiles.push(file);
      }
    }
    if (chapterFiles.length === 0) {
      return;
    }
    const kept = new Set(chapterFiles.map((file) => getFilePath(file)));
    const notes = (chapter.notes ?? []).filter((note) => kept.has(note.path));
    const callstack = (chapter.callstack ?? []).map((row) => (row.path && !byPath.has(row.path) ? { ...row, path: undefined, line: undefined } : row));
    chapters.push({ ...chapter, key: String(index), points: chapter.points ?? [], files: chapterFiles, notes, callstack, ...lineCounts(chapterFiles), extra: false });
  });
  const rest = files.filter((file) => !placed.has(getFilePath(file)));
  if (rest.length > 0) {
    chapters.push({
      key: 'extra',
      title: NOT_IN_GUIDE_TITLE,
      summary: 'These files changed after the guide was written, so it does not explain them.',
      points: [],
      focus: [],
      attention: 'normal',
      files: rest,
      notes: [],
      callstack: [],
      ...lineCounts(rest),
      extra: true,
    });
  }
  return chapters;
}

function lineCounts(files: DiffFile[]) {
  let additions = 0;
  let deletions = 0;
  for (const file of files) {
    additions += file.additions;
    deletions += file.deletions;
  }
  return { additions, deletions };
}

export interface ChapterGroup {
  phase: string | null;
  chapters: ReadingChapter[];
}

/** Neighbouring chapters of the same phase, in order; chapters without one stand alone with no heading. */
export function phaseGroups(chapters: ReadingChapter[]): ChapterGroup[] {
  const groups: ChapterGroup[] = [];
  for (const chapter of chapters) {
    const phase = chapter.phase?.trim() || null;
    const last = groups[groups.length - 1];
    if (last && phase && last.phase === phase) {
      last.chapters.push(chapter);
      continue;
    }
    groups.push({ phase, chapters: [chapter] });
  }
  return groups;
}

/** Where the reader is: "Overview", "Chapter 2 of 8" or "Not in the guide". */
export function stepLabel(chapters: ReadingChapter[], step: string): string {
  const index = chapters.findIndex((chapter) => chapter.key === step);
  if (index < 0) {
    return 'Overview';
  }
  if (chapters[index].extra) {
    return 'Not in the guide';
  }
  return `Chapter ${index + 1} of ${chapters.filter((chapter) => !chapter.extra).length}`;
}

/** The guide describes a different version of the changes than the one on screen. */
export function isGuideStale(guide: Guide, fingerprint: string | undefined, chapters: ReadingChapter[]): boolean {
  if (chapters.some((chapter) => chapter.extra)) {
    return true;
  }
  return !!fingerprint && guide.fingerprint !== fingerprint;
}

/** Mermaid lines that colour the nodes for the current theme: `:::added`, `:::changed` and `:::removed` ones the agent marked, the rest neutral. */
export function diagramWithStyles(chart: string, theme: 'light' | 'dark'): string {
  const trimmed = chart.trim().replace(/^```(?:mermaid)?\s*\n?/, '').replace(/\n?```\s*$/, '');
  if (!/^(flowchart|graph)\b/.test(trimmed)) {
    return trimmed;
  }
  const colors = theme === 'dark'
    ? { plain: 'fill:#1c2128,stroke:#545d68,color:#e6edf3', added: 'fill:#12301f,stroke:#3fb950,color:#e6edf3', changed: 'fill:#2f2711,stroke:#d29922,color:#e6edf3', removed: 'fill:#3a1618,stroke:#f85149,stroke-dasharray:4 3,color:#e6edf3' }
    : { plain: 'fill:#f6f8fa,stroke:#afb8c1,color:#1f2328', added: 'fill:#e9f7ec,stroke:#2da44e,color:#1f2328', changed: 'fill:#fff5d6,stroke:#bf8700,color:#1f2328', removed: 'fill:#ffebe9,stroke:#cf222e,stroke-dasharray:4 3,color:#1f2328' };
  const lines = [trimmed];
  // Unchanged nodes stay neutral so the new and changed ones stand out.
  if (!/classDef\s+default\b/.test(trimmed)) {
    lines.push(`  classDef default ${colors.plain}`);
  }
  if (/:::added\b/.test(trimmed) && !/classDef\s+added\b/.test(trimmed)) {
    lines.push(`  classDef added ${colors.added}`);
  }
  if (/:::changed\b/.test(trimmed) && !/classDef\s+changed\b/.test(trimmed)) {
    lines.push(`  classDef changed ${colors.changed}`);
  }
  if (/:::removed\b/.test(trimmed) && !/classDef\s+removed\b/.test(trimmed)) {
    lines.push(`  classDef removed ${colors.removed}`);
  }
  return lines.join('\n');
}

/** The step's node lit, the arrow from the step before (either way round, for a return) and the nodes already passed. */
export function flowFocus(nodes: string[], active: number | null): DiagramFocus | null {
  if (active === null || !nodes[active]) {
    return null;
  }
  const node = nodes[active];
  const previous = active > 0 ? nodes[active - 1] : null;
  const edges = new Set<string>(previous && previous !== node ? [edgeKey(previous, node), edgeKey(node, previous)] : []);
  return { node, edges, visited: new Set(nodes.slice(0, active)) };
}
