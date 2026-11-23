import { create } from 'zustand';

/** Projects grouped on the rail. An agent working in one project of a group can read the others. A project is in one group at most. */
export interface ProjectGroup {
  id: string;
  name: string;
  paths: string[];
  /** Shown on the rail as one stacked tile. */
  collapsed?: boolean;
}

const GROUPS_KEY = 'diffity-rail-groups';

export function projectName(path: string): string {
  return path.split('/').filter(Boolean).pop() ?? 'project';
}

function isGroup(value: unknown): value is ProjectGroup {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const group = value as ProjectGroup;
  return typeof group.id === 'string' && typeof group.name === 'string' && Array.isArray(group.paths) && group.paths.every((path) => typeof path === 'string');
}

/** Drops paths already in an earlier group and groups left with fewer than two projects. */
export function normalizeGroups(groups: ProjectGroup[]): ProjectGroup[] {
  const taken = new Set<string>();
  const result: ProjectGroup[] = [];
  for (const group of groups) {
    const paths = [...new Set(group.paths)].filter((path) => !taken.has(path));
    if (paths.length < 2) {
      continue;
    }
    for (const path of paths) {
      taken.add(path);
    }
    result.push({ ...group, paths });
  }
  return result;
}

function readGroups(): ProjectGroup[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(GROUPS_KEY) ?? '[]');
    return Array.isArray(parsed) ? normalizeGroups(parsed.filter(isGroup)) : [];
  } catch {
    return [];
  }
}

export const useGroups = create<{ groups: ProjectGroup[] }>(() => ({ groups: readGroups() }));

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (event.key !== GROUPS_KEY) {
      return;
    }
    useGroups.setState({ groups: readGroups() });
  });
}

export function setGroups(groups: ProjectGroup[]) {
  const next = normalizeGroups(groups);
  useGroups.setState({ groups: next });
  try {
    localStorage.setItem(GROUPS_KEY, JSON.stringify(next));
  } catch {
    return;
  }
}

export function getGroups(): ProjectGroup[] {
  return useGroups.getState().groups;
}

export function groupOf(groups: ProjectGroup[], path: string): ProjectGroup | null {
  return groups.find((group) => group.paths.includes(path)) ?? null;
}

export function useGroupOf(path: string | null): ProjectGroup | null {
  return useGroups((state) => (path ? groupOf(state.groups, path) : null));
}

/** "diffity-app" + "diffity-web" → "diffity"; otherwise the first project's name. */
export function defaultGroupName(paths: string[]): string {
  const names = paths.map(projectName);
  const first = names[0] ?? 'Group';
  let prefix = first;
  for (const name of names.slice(1)) {
    let length = 0;
    while (length < prefix.length && length < name.length && prefix[length].toLowerCase() === name[length].toLowerCase()) {
      length += 1;
    }
    prefix = prefix.slice(0, length);
  }
  const trimmed = prefix.replace(/[-_.\s]+$/, '');
  return trimmed.length >= 3 ? trimmed : first;
}

function withoutPath(groups: ProjectGroup[], path: string): ProjectGroup[] {
  return groups.map((group) => ({ ...group, paths: group.paths.filter((item) => item !== path) }));
}

function newId(): string {
  return `g-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

/** Puts `path` into `other`'s group, or makes a new group of the two. Returns the group it ended up in. */
export function groupWith(groups: ProjectGroup[], path: string, other: string): ProjectGroup[] {
  const target = groupOf(groups, other);
  if (target) {
    return joinGroup(groups, path, target.id);
  }
  const rest = withoutPath(withoutPath(groups, path), other);
  return [...rest, { id: newId(), name: defaultGroupName([other, path]), paths: [other, path] }];
}

export function joinGroup(groups: ProjectGroup[], path: string, groupId: string): ProjectGroup[] {
  return withoutPath(groups, path).map((group) => (group.id === groupId ? { ...group, paths: [...group.paths, path] } : group));
}

export function leaveGroup(groups: ProjectGroup[], path: string): ProjectGroup[] {
  return withoutPath(groups, path);
}

export function renameGroup(groups: ProjectGroup[], groupId: string, name: string): ProjectGroup[] {
  const trimmed = name.trim();
  if (!trimmed) {
    return groups;
  }
  return groups.map((group) => (group.id === groupId ? { ...group, name: trimmed } : group));
}

export function toggleCollapsed(groups: ProjectGroup[], groupId: string): ProjectGroup[] {
  return groups.map((group) => (group.id === groupId ? { ...group, collapsed: !group.collapsed } : group));
}

/** The rail order with each collapsed group down to its first project, which stands for the whole stack. */
export function shownOrder(order: string[], groups: ProjectGroup[]): string[] {
  return order.filter((path) => {
    const group = groupOf(groups, path);
    if (!group?.collapsed) {
      return true;
    }
    return order.find((item) => group.paths.includes(item)) === path;
  });
}

/** `shownOrder` back to the full order: each collapsed group's stack becomes its projects again. */
export function expandShown(shown: string[], order: string[], groups: ProjectGroup[]): string[] {
  return shown.flatMap((path) => {
    const group = groupOf(groups, path);
    if (!group?.collapsed) {
      return [path];
    }
    return order.filter((item) => group.paths.includes(item));
  });
}

export function ungroup(groups: ProjectGroup[], groupId: string): ProjectGroup[] {
  return groups.filter((group) => group.id !== groupId);
}

/** The rail order with every group's projects next to each other, where the group's first project is. */
export function arrangeOrder(order: string[], groups: ProjectGroup[]): string[] {
  const result: string[] = [];
  const placed = new Set<string>();
  for (const path of order) {
    if (placed.has(path)) {
      continue;
    }
    const group = groupOf(groups, path);
    const members = group ? order.filter((item) => group.paths.includes(item)) : [path];
    for (const member of members) {
      placed.add(member);
      result.push(member);
    }
  }
  return result;
}

/** What dropping `path` at its place in `order` does to its group: dropped between two projects of a group joins it,
 * dropped away from its own group leaves it. */
export function dropMembership(order: string[], groups: ProjectGroup[], path: string): { join: ProjectGroup | null; leave: ProjectGroup | null } {
  const index = order.indexOf(path);
  const before = index > 0 ? groupOf(groups, order[index - 1]) : null;
  const after = index >= 0 && index < order.length - 1 ? groupOf(groups, order[index + 1]) : null;
  const own = groupOf(groups, path);
  if (own && (before?.id === own.id || after?.id === own.id)) {
    return { join: null, leave: null };
  }
  if (before && after && before.id === after.id) {
    return { join: before, leave: own };
  }
  return { join: null, leave: own };
}
