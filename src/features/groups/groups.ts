import { create } from 'zustand';

/** Projects grouped on the rail. An agent working in one project of a group can read the others. A project is in one group at most. */
export interface ProjectGroup {
  id: string;
  name: string;
  paths: string[];
  /** Shown on the rail as one stacked tile. */
  collapsed?: boolean;
  /** A colour id from PROJECT_COLORS; picked from the id when unset. */
  color?: string;
  /** Shown before the name; guessed from the name when unset, none when empty. */
  emoji?: string;
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

/** How close (px) the dragged tile's centre has to be to another tile's centre to drop onto it rather than beside it. */
const ONTO_ZONE = 12;

interface Span {
  top: number;
  bottom: number;
}

/** Where things sat on the rail when a drag started. */
export interface RailGeometry {
  /** Each tile, in rail order. */
  tiles: Span[];
  /** Each expanded group's box, by group id. */
  boxes: Record<string, Span>;
}

export interface DropPlan {
  /** Where the dragged tile lands among the other tiles. */
  target: number;
  /** The project it was dropped onto, to group with. */
  onto: string | null;
  /** The group it ends up in, when that changes. */
  group: ProjectGroup | null;
  join: ProjectGroup | null;
  leave: ProjectGroup | null;
  hint: string | null;
}

interface Slot {
  target: number;
  /** The group a project dropped here is in: the gap is inside that group's box. */
  home: ProjectGroup | null;
  y: number;
}

/** Every place the dragged tile can land, with the height that picks it. A gap at a group's edge has two: just inside
 * the group's box, and just outside it. */
function dropSlots(projects: string[], groups: ProjectGroup[], geometry: RailGeometry, from: number): Slot[] {
  const stack = !!groupOf(groups, projects[from])?.collapsed;
  const others = projects.map((path, index) => ({ path, index })).filter((item) => item.index !== from);
  const boxOf = (item: { path: string } | undefined) => {
    const group = item ? groupOf(groups, item.path) : null;
    return group && !group.collapsed && geometry.boxes[group.id] ? { group, box: geometry.boxes[group.id] } : null;
  };
  const slots: Slot[] = [];
  for (let target = 0; target <= others.length; target += 1) {
    const before = others[target - 1];
    const after = others[target];
    const above = before ? geometry.tiles[before.index] : null;
    const below = after ? geometry.tiles[after.index] : null;
    const beforeBox = boxOf(before);
    const afterBox = boxOf(after);
    if (beforeBox && afterBox && beforeBox.group.id === afterBox.group.id) {
      if (!stack && above && below) {
        slots.push({ target, home: beforeBox.group, y: (above.bottom + below.top) / 2 });
      }
      continue;
    }
    const low = beforeBox?.box.bottom ?? above?.bottom;
    const high = afterBox?.box.top ?? below?.top;
    const own = geometry.tiles[from];
    const y = low === undefined && high === undefined ? (own.top + own.bottom) / 2 : low === undefined ? high! - 12 : high === undefined ? low + 12 : (low + high) / 2;
    slots.push({ target, home: null, y });
    if (stack) {
      continue;
    }
    if (beforeBox && above) {
      slots.push({ target, home: beforeBox.group, y: (above.bottom + beforeBox.box.bottom) / 2 });
    }
    if (afterBox && below) {
      slots.push({ target, home: afterBox.group, y: (afterBox.box.top + below.top) / 2 });
    }
  }
  return slots;
}

/** What letting go of the tile dragged from `from`, with its centre at height `y`, does. Over another tile's centre it
 * groups with it; otherwise it lands in the nearest gap, joining or leaving a group by which side of a box it's on. */
export function planDrop(projects: string[], groups: ProjectGroup[], geometry: RailGeometry, from: number, y: number): DropPlan {
  const path = projects[from];
  const own = groupOf(groups, path);
  const stack = !!own?.collapsed;
  const none = { target: from, onto: null, group: null, join: null, leave: null, hint: null };
  if (!stack) {
    const onto = geometry.tiles.findIndex((tile, index) => {
      if (index === from || Math.abs(y - (tile.top + tile.bottom) / 2) > ONTO_ZONE) {
        return false;
      }
      return !own || groupOf(groups, projects[index])?.id !== own.id;
    });
    if (onto >= 0) {
      const other = projects[onto];
      const otherGroup = groupOf(groups, other);
      const hint = otherGroup ? `Add to ${otherGroup.name}` : `Group with ${projectName(other)}`;
      return { target: onto < from ? onto + 1 : onto, onto: other, group: otherGroup, join: null, leave: null, hint };
    }
  }
  const slots = dropSlots(projects, groups, geometry, from);
  if (slots.length === 0) {
    return none;
  }
  const slot = slots.reduce((best, item) => (Math.abs(item.y - y) < Math.abs(best.y - y) ? item : best));
  const join = slot.home && slot.home.id !== own?.id ? slot.home : null;
  const leave = !stack && own && slot.home?.id !== own.id ? own : null;
  const hint = join ? `Add to ${join.name}` : leave ? `Take out of ${leave.name}` : null;
  return { target: slot.target, onto: null, group: join, join, leave, hint };
}

/** The rail as it will look once the drop lands, to show while dragging. Dropping onto a tile changes nothing until
 * it lands. */
export function previewDrop(projects: string[], groups: ProjectGroup[], from: number, plan: DropPlan): { projects: string[]; groups: ProjectGroup[] } {
  if (plan.onto) {
    return { projects, groups };
  }
  const path = projects[from];
  const order = projects.filter((_, index) => index !== from);
  order.splice(plan.target, 0, path);
  const moved = plan.join ? joinGroup(groups, path, plan.join.id) : plan.leave ? leaveGroup(groups, path) : groups;
  return { projects: order, groups: normalizeGroups(moved) };
}
