import { LinkIcon } from '../../components/ui/icon';
import { useAllTasks, parentPathOf } from '../tasks/tasks';
import { projectName, useGroupOf } from './groups';
import { groupEmoji } from './group-look';
import { openGroupEditorAt } from './group-editor';

/** Status bar note for a grouped project: which other projects Claude works with here. Opens the group editor. */
export function GroupPill(props: { repoPath: string }) {
  const { repoPath } = props;
  const tasks = useAllTasks();
  const parent = parentPathOf(tasks, repoPath);
  const group = useGroupOf(parent);

  if (!group) {
    return null;
  }
  const others = group.paths.filter((path) => path !== parent).map(projectName);
  const emoji = groupEmoji(group);
  return (
    <button
      type="button"
      onClick={(event) => openGroupEditorAt(group.id, event.currentTarget, parent)}
      className="inline-flex items-center gap-1.5 h-5 min-w-0 px-1.5 rounded hover:bg-hover hover:text-text cursor-pointer"
      title={`In the ${group.name} group: Claude can also work in ${others.join(', ')}. Click to edit the group.`}
    >
      {emoji ? <span className="shrink-0 text-[11px] leading-none">{emoji}</span> : <LinkIcon size="xs" className="shrink-0" />}
      <span className="truncate max-w-[220px]">{group.name} · with {others.join(', ')}</span>
    </button>
  );
}
