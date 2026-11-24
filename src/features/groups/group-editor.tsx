import { useEffect, useRef, useState } from 'react';
import { create } from 'zustand';
import { toast } from 'sonner';
import { Popover } from '../../components/ui/popover';
import { buttonGhost, buttonIconSmall, buttonOutline, inputField } from '../../components/ui/button-styles';
import { PlusIcon, XIcon } from '../../components/ui/icon';
import { cn } from '../../lib/cn';
import { shortPath } from '../welcome/recent-repos';
import { RepoBadge, repoInitials } from '../welcome/repo-badge';
import { ColorSwatches } from '../welcome/color-swatches';
import { colorStyle } from '../welcome/project-colors';
import { EmojiGrid } from '../welcome/emoji-grid';
import { groupColor, groupEmoji, styleGroup } from './group-look';
import { getGroups, groupOf, joinGroup, leaveGroup, projectName, renameGroup, setGroups, ungroup, useGroups, type ProjectGroup } from './groups';
import { useProjectDirectory } from './project-directory';

interface EditorState {
  groupId: string | null;
  /** Where the editor opens: its top-left corner, or its bottom-left when there's no room below. */
  at: { x: number; y: number } | null;
  /** The project on screen, marked in the list. */
  currentPath: string | null;
}

const useGroupEditor = create<EditorState>(() => ({ groupId: null, at: null, currentPath: null }));

export function openGroupEditor(groupId: string, at: { x: number; y: number }, currentPath: string | null) {
  useGroupEditor.setState({ groupId, at, currentPath });
}

/** Opens the editor next to an element: beside it on the rail, under (or over) it elsewhere. */
export function openGroupEditorAt(groupId: string, element: HTMLElement, currentPath: string | null, side: 'right' | 'below' = 'below') {
  const rect = element.getBoundingClientRect();
  const at = side === 'right' ? { x: rect.right + 8, y: rect.top - 6 } : { x: rect.left, y: rect.bottom > window.innerHeight / 2 ? rect.top - 6 : rect.bottom };
  openGroupEditor(groupId, at, currentPath);
}

export function useGroupEditorId(): string | null {
  return useGroupEditor((state) => state.groupId);
}

function closeGroupEditor() {
  useGroupEditor.setState({ groupId: null, at: null });
}

/** Applies a change to the groups and offers to undo it. */
export function changeGroups(next: ProjectGroup[], message: string, description?: string) {
  const before = getGroups();
  setGroups(next);
  toast(message, {
    description,
    duration: 8000,
    action: { label: 'Undo', onClick: () => setGroups(before) },
  });
}

export function GroupEditorHost() {
  const groupId = useGroupEditor((state) => state.groupId);
  const at = useGroupEditor((state) => state.at);
  const anchorRef = useRef<HTMLSpanElement>(null);
  const group = useGroups((state) => state.groups.find((item) => item.id === groupId) ?? null);

  useEffect(() => {
    if (groupId && !group) {
      closeGroupEditor();
    }
  }, [groupId, group]);

  return (
    <>
      {at && <span ref={anchorRef} aria-hidden className="fixed w-0 h-0 pointer-events-none" style={{ left: at.x, top: at.y }} />}
      <Popover open={!!group && !!at} onClose={closeGroupEditor} anchorRef={anchorRef} width={320} className="p-0">
        {group && <GroupEditor key={group.id} group={group} />}
      </Popover>
    </>
  );
}

function GroupEditor(props: { group: ProjectGroup }) {
  const { group } = props;
  const currentPath = useGroupEditor((state) => state.currentPath);
  const rail = useProjectDirectory((state) => state.rail);
  const groups = useGroups((state) => state.groups);
  const [name, setName] = useState(group.name);
  const [adding, setAdding] = useState(false);
  const candidates = rail.filter((path) => !group.paths.includes(path));

  const saveName = () => {
    if (name.trim() === group.name) {
      return;
    }
    if (!name.trim()) {
      setName(group.name);
      return;
    }
    setGroups(renameGroup(getGroups(), group.id, name));
  };

  const remove = (path: string) => {
    const left = group.paths.length - 1;
    changeGroups(
      leaveGroup(getGroups(), path),
      `Removed ${projectName(path)} from ${group.name}`,
      left < 2 ? 'A group needs two projects, so the group is gone.' : undefined,
    );
  };

  const add = (path: string) => {
    const from = groupOf(getGroups(), path);
    changeGroups(
      joinGroup(getGroups(), path, group.id),
      `Added ${projectName(path)} to ${group.name}`,
      from ? `It left ${from.name}.` : `Claude working in one of the ${group.paths.length + 1} projects can now work across all of them.`,
    );
    setAdding(false);
  };

  return (
    <div className="flex flex-col gap-3 p-3">
      <label className="flex flex-col gap-1">
        <span className="text-xs font-medium text-text-secondary">Group name</span>
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          onBlur={saveName}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              saveName();
              event.currentTarget.blur();
            }
          }}
          className={inputField}
          spellCheck={false}
        />
      </label>
      <GroupLook group={group} />
      <div className="flex flex-col">
        <span className="text-xs font-medium text-text-secondary mb-1">Projects</span>
        {group.paths.map((path) => (
          <div key={path} className="group/row flex items-center gap-2.5 h-8 px-1 -mx-1 rounded-md hover:bg-hover" title={path}>
            <RepoBadge name={projectName(path)} path={path} solid={path === currentPath} className="w-6 h-6 rounded-md text-[10px]" />
            <span className="flex-1 min-w-0 truncate text-[13px] text-text">{projectName(path)}</span>
            {path === currentPath && <span className="text-[11px] text-text-muted">open now</span>}
            <button
              type="button"
              onClick={() => remove(path)}
              aria-label={`Remove ${projectName(path)} from ${group.name}`}
              title="Remove from group"
              className={buttonIconSmall}
            >
              <XIcon size="xs" />
            </button>
          </div>
        ))}
        {candidates.length > 0 && (
          <button
            type="button"
            onClick={() => setAdding((value) => !value)}
            aria-expanded={adding}
            className="flex items-center gap-2.5 h-8 px-1 -mx-1 rounded-md text-left text-[13px] text-text-secondary hover:bg-hover hover:text-text cursor-pointer"
          >
            <span className="w-6 h-6 rounded-md border border-dashed border-control-border flex items-center justify-center"><PlusIcon size="xs" /></span>
            Add a project…
          </button>
        )}
        {adding && (
          <div className="mt-1 ml-8 flex flex-col border-l border-border pl-2">
            {candidates.map((path) => {
              const other = groupOf(groups, path);
              return (
                <button
                  key={path}
                  type="button"
                  onClick={() => add(path)}
                  className="flex items-center gap-2 h-7 px-2 rounded-md text-left text-[13px] text-text hover:bg-hover cursor-pointer"
                  title={shortPath(path)}
                >
                  <span className="flex-1 min-w-0 truncate">{projectName(path)}</span>
                  {other && <span className="text-[11px] text-text-muted">in {other.name}</span>}
                </button>
              );
            })}
          </div>
        )}
      </div>
      <p className="m-0 text-xs leading-4 text-text-muted">
        When Claude works in one of these projects, it can read the others and change them when the fix belongs there. Reviews only read.
      </p>
      <div className="flex items-center gap-2 pt-2 border-t border-border">
        <button
          type="button"
          onClick={() => {
            closeGroupEditor();
            changeGroups(ungroup(getGroups(), group.id), `Ungrouped ${group.name}`);
          }}
          className={cn(buttonGhost, '-ml-2.5 text-deleted hover:text-deleted hover:bg-deleted/10')}
        >
          Ungroup
        </button>
        <span className="flex-1" />
        <button type="button" onClick={closeGroupEditor} className={buttonOutline}>
          Done
        </button>
      </div>
    </div>
  );
}

/** The group's emoji and colour, as they show on the rail. */
function GroupLook(props: { group: ProjectGroup }) {
  const { group } = props;
  const [picking, setPicking] = useState(false);
  const emoji = groupEmoji(group);
  const color = groupColor(group);

  const pickEmoji = (value: string) => {
    setGroups(styleGroup(getGroups(), group.id, { emoji: value }));
    setPicking(false);
  };

  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs font-medium text-text-secondary">Icon and colour</span>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => setPicking((value) => !value)}
          aria-expanded={picking}
          aria-label="Choose an emoji"
          title="Choose an emoji"
          style={colorStyle(color)}
          className={cn('w-9 h-9 shrink-0 rounded-[10px] flex items-center justify-center project-tint hover:project-tint-strong cursor-pointer', picking && 'ring-2 ring-focus')}
        >
          {emoji ? <span className="text-[18px] leading-none">{emoji}</span> : <span className="text-[12px] font-semibold">{repoInitials(group.name)}</span>}
        </button>
        <ColorSwatches value={color.id} onPick={(id) => setGroups(styleGroup(getGroups(), group.id, { color: id }))} className="flex-1" />
      </div>
      {picking && (
        <EmojiGrid
          value={emoji}
          choices={[{ key: 'initials', label: repoInitials(group.name), title: 'No emoji: show initials', selected: !emoji, onPick: () => pickEmoji('') }]}
          onPick={pickEmoji}
          className="mt-1 p-1 rounded-lg bg-hover"
        />
      )}
    </div>
  );
}
