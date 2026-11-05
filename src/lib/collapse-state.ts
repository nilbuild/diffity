import type { DiffFile } from '@/lib/diff-parser';
import { getAutoCollapsedPaths, getFilePath } from './diff-utils';

/** Collapsed unless toggled: viewed files, plus deleted and renamed files that have no comments. */
export function defaultCollapsed(files: DiffFile[], commented: Set<string>, viewed: Set<string>): Set<string> {
  const paths = getAutoCollapsedPaths(files);
  for (const path of commented) {
    paths.delete(path);
  }
  for (const file of files) {
    const path = getFilePath(file);
    if (viewed.has(path)) {
      paths.add(path);
    }
  }
  return paths;
}

/** The default with each toggled path flipped. */
export function collapsedFromToggles(files: DiffFile[], commented: Set<string>, viewed: Set<string>, toggled: Set<string>): Set<string> {
  const collapsed = defaultCollapsed(files, commented, viewed);
  for (const path of toggled) {
    if (collapsed.has(path)) {
      collapsed.delete(path);
    } else {
      collapsed.add(path);
    }
  }
  return collapsed;
}

/** The paths whose collapse differs from the default, which is what gets remembered for the view. */
export function togglesFromCollapsed(files: DiffFile[], commented: Set<string>, viewed: Set<string>, collapsed: Set<string>): Set<string> {
  const byDefault = defaultCollapsed(files, commented, viewed);
  const toggled = new Set<string>();
  for (const file of files) {
    const path = getFilePath(file);
    if (byDefault.has(path) !== collapsed.has(path)) {
      toggled.add(path);
    }
  }
  return toggled;
}

/** Expands the paths in `current` that are not in `seen`. */
export function expandAdded(collapsed: Set<string>, seen: Set<string>, current: Set<string>): Set<string> {
  const added = [...current].filter((path) => !seen.has(path) && collapsed.has(path));
  if (added.length === 0) {
    return collapsed;
  }
  const next = new Set(collapsed);
  for (const path of added) {
    next.delete(path);
  }
  return next;
}

/** Collapses the paths in `current` that are not in `seen`. */
export function collapseAdded(collapsed: Set<string>, seen: Set<string>, current: Set<string>): Set<string> {
  const added = [...current].filter((path) => !seen.has(path) && !collapsed.has(path));
  if (added.length === 0) {
    return collapsed;
  }
  return new Set([...collapsed, ...added]);
}
