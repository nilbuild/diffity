import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import { cn } from '../../lib/cn';
import { repoBase, useRepoNav } from '../../hooks/use-repo';
import { openSettings, openShortcuts, openWhatsNew } from '../../lib/ui-store';
import { clickModKey, fileManagerName, modKey } from '../../lib/platform';
import { openRepoAt, shortPath, useRecentRepos } from '../../features/welcome/recent-repos';
import { repoInitials, useProjectInitials } from '../../features/welcome/repo-badge';
import { assignColors, colorStyle, setProjectColor, useProjectColor } from '../../features/welcome/project-colors';
import { ColorSwatches } from '../../features/welcome/color-swatches';
import { groupColor, groupEmoji, styleGroup } from '../../features/groups/group-look';
import { useProjectLogo } from '../../features/welcome/project-icons';
import { useProjectEmoji } from '../../features/welcome/project-emojis';
import { openProjectEditorAt, ProjectEditorHost, useProjectEditorPath } from '../../features/welcome/project-editor';
import { useBusyRepoPaths, useClaude } from '../../features/claude/claude-runner';
import { parentPathOf, useAllTasks } from '../../features/tasks/tasks';
import { useOpening } from '../../lib/opening';
import { switchToProject } from '../../features/welcome/resume';
import { ArrowDownIcon, ArrowUpIcon, CopyIcon, EditorIcon, ExternalLinkIcon, FoldIcon, FolderOpenIcon, LinkIcon, PencilIcon, PlusIcon, RevealIcon, SettingsIcon, TerminalIcon, HelpIcon, CommentIcon, BugIcon, StarIcon, InfoIcon, KeyboardIcon, UnfoldIcon, XIcon } from '../ui/icon';
import { ContextMenu, MenuItem, MenuLabel, MenuSeparator, Popover, useMenu } from '../ui/popover';
import { openFeedback } from '../../features/feedback/feedback-dialog';
import { starDiffity } from '../../features/feedback/star-prompt';
import { openPath, revealItemInDir } from '@tauri-apps/plugin-opener';
import * as tauri from '../../lib/tauri';
import { useEditorName } from '../../hooks/use-editor-name';
import { useSidebarShortcut } from './title-bar';
import { openQuickOpen } from '../../features/palette/quick-open';
import { Spinner } from '../icons/spinner';
import { arrangeOrder, expandShown, getGroups, groupOf, groupWith, joinGroup, leaveGroup, planDrop, previewDrop, setGroups, type RailGeometry, shownOrder, toggleCollapsed, ungroup, useGroups, type ProjectGroup } from '../../features/groups/groups';
import { changeGroups, GroupEditorHost, openGroupEditorAt, useGroupEditorId } from '../../features/groups/group-editor';
import { RepoBadge } from '../../features/welcome/repo-badge';
import { setRailProjects } from '../../features/groups/project-directory';
import { clearLinkedChanges, setProjectOpener, useLinkedChanges } from '../../features/groups/linked-changes';
import { KeyLabel } from '../ui/key-label';

const RailContext = createContext(false);

export function useInsideRail() {
  return useContext(RailContext);
}

const ORDER_KEY = 'diffity-rail-order';
const MAX_PROJECTS = 9;

function readOrder(): string[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(ORDER_KEY) ?? '[]');
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [];
  } catch {
    return [];
  }
}

function writeOrder(order: string[]) {
  try {
    localStorage.setItem(ORDER_KEY, JSON.stringify(order));
  } catch {
    return;
  }
}

function repoName(path: string) {
  return path.split('/').filter(Boolean).pop() ?? 'repo';
}

/** Feedback, bug reports, What's new, shortcuts and the GitHub star, in one place above Settings. */
function HelpButton() {
  const menu = useMenu();
  const run = (action: () => void) => () => {
    menu.close();
    action();
  };

  return (
    <div className="group relative w-full flex justify-center mb-1">
      <button
        ref={menu.anchorRef}
        onClick={menu.toggle}
        aria-label="Help and feedback"
        aria-haspopup="menu"
        aria-expanded={menu.open}
        className={cn(
          'w-9 h-9 rounded-[10px] flex items-center justify-center text-text-secondary hover:text-text hover:bg-hover transition-colors cursor-pointer',
          menu.open && 'bg-hover text-text',
        )}
      >
        <HelpIcon size="xl" />
      </button>
      {!menu.open && <RailTooltip title="Help and feedback" />}
      <Popover open={menu.open} onClose={menu.close} anchorRef={menu.anchorRef} width={240}>
        <MenuItem icon={<CommentIcon size="sm" />} label="Send feedback…" onSelect={run(() => openFeedback('idea'))} />
        <MenuItem icon={<BugIcon size="sm" />} label="Report a bug…" onSelect={run(() => openFeedback('bug'))} />
        <MenuSeparator />
        <MenuItem icon={<InfoIcon size="sm" />} label="What’s new" onSelect={run(openWhatsNew)} />
        <MenuItem icon={<KeyboardIcon size="sm" />} label="Keyboard shortcuts" hint="?" onSelect={run(openShortcuts)} />
        <MenuSeparator />
        <MenuItem icon={<StarIcon size="sm" className="text-modified" />} label="Star on GitHub" onSelect={run(() => void starDiffity())} />
      </Popover>
    </div>
  );
}

function RailTooltip(props: { title: string; detail?: string; shortcut?: string | null }) {
  const { title, detail, shortcut } = props;

  return (
    <span
      role="tooltip"
      className="pointer-events-none absolute left-[calc(100%-2px)] top-1/2 -translate-y-1/2 z-50 flex flex-col gap-0.5 max-w-[280px] px-2.5 py-1.5 rounded-md bg-overlay border border-overlay-border text-left whitespace-nowrap opacity-0 invisible transition-opacity duration-100 group-hover:opacity-100 group-hover:visible group-hover:delay-300"
    >
      <span className="flex items-center gap-2 text-[13px] font-medium text-text">
        {title}
        {shortcut && <kbd className="font-sans text-[11px] text-text-muted"><KeyLabel keys={shortcut} /></kbd>}
      </span>
      {detail && <span className="text-[11px] text-text-secondary truncate">{detail}</span>}
    </span>
  );
}

function DropHint(props: { text: string }) {
  const { text } = props;

  return (
    <span className="pointer-events-none absolute left-[calc(100%-2px)] top-1/2 -translate-y-1/2 z-50 px-2.5 py-1 rounded-md bg-overlay border border-overlay-border text-[12px] font-medium text-text whitespace-nowrap">
      {text}
    </span>
  );
}

const tileBase = 'relative w-9 h-9 rounded-[10px] flex items-center justify-center select-none';

function useDelayedFlag(on: boolean, ms: number) {
  const [shown, setShown] = useState(false);

  useEffect(() => {
    if (!on) {
      setShown(false);
      return;
    }
    const timer = setTimeout(() => setShown(true), ms);
    return () => clearTimeout(timer);
  }, [on, ms]);
  return shown;
}

interface ProjectTileProps {
  loading: boolean;
  path: string;
  index: number;
  current: boolean;
  busy: boolean;
  /** An agent here (or in one of its tasks) is waiting for an approval. */
  waiting: boolean;
  /** An agent working from another project changed files here since it was last opened. */
  changed: { agent: string; files: string[] } | null;
  /** The copy that follows the pointer while this tile is dragged. */
  dragging: boolean;
  /** The gap where the dragged tile will land. */
  placeholder: boolean;
  onPointerDown: (event: React.PointerEvent<HTMLButtonElement>, index: number) => void;
  onOpen: (newWindow: boolean) => void;
  onMenu: (at: { x: number; y: number }) => void;
  /** This tile's menu is open: the tile stays marked so it's clear what the menu is for. */
  menuTarget: boolean;
  /** Any rail menu or popover is open: tooltips stay hidden so they never sit behind it. */
  menusOpen: boolean;
  /** The dragged tile is over this one: letting go groups them. */
  dropTarget: boolean;
  /** What letting go of this tile, while dragged, does to its group. */
  dropHint: string | null;
  /** This tile, while dragged, is over another one it would group with. */
  dropOnto: boolean;
}

function ProjectTile(props: ProjectTileProps) {
  const { path, index, current, busy, waiting, changed, dragging, placeholder, onPointerDown, onOpen, onMenu, loading, menuTarget, menusOpen, dropTarget, dropHint, dropOnto } = props;
  const spinning = useDelayedFlag(loading, 150);
  const name = repoName(path);
  const initials = useProjectInitials(name);
  const color = useProjectColor(path);
  const emoji = useProjectEmoji(path);
  const { logo, fill, shown: logoShown } = useProjectLogo(path);
  const showLogo = logoShown && !emoji;
  const filled = showLogo && fill;
  const shortcut = index < 9 ? `${modKey}${index + 1}` : null;

  return (
    <div data-rail-tile={dragging ? undefined : true} data-flip={dragging ? undefined : path} className="group relative w-full flex justify-center">
      {placeholder ? <DropGap /> : (
      <>
      {current && !dragging && <span aria-hidden className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-r-full bg-text" />}
      <button
        style={colorStyle(color)}
        onPointerDown={(event) => onPointerDown(event, index)}
        onClick={(event) => onOpen(event.metaKey || event.ctrlKey)}
        onContextMenu={(event) => {
          event.preventDefault();
          const rect = event.currentTarget.getBoundingClientRect();
          onMenu({ x: rect.right + 6, y: rect.top });
        }}
        onKeyDown={(event) => {
          if (event.key === 'ContextMenu' || (event.key === 'F10' && event.shiftKey)) {
            event.preventDefault();
            const rect = event.currentTarget.getBoundingClientRect();
            onMenu({ x: rect.right + 4, y: rect.top });
          }
        }}
        aria-label={name}
        aria-current={current ? 'page' : undefined}
        className={cn(
          tileBase,
          'text-[12px] font-semibold tracking-wide touch-none',
          !showLogo && !emoji && (current ? 'project-solid' : 'project-tint hover:project-tint-strong'),
          // Logo and emoji tiles show they're current by the bar at the left edge, like every tile, not by an outline.
          (showLogo || emoji) && !filled && (current ? 'project-tint-strong' : 'project-tint hover:project-tint-strong'),
          dragging ? 'cursor-grabbing ring-1 ring-control-border opacity-90 shadow-lg' : 'cursor-pointer',
          dragging && dropOnto && 'scale-75 opacity-100 shadow-lg',
          menuTarget && 'ring-2 ring-focus ring-offset-2 ring-offset-frame',
          menuTarget && !current && 'project-tint-strong',
          dropTarget && 'ring-2 ring-focus ring-offset-2 ring-offset-frame scale-110',
        )}
      >
        {showLogo && logo && <img alt="" src={logo} decoding="sync" draggable={false} className={cn('pointer-events-none transition-opacity', filled ? 'absolute inset-0 w-full h-full rounded-[inherit] object-cover' : 'w-6 h-6 object-contain', spinning && 'opacity-30')} />}
        {emoji && <span className={cn('text-[18px] leading-none transition-opacity', spinning && 'opacity-30')}>{emoji}</span>}
        {!(showLogo && logo) && !emoji && !spinning && initials}
        {spinning && <Spinner className={cn('w-3.5 h-3.5 text-current', ((showLogo && logo) || emoji) && 'absolute')} label="Opening" />}
        {waiting && <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-modified ring-2 ring-frame" title="Waiting for your approval" />}
        {busy && !waiting && <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-claude ring-2 ring-frame" title="Claude is working here" />}
        {changed && !busy && !waiting && <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-accent ring-2 ring-frame" />}
      </button>
      {!dragging && !menusOpen && (
        <RailTooltip
          title={name}
          detail={changed ? `${changed.agent} changed ${changedFiles(changed.files)} here · open to review` : `${shortPath(path)} · drag to reorder or onto another to group · right-click for more`}
          shortcut={shortcut}
        />
      )}
      {dragging && dropHint && <DropHint text={dropHint} />}
      </>
      )}
    </div>
  );
}

function middle(span: { top: number; bottom: number }) {
  return (span.top + span.bottom) / 2;
}

function shiftOf(element: HTMLElement) {
  const transform = getComputedStyle(element).transform;
  return transform === 'none' ? 0 : new DOMMatrixReadOnly(transform).m42;
}

/** Slides rail tiles from where they were to where they are after a render moves them. Set the returned ref to
 * start one tile from somewhere else instead, like the dragged copy it replaces. */
function useFlip(listRef: RefObject<HTMLElement | null>) {
  const tops = useRef(new Map<string, number>());
  const from = useRef<{ key: string; top: number } | null>(null);

  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list) {
      return;
    }
    const pending = from.current;
    from.current = null;
    const next = new Map<string, number>();
    list.querySelectorAll<HTMLElement>('[data-flip]').forEach((element) => {
      const key = element.dataset.flip ?? '';
      const shift = shiftOf(element);
      const top = element.getBoundingClientRect().top - shift;
      next.set(key, top);
      const before = tops.current.get(key);
      const start = pending?.key === key ? pending.top : before === undefined || Math.abs(before - top) < 0.5 ? null : before + shift;
      if (start === null) {
        return;
      }
      element.style.transition = 'none';
      element.style.transform = `translateY(${start - top}px)`;
      void element.offsetHeight;
      element.style.transition = 'transform 160ms cubic-bezier(0.2, 0, 0, 1)';
      element.style.transform = '';
    });
    tops.current = next;
  });

  return from;
}

function DropGap() {
  return <div aria-hidden className={cn(tileBase, 'border border-dashed border-control-border bg-hover')} />;
}

function useProjectOrder(currentPath: string, openingPath: string | null) {
  const recent = useRecentRepos();
  const [order, setOrder] = useState(readOrder);
  const groups = useGroups((state) => state.groups);

  const projects = useMemo(() => {
    const known = new Set(recent.repos.map((repo) => repo.path));
    known.add(currentPath);
    // Until the recent list (and what is hidden from it) has loaded, the stored order is the best answer.
    const ordered = recent.loading ? [...order] : order.filter((path) => known.has(path));
    const missing = recent.repos
      .filter((repo) => !ordered.includes(repo.path))
      .sort((left, right) => left.lastOpenedAt.localeCompare(right.lastOpenedAt))
      .map((repo) => repo.path);
    for (const path of missing) {
      ordered.push(path);
    }
    if (!ordered.includes(currentPath)) {
      ordered.push(currentPath);
    }
    if (openingPath && !ordered.includes(openingPath)) {
      ordered.push(openingPath);
    }
    return arrangeOrder(ordered, groups);
  }, [order, recent.repos, recent.loading, currentPath, openingPath, groups]);

  useEffect(() => {
    if (recent.loading) {
      return;
    }
    const same = projects.length === order.length && projects.every((path, index) => order[index] === path);
    if (same) {
      return;
    }
    setOrder(projects);
    writeOrder(projects);
  }, [projects, order, recent.loading]);

  const visible = useMemo(() => {
    const shown = shownOrder(projects, groups);
    if (shown.length <= MAX_PROJECTS) {
      return shown;
    }
    const currentGroup = groupOf(groups, currentPath);
    const current = currentGroup?.collapsed ? shown.find((path) => currentGroup.paths.includes(path)) ?? currentPath : currentPath;
    const head = shown.slice(0, MAX_PROJECTS);
    if (head.includes(current)) {
      return head;
    }
    return [...head.slice(0, MAX_PROJECTS - 1), current];
  }, [projects, groups, currentPath]);

  /** Moves a tile (or a collapsed group's stack) to `toIndex` among the tiles on the rail. */
  const move = useCallback((fromPath: string, toIndex: number) => {
    const next = visible.filter((path) => path !== fromPath);
    next.splice(toIndex, 0, fromPath);
    const shown = expandShown(next, projects, groups);
    const rest = projects.filter((path) => !shown.includes(path));
    const full = [...shown, ...rest];
    setOrder(full);
    writeOrder(full);
  }, [visible, projects, groups]);

  const remove = useCallback((path: string) => {
    const index = projects.indexOf(path);
    const next = projects.filter((item) => item !== path);
    setOrder(next);
    writeOrder(next);
    void recent.remove(path);
    return () => {
      const restored = [...next];
      restored.splice(Math.max(0, index), 0, path);
      setOrder(restored);
      writeOrder(restored);
      void recent.restore(path);
    };
  }, [projects, recent]);

  return { projects: visible, all: projects, move, remove };
}

export function RailFrame(props: { children: ReactNode }) {
  const { children } = props;
  useSidebarShortcut();

  return (
    <RailContext.Provider value>
      <div className="flex h-screen overflow-hidden bg-frame">
        <ActivityRail />
        <div className="flex-1 min-w-0 relative">{children}</div>
      </div>
      <GroupEditorHost />
      <ProjectEditorHost />
    </RailContext.Provider>
  );
}

function ActivityRail() {
  const nav = useRepoNav();
  const navigate = useNavigate();
  const tasks = useAllTasks();
  const currentPath = parentPathOf(tasks, nav.repoPath);
  const busyRepos = new Set([...useBusyRepoPaths()].map((path) => parentPathOf(tasks, path)));
  const permissions = useClaude((state) => state.permissions);
  const waitingRepos = new Set(permissions.map((permission) => parentPathOf(tasks, permission.repoPath)));
  const rawOpeningPath = useOpening((state) => state.target?.path ?? null);
  const openingPath = rawOpeningPath ? parentPathOf(tasks, rawOpeningPath) : null;
  const { projects, all, move, remove } = useProjectOrder(currentPath, openingPath);
  const groups = useGroups((state) => state.groups);
  const navRef = useRef<HTMLElement>(null);
  const [drag, setDrag] = useState<{ from: number; startY: number; dy: number; active: boolean; geometry: RailGeometry; left: number; width: number } | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const ghostRef = useRef<HTMLDivElement>(null);
  const [picker, setPicker] = useState<{ path: string; at: { x: number; y: number } } | null>(null);
  const [groupMenu, setGroupMenu] = useState<{ groupId: string; at: { x: number; y: number } } | null>(null);
  const editingGroupId = useGroupEditorId();
  const suppressClick = useRef(false);
  const [menu, setMenu] = useState<{ path: string; at: { x: number; y: number } } | null>(null);
  const editingPath = useProjectEditorPath();
  const editor = useEditorName();
  const changedProjects = useLinkedChanges((state) => state.byPath);

  useEffect(() => {
    setRailProjects(all);
    assignColors(all);
  }, [all]);

  useEffect(() => {
    clearLinkedChanges(currentPath);
  }, [currentPath, changedProjects]);

  const editProject = (path: string) => {
    const tile = navRef.current?.querySelector<HTMLElement>(`[data-flip="${CSS.escape(path)}"]`);
    if (tile) {
      openProjectEditorAt(path, tile);
    }
  };

  const editGroup = (group: ProjectGroup) => {
    const box = navRef.current?.querySelector<HTMLElement>(`[data-group-id="${group.id}"]`);
    if (box) {
      openGroupEditorAt(group.id, box, currentPath, 'right');
    }
  };

  const menusOpen = !!menu || !!picker || !!editingPath || !!groupMenu || !!editingGroupId;

  const removeProject = (path: string) => {
    const wasCurrent = path === currentPath;
    const index = projects.indexOf(path);
    const others = projects.filter((item) => item !== path);
    const groupsBefore = getGroups();
    if (groupOf(groupsBefore, path)) {
      setGroups(leaveGroup(groupsBefore, path));
    }
    const undoRemove = remove(path);
    const undo = () => {
      undoRemove();
      setGroups(groupsBefore);
    };
    if (wasCurrent) {
      const target = others[Math.min(index, others.length - 1)];
      if (target) {
        openProject(target);
      } else {
        navigate('/');
      }
    }
    toast(`Removed ${repoName(path)} from the sidebar`, {
      description: 'The folder was not touched.',
      duration: 8000,
      action: {
        label: 'Undo',
        onClick: () => {
          undo();
          if (wasCurrent) {
            openProject(path);
          }
        },
      },
    });
  };

  const openProject = useCallback((path: string, newWindow = false) => {
    if (path === currentPath && !newWindow) {
      navigate(`${repoBase(path)}/overview`);
      return;
    }
    if (newWindow) {
      void openRepoAt(path, navigate, { newWindow });
      return;
    }
    void switchToProject(path, navigate);
  }, [currentPath, navigate]);

  useEffect(() => {
    setProjectOpener(openProject);
  }, [openProject]);


  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.altKey) {
        return;
      }
      if (!event.shiftKey && /^[1-9]$/.test(event.key)) {
        const target = projects[Number(event.key) - 1];
        if (!target) {
          return;
        }
        event.preventDefault();
        openProject(target);
        return;
      }
      if (event.shiftKey && ['[', ']', '{', '}'].includes(event.key)) {
        const index = projects.indexOf(currentPath);
        const step = event.key === '[' || event.key === '{' ? -1 : 1;
        const target = projects[(index + step + projects.length) % projects.length];
        if (!target) {
          return;
        }
        event.preventDefault();
        openProject(target);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [projects, currentPath, openProject]);

  const drop = drag?.active ? planDrop(projects, groups, drag.geometry, drag.from, middle(drag.geometry.tiles[drag.from]) + drag.dy) : null;
  const draggedPath = drag?.active ? projects[drag.from] : null;
  const view = drag?.active && drop ? previewDrop(projects, groups, drag.from, drop) : { projects, groups };
  const dropGroup = drop?.onto && drop.group && !drop.group.collapsed ? drop.group : null;
  const draggedStack = draggedPath ? groupOf(groups, draggedPath) : null;
  const flipFrom = useFlip(listRef);

  const dragRef = useRef(drag);
  dragRef.current = drag;
  const dropRef = useRef(drop);
  dropRef.current = drop;
  const projectsRef = useRef(projects);
  projectsRef.current = projects;

  const handlePointerDown = (event: React.PointerEvent<HTMLButtonElement>, index: number) => {
    if (event.button !== 0 || !listRef.current || !navRef.current) {
      return;
    }
    suppressClick.current = false;
    const tiles = [...listRef.current.querySelectorAll<HTMLElement>('[data-rail-tile]')].map((tile) => {
      const rect = tile.getBoundingClientRect();
      return { top: rect.top, bottom: rect.bottom };
    });
    if (tiles.length !== projectsRef.current.length) {
      return;
    }
    const boxes: RailGeometry['boxes'] = {};
    listRef.current.querySelectorAll<HTMLElement>('[data-group-id]').forEach((box) => {
      const rect = box.getBoundingClientRect();
      boxes[box.dataset.groupId ?? ''] = { top: rect.top, bottom: rect.bottom };
    });
    const nav = navRef.current.getBoundingClientRect();
    setDrag({ from: index, startY: event.clientY, dy: 0, active: false, geometry: { tiles, boxes }, left: nav.left, width: nav.width });
  };

  const dragging = drag !== null;
  useEffect(() => {
    if (!dragging) {
      return;
    }
    const onMove = (event: PointerEvent) => {
      const current = dragRef.current;
      if (!current) {
        return;
      }
      const dy = event.clientY - current.startY;
      if (!current.active && Math.abs(dy) < 4) {
        return;
      }
      suppressClick.current = true;
      const { tiles } = current.geometry;
      const min = tiles[0].top - tiles[current.from].top - 24;
      const max = tiles[tiles.length - 1].bottom - tiles[current.from].bottom + 24;
      setDrag({ ...current, dy: Math.max(min, Math.min(max, dy)), active: true });
    };
    const settleGhost = (path: string) => {
      const ghost = ghostRef.current?.getBoundingClientRect();
      if (!ghost) {
        return;
      }
      const stack = groupOf(getGroups(), path);
      flipFrom.current = { key: stack?.collapsed ? `group:${stack.id}` : path, top: ghost.top };
    };
    const finish = () => {
      setDrag(null);
      setTimeout(() => {
        suppressClick.current = false;
      }, 0);
    };
    const onKey = (event: KeyboardEvent) => {
      const current = dragRef.current;
      if (event.key !== 'Escape' || !current?.active) {
        return;
      }
      event.preventDefault();
      settleGhost(projectsRef.current[current.from]);
      finish();
    };
    const onUp = () => {
      const current = dragRef.current;
      const plan = dropRef.current;
      if (current?.active) {
        settleGhost(projectsRef.current[current.from]);
      }
      if (current?.active && plan && (plan.onto || plan.join || plan.leave || plan.target !== current.from)) {
        const path = projectsRef.current[current.from];
        const name = repoName(path);
        if (plan.onto) {
          const message = plan.group ? `Added ${name} to ${plan.group.name}` : `Grouped ${name} with ${repoName(plan.onto)}`;
          changeGroups(groupWith(getGroups(), path, plan.onto), message, GROUPED_NOTE);
        } else if (plan.join) {
          changeGroups(joinGroup(getGroups(), path, plan.join.id), `Added ${name} to ${plan.join.name}`, GROUPED_NOTE);
        } else if (plan.leave) {
          changeGroups(leaveGroup(getGroups(), path), `Took ${name} out of ${plan.leave.name}`);
        }
        move(path, plan.target);
      }
      finish();
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      window.removeEventListener('keydown', onKey, true);
    };
  }, [dragging, move, flipFrom]);

  const quiet = menusOpen || !!draggedPath;
  const projectTile = (path: string, ghost: boolean) => (
    <ProjectTile
      key={path}
      path={path}
      index={projects.indexOf(path)}
      current={openingPath ? path === openingPath : path === currentPath}
      loading={path === openingPath}
      busy={busyRepos.has(path)}
      waiting={waitingRepos.has(path)}
      changed={path === currentPath ? null : changedProjects[path] ?? null}
      dragging={ghost}
      placeholder={!ghost && path === draggedPath}
      onPointerDown={handlePointerDown}
      onOpen={(newWindow) => openProject(path, newWindow)}
      onMenu={(at) => setMenu({ path, at })}
      menuTarget={menu?.path === path || picker?.path === path || editingPath === path}
      menusOpen={quiet}
      dropTarget={!ghost && drop?.onto === path}
      dropHint={ghost ? drop?.hint ?? null : null}
      dropOnto={ghost && !!drop?.onto}
    />
  );
  const stackTile = (group: ProjectGroup, first: string, ghost: boolean) => {
    const members = all.filter((item) => group.paths.includes(item));
    return (
      <StackTile
        group={group}
        members={members}
        index={projects.indexOf(first)}
        openPath={members.find((member) => member === (openingPath ?? currentPath)) ?? null}
        highlighted={groupMenu?.groupId === group.id || editingGroupId === group.id}
        dropTarget={!ghost && drop?.onto === first}
        busy={members.some((member) => busyRepos.has(member))}
        waiting={members.some((member) => waitingRepos.has(member))}
        changed={members.some((member) => member !== currentPath && !!changedProjects[member])}
        dragging={ghost}
        placeholder={!ghost && first === draggedPath}
        onPointerDown={handlePointerDown}
        onExpand={() => setGroups(toggleCollapsed(getGroups(), group.id))}
        menusOpen={quiet}
      />
    );
  };

  return (
    <nav
      ref={navRef}
      className="relative z-20 w-[52px] shrink-0 flex flex-col items-center bg-frame select-none"
      aria-label="Projects"
      onClickCapture={(event) => {
        if (!suppressClick.current) {
          return;
        }
        suppressClick.current = false;
        event.preventDefault();
        event.stopPropagation();
      }}
    >
      <div data-tauri-drag-region className="h-11 w-full shrink-0" />
      <div ref={listRef} className="flex flex-col items-center gap-2.5 w-full pt-1.5">
        {railSegments(view.projects, view.groups).map((segment) => {
          const group = segment.group;
          if (group?.collapsed) {
            return (
              <GroupBox
                key={group.id}
                group={group}
                highlighted={groupMenu?.groupId === group.id || editingGroupId === group.id}
                menusOpen={quiet}
                onToggle={() => setGroups(toggleCollapsed(getGroups(), group.id))}
                onMenu={(at) => setGroupMenu({ groupId: group.id, at })}
              >
                {stackTile(group, segment.items[0].path, false)}
              </GroupBox>
            );
          }
          const tiles = segment.items.map(({ path }) => projectTile(path, false));
          if (!group) {
            return tiles;
          }
          return (
            <GroupBox
              key={group.id}
              group={group}
              highlighted={dropGroup?.id === group.id || groupMenu?.groupId === group.id || editingGroupId === group.id}
              menusOpen={quiet}
              onToggle={() => setGroups(toggleCollapsed(getGroups(), group.id))}
              onMenu={(at) => setGroupMenu({ groupId: group.id, at })}
            >
              {tiles}
            </GroupBox>
          );
        })}
        <div className="group relative w-full flex justify-center mt-1.5">
          <button
            onClick={openQuickOpen}
            aria-label="Open folder"
            className={cn(tileBase, 'border border-dashed border-control-border text-text-muted hover:text-text hover:border-text-muted hover:bg-hover cursor-pointer')}
          >
            <PlusIcon size="md" />
          </button>
          <RailTooltip title="Open…" detail="A folder, a recent project or a GitHub URL" shortcut={`${modKey}O`} />
        </div>
      </div>
      {drag?.active && draggedPath && (
        <div
          ref={ghostRef}
          className="fixed z-50 pointer-events-none"
          style={{ left: drag.left, width: drag.width, top: drag.geometry.tiles[drag.from].top + drag.dy }}
        >
          {draggedStack?.collapsed ? stackTile(draggedStack, draggedPath, true) : projectTile(draggedPath, true)}
        </div>
      )}
      <div data-tauri-drag-region className="flex-1 w-full" />
      <HelpButton />
      <div className="group relative w-full flex justify-center pb-3">
        <button
          onClick={openSettings}
          aria-label="Settings"
          className="w-9 h-9 rounded-[10px] flex items-center justify-center text-text-secondary hover:text-text hover:bg-hover transition-colors cursor-pointer"
        >
          <SettingsIcon size="xl" />
        </button>
        <RailTooltip title="Settings" shortcut={`${modKey},`} />
      </div>
      {menu && (
        <ContextMenu position={menu.at} onClose={() => setMenu(null)} width={240}>
          <ProjectMenuItems
            path={menu.path}
            current={menu.path === nav.repoPath}
            editor={editor}
            index={projects.indexOf(menu.path)}
            count={projects.length}
            onClose={() => setMenu(null)}
            onOpen={(newWindow) => openProject(menu.path, newWindow)}
            onMove={(delta) => move(menu.path, projects.indexOf(menu.path) + delta)}
            onRemove={() => removeProject(menu.path)}
            group={groupOf(groups, menu.path)}
            groups={groups}
            canGroup={all.length > 1}
            onEditGroup={editGroup}
            onPickGroup={() => setPicker({ path: menu.path, at: menu.at })}
            onEditProject={() => editProject(menu.path)}
          />
        </ContextMenu>
      )}
      {picker && (
        <ContextMenu position={picker.at} onClose={() => setPicker(null)} width={240}>
          <MenuLabel>Group {repoName(picker.path)} with</MenuLabel>
          {all.filter((path) => path !== picker.path).map((path) => {
            const other = groupOf(groups, path);
            return (
              <MenuItem
                key={path}
                icon={<RepoBadge name={repoName(path)} path={path} className="w-4 h-4 rounded text-[8px]" />}
                label={repoName(path)}
                hint={other ? `in ${other.name}` : undefined}
                onSelect={() => {
                  const name = repoName(picker.path);
                  setPicker(null);
                  const next = groupWith(getGroups(), picker.path, path);
                  const message = other ? `Added ${name} to ${other.name}` : `Grouped ${name} with ${repoName(path)}`;
                  changeGroups(next, message, GROUPED_NOTE);
                }}
              />
            );
          })}
        </ContextMenu>
      )}
      {groupMenu && (
        <GroupMenu
          group={groups.find((item) => item.id === groupMenu.groupId) ?? null}
          at={groupMenu.at}
          onClose={() => setGroupMenu(null)}
          onEdit={editGroup}
        />
      )}
    </nav>
  );
}

function GroupBox(props: {
  group: ProjectGroup;
  highlighted: boolean;
  menusOpen: boolean;
  onToggle: () => void;
  onMenu: (at: { x: number; y: number }) => void;
  children: ReactNode;
}) {
  const { group, highlighted, menusOpen, onToggle, onMenu, children } = props;

  const openMenu = (event: React.MouseEvent<HTMLDivElement>) => {
    if (event.defaultPrevented) {
      return;
    }
    event.preventDefault();
    const rect = event.currentTarget.getBoundingClientRect();
    onMenu({ x: rect.right + 6, y: rect.top });
  };

  if (group.collapsed) {
    return (
      <div data-group-id={group.id} onContextMenu={openMenu} className="w-full flex flex-col items-center">
        {children}
      </div>
    );
  }
  const emoji = groupEmoji(group);

  return (
    <div
      data-group-id={group.id}
      onContextMenu={openMenu}
      style={colorStyle(groupColor(group))}
      className={cn('flex flex-col items-center gap-1.5 w-11 pb-1 rounded-[13px] project-wash', highlighted && 'ring-2 ring-focus')}
    >
      <div className="group relative w-full flex justify-center">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded
          aria-label={`${group.name} group, ${group.paths.length} projects. Collapse`}
          className={cn(
            'w-full px-1 rounded-t-[13px] font-semibold project-text hover:text-text cursor-pointer',
            emoji ? 'h-6 pt-1 text-[14px] leading-5' : 'h-4 mt-0.5 text-[9px] leading-4 truncate',
          )}
        >
          {emoji ?? group.name}
        </button>
        {!menusOpen && (
          <RailTooltip title={`${emoji ? `${emoji} ` : ''}${group.name} · ${group.paths.length} projects`} detail="Claude can work across all of them · drag a project in or out · click to collapse" />
        )}
      </div>
      {children}
    </div>
  );
}

/** A collapsed group on the rail: one tile named after the group, with a count; click to expand. */
function StackTile(props: {
  group: ProjectGroup;
  members: string[];
  openPath: string | null;
  index: number;
  highlighted: boolean;
  dropTarget: boolean;
  busy: boolean;
  waiting: boolean;
  changed: boolean;
  dragging: boolean;
  placeholder: boolean;
  menusOpen: boolean;
  onPointerDown: (event: React.PointerEvent<HTMLButtonElement>, index: number) => void;
  onExpand: () => void;
}) {
  const { group, members, openPath, index, highlighted, dropTarget, busy, waiting, changed, dragging, placeholder, menusOpen, onPointerDown, onExpand } = props;
  const names = members.map((member) => (member === openPath ? `${repoName(member)} (open)` : repoName(member)));
  const emoji = groupEmoji(group);

  return (
    <div data-rail-tile={dragging ? undefined : true} data-flip={dragging ? undefined : `group:${group.id}`} className="group relative w-full flex justify-center">
      {placeholder ? <DropGap /> : (
      <>
      <button
        style={colorStyle(groupColor(group))}
        onPointerDown={(event) => onPointerDown(event, index)}
        onClick={onExpand}
        aria-label={`${group.name} group: ${names.join(', ')}. Expand`}
        aria-current={openPath ? 'page' : undefined}
        className={cn(
          tileBase,
          'text-[12px] font-semibold tracking-wide touch-none',
          openPath ? 'project-tint-strong ring-2 ring-inset ring-(--project)' : 'project-tint hover:project-tint-strong',
          dragging ? 'cursor-grabbing opacity-90 shadow-lg' : 'cursor-pointer',
          (highlighted || dropTarget) && 'ring-2 ring-focus ring-offset-2 ring-offset-frame',
          dropTarget && 'scale-110',
        )}
      >
        {emoji ? <span className="text-[18px] leading-none">{emoji}</span> : repoInitials(group.name)}
        <span className="absolute -top-1.5 -right-1.5 min-w-4 h-4 px-1 rounded-full project-solid text-[9px] leading-4 font-bold text-center ring-2 ring-frame">
          {members.length}
        </span>
        {waiting && <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-modified ring-2 ring-frame" title="Waiting for your approval" />}
        {busy && !waiting && <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-claude ring-2 ring-frame" title="Claude is working here" />}
        {changed && !busy && !waiting && <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-accent ring-2 ring-frame" />}
      </button>
      {!dragging && !menusOpen && (
        <RailTooltip
          title={`${emoji ? `${emoji} ` : ''}${group.name} · ${members.length} projects`}
          detail={`${names.join(', ')} · click to expand · right-click for more`}
          shortcut={index < 9 ? `${modKey}${index + 1}` : null}
        />
      )}
      </>
      )}
    </div>
  );
}

function ProjectColorSwatches(props: { path: string }) {
  const { path } = props;
  const color = useProjectColor(path);

  return <ColorSwatches value={color.id} onPick={(id) => setProjectColor(path, id)} className="px-2.5" />;
}

function GroupMenu(props: { group: ProjectGroup | null; at: { x: number; y: number }; onClose: () => void; onEdit: (group: ProjectGroup) => void }) {
  const { group, at, onClose, onEdit } = props;

  if (!group) {
    return null;
  }
  const run = (action: () => void) => () => {
    onClose();
    action();
  };
  return (
    <ContextMenu position={at} onClose={onClose} width={220}>
      <MenuLabel>{[groupEmoji(group), group.name].filter(Boolean).join(' ')}</MenuLabel>
      <MenuItem
        icon={group.collapsed ? <UnfoldIcon size="sm" /> : <FoldIcon size="sm" />}
        label={group.collapsed ? 'Expand' : 'Collapse'}
        onSelect={run(() => setGroups(toggleCollapsed(getGroups(), group.id)))}
      />
      <MenuItem icon={<PencilIcon size="sm" />} label="Edit group…" onSelect={run(() => onEdit(group))} />
      <MenuSeparator />
      <ColorSwatches value={groupColor(group).id} onPick={(id) => setGroups(styleGroup(getGroups(), group.id, { color: id }))} className="px-2.5" />
      <MenuSeparator />
      <MenuItem
        icon={<XIcon size="sm" />}
        label="Ungroup"
        onSelect={run(() => changeGroups(ungroup(getGroups(), group.id), `Ungrouped ${group.name}`, 'The projects stay on the rail. Claude no longer reads them together.'))}
      />
    </ContextMenu>
  );
}

function ProjectMenuItems(props: {
  path: string;
  current: boolean;
  editor: string;
  index: number;
  count: number;
  onClose: () => void;
  onOpen: (newWindow: boolean) => void;
  onMove: (delta: number) => void;
  onRemove: () => void;
  group: ProjectGroup | null;
  groups: ProjectGroup[];
  canGroup: boolean;
  onEditGroup: (group: ProjectGroup) => void;
  onPickGroup: () => void;
  onEditProject: () => void;
}) {
  const { path, current, editor, index, count, onClose, onOpen, onMove, onRemove, group, groups, canGroup, onEditGroup, onPickGroup, onEditProject } = props;
  const run = (action: () => void) => () => {
    onClose();
    action();
  };

  return (
    <>
      <MenuLabel>{repoName(path)}</MenuLabel>
      <MenuItem icon={<FolderOpenIcon size="sm" />} label="Open" disabled={current} onSelect={run(() => onOpen(false))} />
      <MenuItem icon={<ExternalLinkIcon size="sm" />} label="Open in new window" hint={`${clickModKey}-click`} onSelect={run(() => onOpen(true))} />
      <MenuSeparator />
      <MenuItem icon={<RevealIcon size="sm" />} label={`Reveal in ${fileManagerName}`} onSelect={run(() => { revealItemInDir(path).catch(() => undefined); })} />
      <MenuItem
        icon={<EditorIcon size="sm" />}
        label={`Open in ${editor}`}
        onSelect={run(() => { tauri.openInEditor(path, '').catch((error) => toast.error('Could not open the editor', { description: tauri.errorMessage(error) })); })}
      />
      <MenuItem icon={<TerminalIcon size="sm" />} label="Open in Terminal" onSelect={run(() => { openPath(path, 'Terminal').catch(() => undefined); })} />
      <MenuItem icon={<CopyIcon size="sm" />} label="Copy path" onSelect={run(() => { void navigator.clipboard.writeText(path); toast.success('Path copied'); })} />
      <MenuSeparator />
      <MenuItem icon={<ArrowUpIcon size="sm" />} label="Move up" disabled={index <= 0} onSelect={run(() => onMove(-1))} />
      <MenuItem icon={<ArrowDownIcon size="sm" />} label="Move down" disabled={index < 0 || index >= count - 1} onSelect={run(() => onMove(1))} />
      <MenuSeparator />
      <MenuItem icon={<PencilIcon size="sm" />} label="Edit project…" onSelect={run(onEditProject)} />
      <ProjectColorSwatches path={path} />
      <MenuSeparator />
      <GroupMenuItems path={path} group={group} groups={groups} canGroup={canGroup} run={run} onEditGroup={onEditGroup} onPickGroup={onPickGroup} />
      <button
        role="menuitem"
        onClick={run(onRemove)}
        className="flex items-start gap-2.5 w-full px-2.5 py-1.5 rounded-md text-left hover:bg-deleted/10 cursor-pointer"
      >
        <span className="flex w-4 justify-center pt-0.5 text-deleted"><XIcon size="sm" /></span>
        <span className="min-w-0">
          <span className="block text-[13px] text-deleted">Remove from sidebar</span>
          <span className="block text-[11px] text-text-muted">Keeps the folder and its comments</span>
        </span>
      </button>
    </>
  );
}

function GroupMenuItems(props: {
  path: string;
  group: ProjectGroup | null;
  groups: ProjectGroup[];
  canGroup: boolean;
  run: (action: () => void) => () => void;
  onEditGroup: (group: ProjectGroup) => void;
  onPickGroup: () => void;
}) {
  const { path, group, groups, canGroup, run, onEditGroup, onPickGroup } = props;
  const name = repoName(path);

  if (group) {
    return (
      <>
        <MenuItem icon={<PencilIcon size="sm" />} label={`Edit ${group.name} group…`} onSelect={run(() => onEditGroup(group))} />
        <MenuItem
          icon={<XIcon size="sm" />}
          label={`Remove from ${group.name}`}
          onSelect={run(() => changeGroups(leaveGroup(getGroups(), path), `Removed ${name} from ${group.name}`))}
        />
        <MenuSeparator />
      </>
    );
  }
  if (!canGroup) {
    return null;
  }
  return (
    <>
      {groups.map((other) => (
        <MenuItem
          key={other.id}
          icon={<LinkIcon size="sm" />}
          label={`Add to ${other.name}`}
          onSelect={run(() => changeGroups(joinGroup(getGroups(), path, other.id), `Added ${name} to ${other.name}`, 'Claude working in any of its projects can now read the others.'))}
        />
      ))}
      <MenuItem icon={<PlusIcon size="sm" />} label="Group with…" onSelect={run(onPickGroup)} />
      <MenuSeparator />
    </>
  );
}

/** Rail tiles split into runs: a group's projects together, every other project on its own. */
function railSegments(projects: string[], groups: ProjectGroup[]) {
  const segments: { group: ProjectGroup | null; items: { path: string; index: number }[] }[] = [];
  projects.forEach((path, index) => {
    const group = groupOf(groups, path);
    const last = segments[segments.length - 1];
    if (group && last?.group?.id === group.id) {
      last.items.push({ path, index });
      return;
    }
    segments.push({ group, items: [{ path, index }] });
  });
  return segments;
}

function changedFiles(files: string[]) {
  if (files.length === 1) {
    return files[0].split('/').pop() ?? files[0];
  }
  return `${files.length} files`;
}

const GROUPED_NOTE = 'Claude working in one of them can now work across all of them.';
