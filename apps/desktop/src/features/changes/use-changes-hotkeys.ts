import { useRef, type RefObject } from 'react';
import { useHotkeys } from 'react-hotkeys-hook';
import { listHunks, type CodeSurfaceHandle, type SurfaceItem } from '@/components/diff-surface';
import { useChangesStore } from './changes-store';
import type { DiffEntry } from './use-diff';

interface Options<T> {
  surfaceRef: RefObject<CodeSurfaceHandle | null>;
  items: SurfaceItem<T>[];
  entriesByPath: Map<string, DiffEntry>;
  focusFile: (path: string) => void;
  toggleViewed: (path: string) => void;
  toggleAll: () => void;
  clearSelection: () => void;
}

export function useChangesHotkeys<T>(options: Options<T>) {
  const { surfaceRef, items, entriesByPath, focusFile, toggleViewed, toggleAll, clearSelection } = options;
  const hunkCursor = useRef<{ path: string; index: number } | null>(null);

  const currentPath = () => {
    const { currentFile } = useChangesStore.getState();
    if (currentFile && items.some((i) => i.id === currentFile)) {
      return currentFile;
    }
    return surfaceRef.current?.getTopItemId() ?? items[0]?.id ?? null;
  };

  const stepFile = (delta: number) => {
    if (items.length === 0) {
      return;
    }
    const current = currentPath();
    const index = items.findIndex((i) => i.id === current);
    const next = Math.max(0, Math.min(items.length - 1, index + delta));
    hunkCursor.current = null;
    focusFile(items[next].id);
  };

  const stepHunk = (delta: number) => {
    const path = currentPath();
    if (!path) {
      return;
    }
    let fileIndex = items.findIndex((i) => i.id === path);
    let hunkIndex = hunkCursor.current?.path === path ? hunkCursor.current.index + delta : delta > 0 ? 0 : -1;
    for (let guard = 0; guard < items.length + 1; guard++) {
      const item = items[fileIndex];
      const fileDiff = item ? entriesByPath.get(item.id)?.fileDiff : null;
      const hunks = fileDiff ? listHunks(fileDiff) : [];
      if (hunkIndex < 0 && hunks.length > 0 && hunkIndex >= -hunks.length) {
        hunkIndex = hunks.length + hunkIndex;
      }
      if (item && hunkIndex >= 0 && hunkIndex < hunks.length) {
        const hunk = hunks[hunkIndex];
        hunkCursor.current = { path: item.id, index: hunkIndex };
        useChangesStore.getState().setCollapsed(item.id, false);
        useChangesStore.getState().setCurrentFile(item.id);
        requestAnimationFrame(() => surfaceRef.current?.scrollToLine(item.id, hunk.firstChange.line, hunk.firstChange.side));
        return;
      }
      fileIndex += delta;
      if (fileIndex < 0 || fileIndex >= items.length) {
        return;
      }
      hunkIndex = delta > 0 ? 0 : -1;
    }
  };

  useHotkeys('j', () => stepFile(1), [items]);
  useHotkeys('k', () => stepFile(-1), [items]);
  useHotkeys('n', () => stepHunk(1), [items, entriesByPath]);
  useHotkeys('p', () => stepHunk(-1), [items, entriesByPath]);
  useHotkeys(
    'x',
    () => {
      const path = currentPath();
      if (!path) {
        return;
      }
      const item = items.find((i) => i.id === path);
      useChangesStore.getState().setCollapsed(path, !item?.collapsed);
    },
    [items],
  );
  useHotkeys('shift+x', toggleAll, [toggleAll]);
  useHotkeys(
    'r',
    () => {
      const path = currentPath();
      if (!path) {
        return;
      }
      toggleViewed(path);
    },
    [items, toggleViewed],
  );
  useHotkeys('escape', clearSelection, [clearSelection]);
}
