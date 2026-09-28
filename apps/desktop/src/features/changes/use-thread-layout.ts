import { useMemo } from 'react';
import { buildLineMaps, rangeExists, type LineMaps } from '@/components/diff-surface';
import type { Thread } from '@/lib/types';
import { countOpenByFile, isFileLevel, isGeneral, isOpen, sortThreads } from '@/features/comments/thread-utils';
import type { DiffEntry } from './use-diff';

export interface ThreadLayout {
  lineMaps: Map<string, LineMaps>;
  threadsById: Map<string, Thread>;
  anchored: Map<string, Thread[]>;
  general: Thread[];
  orphaned: Thread[];
  openCounts: Map<string, number>;
  navigable: Thread[];
}

export function useLineMaps(entries: DiffEntry[]) {
  return useMemo(() => {
    const maps = new Map<string, LineMaps>();
    for (const entry of entries) {
      if (!entry.fileDiff) {
        continue;
      }
      maps.set(entry.summary.path, buildLineMaps(entry.fileDiff));
    }
    return maps;
  }, [entries]);
}

export function useThreadLayout(entries: DiffEntry[], threads: Thread[], lineMaps: Map<string, LineMaps>): ThreadLayout {
  return useMemo(() => {
    const threadsById = new Map(threads.map((t) => [t.id, t]));
    const anchored = new Map<string, Thread[]>();
    const general: Thread[] = [];
    const orphaned: Thread[] = [];

    for (const thread of threads) {
      if (isGeneral(thread)) {
        general.push(thread);
        continue;
      }
      const maps = lineMaps.get(thread.filePath);
      const fits = maps !== undefined && (isFileLevel(thread) || rangeExists(maps, thread.side, thread.startLine, thread.endLine));
      if (!fits) {
        orphaned.push(thread);
        continue;
      }
      const list = anchored.get(thread.filePath) ?? [];
      list.push(thread);
      anchored.set(thread.filePath, list);
    }

    const order = entries.map((e) => e.summary.path);
    const navigable = sortThreads(
      threads.filter((t) => isOpen(t)),
      order,
    );

    return {
      lineMaps,
      threadsById,
      anchored,
      general,
      orphaned,
      openCounts: countOpenByFile(threads.filter((t) => !orphaned.includes(t))),
      navigable,
    };
  }, [entries, threads, lineMaps]);
}
