import { useMemo } from 'react';
import { RepoBadge } from '../welcome/repo-badge';
import { parentPathOf, useAllTasks } from '../tasks/tasks';
import { groupOf, projectName, useGroups } from './groups';
import { openGroupEditorAt } from './group-editor';
import { knownProjects, linkedProjects, useProjectDirectory } from './project-directory';

/**
 * Which projects the agent can use for this request, and why: this one, its group, the ones @mentioned. `edits` is
 * whether the request changes code; a task's branch covers its own project only, so there the others stay read only.
 */
export function ReadableProjects(props: { repoPath: string; text: string; agentName: string; edits: boolean }) {
  const { repoPath, text, agentName, edits } = props;
  const tasks = useAllTasks();
  const parent = parentPathOf(tasks, repoPath);
  const groups = useGroups((state) => state.groups);
  const rail = useProjectDirectory((state) => state.rail);
  const folders = useProjectDirectory((state) => state.folders);
  const group = groupOf(groups, parent);
  const verb = edits && parent === repoPath ? 'work in' : 'read';
  const linked = useMemo(() => linkedProjects(parent, [text], knownProjects({ rail, folders }), groups), [parent, text, rail, folders, groups]);

  if (linked.length === 0) {
    if (rail.length < 2) {
      return null;
    }
    return <p className="m-0 -mt-1 text-[11px] text-text-muted">Type @ and a project name to let {agentName} {verb} another project.</p>;
  }
  const rows = [{ path: parent, why: 'this project' }, ...linked.map((project) => ({ path: project.path, why: project.reason === 'group' ? `${group?.name ?? 'same'} group` : 'mentioned' }))];
  return (
    <div className="flex flex-col pt-2.5 border-t border-border">
      <div className="flex items-center mb-1">
        <span className="flex-1 text-xs font-medium text-text-secondary">{agentName} can {verb}</span>
        {group && (
          <button
            type="button"
            onClick={(event) => openGroupEditorAt(group.id, event.currentTarget, parent)}
            className="text-xs text-text-secondary hover:text-text underline underline-offset-2 cursor-pointer"
          >
            Edit group
          </button>
        )}
      </div>
      {rows.map((row) => (
        <div key={row.path} className="flex items-center gap-2 h-6 text-xs" title={row.path}>
          <RepoBadge name={projectName(row.path)} path={row.path} solid={row.path === parent} className="w-4 h-4 rounded text-[8px]" />
          <span className="flex-1 min-w-0 truncate text-text">{projectName(row.path)}</span>
          <span className="text-[11px] text-text-muted">{row.why}</span>
        </div>
      ))}
    </div>
  );
}
