import { describe, expect, it } from 'vitest';
import { parseDiff } from '../src/lib/diff-parser';
import { diagramWithStyles, flowFocus, isGuideStale, isGuideWorthy, NOT_IN_GUIDE_TITLE, phaseGroups, readingChapters, type ReadingChapter } from '../src/features/guide/guide-model';
import type { Guide } from '../src/lib/types';

const file = (path: string, added: number) => `diff --git a/${path} b/${path}
--- a/${path}
+++ b/${path}
@@ -1 +1,${added} @@
${Array.from({ length: added }, (_, i) => `+line ${i}`).join('\n')}
`;

const files = parseDiff([file('src/a.ts', 3), file('src/b.ts', 2), file('package-lock.json', 1)].join('')).files;

const guide = (chapters: Guide['chapters']): Guide => ({
  sessionId: 's',
  ref: 'work',
  fingerprint: 'fp1',
  agentName: 'Claude Code',
  createdAt: '2026-10-07T00:00:00Z',
  summary: 'x',
  chapters,
});

const chapter = (title: string, paths: string[]) => ({ title, summary: '', points: [], focus: [], attention: 'normal' as const, files: paths, notes: [] });

describe('readingChapters', () => {
  it('follows the guide order and counts lines per chapter', () => {
    const chapters = readingChapters(guide([chapter('Core', ['src/b.ts', 'src/a.ts']), chapter('Lock', ['package-lock.json'])]), files);
    expect(chapters.map((c) => c.title)).toEqual(['Core', 'Lock']);
    expect(chapters[0].files.map((f) => f.newPath)).toEqual(['src/b.ts', 'src/a.ts']);
    expect(chapters[0].additions).toBe(5);
    expect(chapters.some((c) => c.extra)).toBe(false);
  });

  it('drops files that left the diff and collects files the guide never saw', () => {
    const chapters = readingChapters(guide([chapter('Core', ['src/a.ts', 'src/gone.ts']), chapter('Gone', ['src/gone.ts'])]), files);
    expect(chapters.map((c) => c.title)).toEqual(['Core', NOT_IN_GUIDE_TITLE]);
    expect(chapters[1].files.map((f) => f.newPath)).toEqual(['src/b.ts', 'package-lock.json']);
    expect(chapters[1].extra).toBe(true);
  });
});

describe('isGuideStale', () => {
  it('is stale when the fingerprint moved or files are not covered', () => {
    const g = guide([chapter('All', ['src/a.ts', 'src/b.ts', 'package-lock.json'])]);
    const chapters = readingChapters(g, files);
    expect(isGuideStale(g, 'fp1', chapters)).toBe(false);
    expect(isGuideStale(g, undefined, chapters)).toBe(false);
    expect(isGuideStale(g, 'fp2', chapters)).toBe(true);
    const partial = guide([chapter('Some', ['src/a.ts'])]);
    expect(isGuideStale(partial, 'fp1', readingChapters(partial, files))).toBe(true);
  });
});

describe('isGuideWorthy', () => {
  it('offers a guide for many files or many changed lines', () => {
    expect(isGuideWorthy(3, 120)).toBe(false);
    expect(isGuideWorthy(6, 20)).toBe(true);
    expect(isGuideWorthy(2, 300)).toBe(true);
  });
});

describe('diagramWithStyles', () => {
  it('adds class definitions only for the classes a flowchart uses', () => {
    const chart = diagramWithStyles('```mermaid\nflowchart LR\n  a --> b:::added\n```', 'dark');
    expect(chart.startsWith('flowchart LR')).toBe(true);
    expect(chart).toContain('classDef added');
    expect(chart).not.toContain('classDef changed');
    expect(chart).toContain('classDef default');
    expect(diagramWithStyles('sequenceDiagram\n  a->>b: hi', 'light')).toBe('sequenceDiagram\n  a->>b: hi');
  });
});

describe('diagramWithStyles removed nodes', () => {
  it('adds a dashed class for removed nodes only when used', () => {
    expect(diagramWithStyles('flowchart LR\n  A:::removed --> B', 'light')).toMatch(/classDef removed .*stroke-dasharray/);
    expect(diagramWithStyles('flowchart LR\n  A --> B', 'light')).not.toContain('classDef removed');
  });
});

describe('phaseGroups', () => {
  const chapter = (key: string, phase?: string) => ({ key, phase }) as ReadingChapter;

  it('groups neighbouring chapters of a phase and leaves the rest alone', () => {
    const groups = phaseGroups([chapter('0', 'Data'), chapter('1', 'Data'), chapter('2', 'UI'), chapter('3'), chapter('4')]);
    expect(groups.map((group) => [group.phase, group.chapters.map((c) => c.key)])).toEqual([
      ['Data', ['0', '1']],
      ['UI', ['2']],
      [null, ['3']],
      [null, ['4']],
    ]);
  });
});

describe('flowFocus', () => {
  it('lights the step, the arrow from the step before either way, and the nodes passed', () => {
    expect(flowFocus(['a', 'b', 'c'], null)).toBeNull();
    const focus = flowFocus(['a', 'b', 'c'], 2)!;
    expect(focus.node).toBe('c');
    expect([...focus.edges]).toEqual(['b->c', 'c->b']);
    expect([...focus.visited]).toEqual(['a', 'b']);
    expect([...flowFocus(['a', 'b', 'c'], 0)!.edges]).toEqual([]);
  });
});
