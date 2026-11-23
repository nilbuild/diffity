import { describe, expect, it } from 'vitest';
import { linkedEditTracker } from '../src/features/groups/linked-changes';
import {
  arrangeOrder,
  defaultGroupName,
  expandShown,
  groupOf,
  groupWith,
  joinGroup,
  leaveGroup,
  normalizeGroups,
  planDrop,
  previewDrop,
  type RailGeometry,
  shownOrder,
  type ProjectGroup,
} from '../src/features/groups/groups';
import { linkedProjects, mentionedProjects, splitProjectMentions, type KnownProject } from '../src/features/groups/project-directory';

const group = (id: string, ...paths: string[]): ProjectGroup => ({ id, name: id, paths });

describe('project groups', () => {
  it('keeps each project in one group and drops groups of one', () => {
    const groups = normalizeGroups([group('a', '/x', '/y'), group('b', '/y', '/z'), group('c', '/w', '/w')]);
    expect(groups).toEqual([group('a', '/x', '/y')]);
  });

  it('names a new group after what the projects share', () => {
    expect(defaultGroupName(['/code/diffity-app', '/code/diffity-web'])).toBe('diffity');
    expect(defaultGroupName(['/code/web', '/code/api'])).toBe('web');
  });

  it('groups with a project, joining its group when it has one', () => {
    const made = groupWith([], '/a', '/b');
    expect(made[0].paths).toEqual(['/b', '/a']);
    const joined = groupWith(made, '/c', '/a');
    expect(joined).toHaveLength(1);
    expect(joined[0].paths).toEqual(['/b', '/a', '/c']);
  });

  it('moving a project to another group takes it out of its old one', () => {
    const groups = [group('a', '/a1', '/a2', '/a3'), group('b', '/b1', '/b2')];
    const moved = normalizeGroups(joinGroup(groups, '/a3', 'b'));
    expect(groupOf(moved, '/a3')?.id).toBe('b');
    expect(groupOf(moved, '/a1')?.paths).toEqual(['/a1', '/a2']);
  });

  it('dissolves a group when one project is left', () => {
    expect(normalizeGroups(leaveGroup([group('a', '/a', '/b')], '/a'))).toEqual([]);
  });

  it('keeps a group together on the rail where its first project is', () => {
    const groups = [group('g', '/b', '/d')];
    expect(arrangeOrder(['/a', '/b', '/c', '/d', '/e'], groups)).toEqual(['/a', '/b', '/d', '/c', '/e']);
  });

  it('shows a collapsed group as one stack and expands it back in place', () => {
    const groups = [{ ...group('g', '/b', '/c'), collapsed: true }];
    const order = ['/a', '/b', '/c', '/d'];
    expect(shownOrder(order, groups)).toEqual(['/a', '/b', '/d']);
    expect(expandShown(['/d', '/b', '/a'], order, groups)).toEqual(['/d', '/b', '/c', '/a']);
  });
});

describe('dragging on the rail', () => {
  /** Lays the rail out like the app: 36px tiles 10px apart, a group's box adds a header and tighter gaps. */
  function layout(order: string[], groups: ProjectGroup[]): RailGeometry {
    const tiles: RailGeometry['tiles'] = [];
    const boxes: RailGeometry['boxes'] = {};
    let y = 0;
    order.forEach((path, index) => {
      const group = groupOf(groups, path);
      const open = group && !group.collapsed;
      const first = open && groupOf(groups, order[index - 1] ?? '')?.id !== group.id;
      const last = open && groupOf(groups, order[index + 1] ?? '')?.id !== group.id;
      if (first) {
        boxes[group.id] = { top: y, bottom: 0 };
        y += 24;
      }
      tiles.push({ top: y, bottom: y + 36 });
      y += 36;
      if (last) {
        boxes[group.id].bottom = y + 4;
        y += 4 + 10;
        return;
      }
      y += open ? 6 : 10;
    });
    return { tiles, boxes };
  }
  const centre = (geometry: RailGeometry, index: number) => (geometry.tiles[index].top + geometry.tiles[index].bottom) / 2;

  it('stays put when let go where it started', () => {
    const groups = [group('shop', '/a', '/b')];
    const order = ['/x', '/a', '/b'];
    const geometry = layout(order, groups);
    for (const from of [0, 1, 2]) {
      expect(planDrop(order, groups, geometry, from, centre(geometry, from))).toMatchObject({ target: from, onto: null, join: null, leave: null });
    }
  });

  it('drops between the two projects of a group into the group, without pushing either out', () => {
    const groups = [group('shop', '/a', '/b')];
    const order = ['/x', '/a', '/b'];
    const geometry = layout(order, groups);
    const plan = planDrop(order, groups, geometry, 0, (geometry.tiles[1].bottom + geometry.tiles[2].top) / 2);
    expect(plan).toMatchObject({ target: 1, join: { id: 'shop' }, hint: 'Add to shop' });
    const preview = previewDrop(order, groups, 0, plan);
    expect(preview.projects).toEqual(['/a', '/x', '/b']);
    expect(groupOf(preview.groups, '/a')?.paths.sort()).toEqual(['/a', '/b', '/x']);
  });

  it('joins at the top of a group just inside its box, and stays out just above it', () => {
    const groups = [group('shop', '/a', '/b')];
    const order = ['/x', '/a', '/b'];
    const geometry = layout(order, groups);
    const box = geometry.boxes.shop;
    expect(planDrop(order, groups, geometry, 0, box.top + 6)).toMatchObject({ target: 0, join: { id: 'shop' } });
    expect(planDrop(order, groups, geometry, 0, box.top - 6)).toMatchObject({ target: 0, join: null, leave: null });
  });

  it('takes the last project out below a group at the end of the rail, leaving the rest grouped', () => {
    const groups = [group('shop', '/a', '/b', '/c')];
    const order = ['/x', '/a', '/b', '/c'];
    const geometry = layout(order, groups);
    const plan = planDrop(order, groups, geometry, 3, geometry.boxes.shop.bottom + 14);
    expect(plan).toMatchObject({ target: 3, leave: { id: 'shop' }, hint: 'Take out of shop' });
    const preview = previewDrop(order, groups, 3, plan);
    expect(groupOf(preview.groups, '/c')).toBeNull();
    expect(groupOf(preview.groups, '/a')?.paths).toEqual(['/a', '/b']);
  });

  it('dissolves a group of two when one is taken out', () => {
    const groups = [group('shop', '/a', '/b')];
    const order = ['/a', '/b'];
    const geometry = layout(order, groups);
    const plan = planDrop(order, groups, geometry, 0, geometry.boxes.shop.top - 14);
    expect(plan).toMatchObject({ leave: { id: 'shop' } });
    expect(previewDrop(order, groups, 0, plan).groups).toEqual([]);
  });

  it('groups with a project when dropped onto it, but only reorders over its own group', () => {
    const groups = [group('shop', '/a', '/b')];
    const order = ['/x', '/a', '/b', '/y'];
    const geometry = layout(order, groups);
    expect(planDrop(order, groups, geometry, 0, centre(geometry, 3))).toMatchObject({ onto: '/y', group: null, target: 3, hint: 'Group with y' });
    expect(planDrop(order, groups, geometry, 3, centre(geometry, 2))).toMatchObject({ onto: '/b', group: { id: 'shop' }, hint: 'Add to shop' });
    expect(planDrop(order, groups, geometry, 1, centre(geometry, 2))).toMatchObject({ onto: null, join: null, leave: null });
  });

  it('keeps a collapsed group out of other groups', () => {
    const groups = [group('shop', '/a', '/b'), { ...group('docs', '/d', '/e'), collapsed: true }];
    const order = ['/d', '/a', '/b'];
    const geometry = layout(order, groups);
    const plan = planDrop(order, groups, geometry, 0, (geometry.tiles[1].bottom + geometry.tiles[2].top) / 2);
    expect(plan).toMatchObject({ onto: null, join: null, leave: null });
    expect(plan.target === 0 || plan.target === 2).toBe(true);
  });
});

describe('project mentions', () => {
  const projects: KnownProject[] = [
    { name: 'roadmap.sh', path: '/code/roadmap.sh' },
    { name: 'diffity-web', path: '/code/diffity-web' },
  ];

  it('finds known projects, ignoring agents, code and unknown names', () => {
    const body = 'Ask @claude to check @roadmap.sh. Not `@diffity-web` or @nobody, but @Diffity-Web too.';
    expect(mentionedProjects(body, projects).map((project) => project.path)).toEqual(['/code/roadmap.sh', '/code/diffity-web']);
  });

  it('splits text around mentions without swallowing trailing punctuation', () => {
    expect(splitProjectMentions('see @roadmap.sh.', projects)).toEqual([
      { text: 'see ', project: null },
      { text: '@roadmap.sh', project: projects[0] },
      { text: '.', project: null },
    ]);
  });

  it('ignores email addresses', () => {
    expect(mentionedProjects('mail me at me@roadmap.sh', projects)).toEqual([]);
  });

  it('links the group first, then mentions, never the repo itself', () => {
    const groups = [group('g', '/code/app', '/code/diffity-web')];
    const linked = linkedProjects('/code/app', ['use @roadmap.sh and @diffity-web'], projects, groups);
    expect(linked).toEqual([
      { path: '/code/diffity-web', name: 'diffity-web', reason: 'group' },
      { path: '/code/roadmap.sh', name: 'roadmap.sh', reason: 'mentioned' },
    ]);
  });
});

describe('linkedEditTracker', () => {
  const projects = [{ path: '/code/api', name: 'api', reason: 'group' as const }];

  it('keeps finished edits inside linked projects', () => {
    const tracker = linkedEditTracker(projects);
    tracker.record({ type: 'toolCall', id: 'a', title: 'Edit', kind: 'edit', status: 'pending', locations: [] });
    tracker.record({ type: 'toolCallUpdate', id: 'a', status: 'in_progress', locations: ['/code/api/src/orders.js'] });
    tracker.record({ type: 'toolCallUpdate', id: 'a', status: 'completed' });
    tracker.record({ type: 'toolCall', id: 'b', title: 'Read', kind: 'read', status: 'completed', locations: ['/code/api/README.md'] });
    tracker.record({ type: 'toolCall', id: 'c', title: 'Edit', kind: 'edit', status: 'failed', locations: ['/code/api/x.js'] });
    tracker.record({ type: 'toolCall', id: 'd', title: 'Edit', kind: 'edit', status: 'completed', locations: ['/code/web/app.js'] });
    tracker.record({ type: 'toolCall', id: 'e', title: 'Edit', kind: 'edit', status: 'completed', locations: ['/code/api-old/y.js'] });
    expect(tracker.changes()).toEqual([{ path: '/code/api', name: 'api', files: ['src/orders.js'] }]);
  });
});
