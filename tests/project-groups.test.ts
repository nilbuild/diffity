import { describe, expect, it } from 'vitest';
import { linkedEditTracker } from '../src/features/groups/linked-changes';
import {
  arrangeOrder,
  defaultGroupName,
  dropMembership,
  expandShown,
  groupOf,
  groupWith,
  joinGroup,
  leaveGroup,
  normalizeGroups,
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

  it('dropping between two projects of a group joins it, dropping away leaves it', () => {
    const groups = [group('g', '/b', '/c')];
    expect(dropMembership(['/a', '/b', '/x', '/c'], groups, '/x').join?.id).toBe('g');
    expect(dropMembership(['/a', '/b', '/c', '/x'], groups, '/x')).toEqual({ join: null, leave: null });
    expect(dropMembership(['/b', '/a', '/c'], groups, '/b').leave?.id).toBe('g');
    expect(dropMembership(['/a', '/c', '/b'], groups, '/b')).toEqual({ join: null, leave: null });
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
