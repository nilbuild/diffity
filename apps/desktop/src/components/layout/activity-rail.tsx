import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import { cn } from '../../lib/cn';
import { useRepoNav } from '../../hooks/use-repo';
import { openSettings } from '../../lib/ui-store';
import { modKey } from '../../lib/platform';
import { openRepoAt, shortPath, useRecentRepos } from '../../features/welcome/recent-repos';
import { repoInitials } from '../../features/welcome/repo-badge';
import { useActiveRun } from '../../features/claude/claude-runner';
import { lastLocationFor } from '../../lib/repo-locations';
import { PlusIcon, SettingsIcon } from '../ui/icon';
import { useSidebarShortcut } from './title-bar';
import { openQuickOpen } from '../../features/palette/quick-open';

const RailContext = createContext(false);

export function useInsideRail() {
  return useContext(RailContext);
}

const ORDER_KEY = 'diffity-rail-order';
const MAX_PROJECTS = 9;
const SLOT = 46;

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

function RailTooltip(props: { title: string; detail?: string; shortcut?: string | null }) {
  const { title, detail, shortcut } = props;

  return (
    <span
      role="tooltip"
      className="pointer-events-none absolute left-[calc(100%-2px)] top-1/2 -translate-y-1/2 z-50 flex flex-col gap-0.5 max-w-[280px] px-2.5 py-1.5 rounded-md bg-overlay border border-overlay-border text-left whitespace-nowrap opacity-0 invisible transition-opacity duration-100 group-hover:opacity-100 group-hover:visible group-hover:delay-300"
    >
      <span className="flex items-center gap-2 text-[13px] font-medium text-text">
        {title}
        {shortcut && <kbd className="font-sans text-[11px] text-text-muted">{shortcut}</kbd>}
      </span>
      {detail && <span className="text-[11px] text-text-secondary truncate">{detail}</span>}
    </span>
  );
}

const tileBase = 'relative w-9 h-9 rounded-[10px] flex items-center justify-center select-none';

interface ProjectTileProps {
  path: string;
  index: number;
  current: boolean;
  busy: boolean;
  offset: number;
  dragging: boolean;
  animate: boolean;
  onPointerDown: (event: React.PointerEvent<HTMLButtonElement>, index: number) => void;
  onOpen: (newWindow: boolean) => void;
  onRemove: () => void;
}

function ProjectTile(props: ProjectTileProps) {
  const { path, index, current, busy, offset, dragging, animate, onPointerDown, onOpen, onRemove } = props;
  const name = repoName(path);
  const shortcut = index < 9 ? `${modKey}${index + 1}` : null;

  return (
    <div
      className={cn('group relative w-full flex justify-center', dragging && 'z-10', animate && !dragging && 'transition-transform duration-150 ease-out')}
      style={{ transform: offset ? `translateY(${offset}px)` : undefined }}
    >
      <button
        onPointerDown={(event) => onPointerDown(event, index)}
        onClick={(event) => onOpen(event.metaKey || event.ctrlKey)}
        onContextMenu={(event) => {
          event.preventDefault();
          if (current) {
            return;
          }
          onRemove();
        }}
        aria-label={name}
        aria-current={current ? 'page' : undefined}
        className={cn(
          tileBase,
          'text-[12px] font-semibold tracking-wide touch-none',
          current ? 'bg-text text-bg' : 'bg-active text-text-secondary hover:bg-fill-hover hover:text-text hover:ring-1 hover:ring-control-border',
          dragging ? 'cursor-grabbing bg-raised ring-1 ring-control-border opacity-90' : 'cursor-pointer',
        )}
      >
        {repoInitials(name)}
        {busy && <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-claude ring-2 ring-frame" title="Claude is working here" />}
      </button>
      {!dragging && (
        <RailTooltip
          title={name}
          detail={current ? shortPath(path) : `${shortPath(path)} · drag to reorder · right-click to remove`}
          shortcut={shortcut}
        />
      )}
    </div>
  );
}

function useProjectOrder(currentPath: string) {
  const recent = useRecentRepos();
  const [order, setOrder] = useState(readOrder);

  const projects = useMemo(() => {
    const known = new Set(recent.repos.map((repo) => repo.path));
    known.add(currentPath);
    const ordered = order.filter((path) => known.has(path));
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
    return ordered;
  }, [order, recent.repos, currentPath]);

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
    if (projects.length <= MAX_PROJECTS) {
      return projects;
    }
    const head = projects.slice(0, MAX_PROJECTS);
    if (head.includes(currentPath)) {
      return head;
    }
    return [...head.slice(0, MAX_PROJECTS - 1), currentPath];
  }, [projects, currentPath]);

  const move = useCallback((fromPath: string, toIndex: number) => {
    const next = visible.filter((path) => path !== fromPath);
    next.splice(toIndex, 0, fromPath);
    const rest = projects.filter((path) => !next.includes(path));
    const full = [...next, ...rest];
    setOrder(full);
    writeOrder(full);
  }, [visible, projects]);

  const remove = useCallback((path: string) => {
    const next = projects.filter((item) => item !== path);
    setOrder(next);
    writeOrder(next);
    void recent.remove(path);
  }, [projects, recent]);

  return { projects: visible, move, remove };
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
    </RailContext.Provider>
  );
}

function ActivityRail() {
  const nav = useRepoNav();
  const navigate = useNavigate();
  const run = useActiveRun();
  const { projects, move, remove } = useProjectOrder(nav.repoPath);
  const [drag, setDrag] = useState<{ from: number; startY: number; dy: number; active: boolean } | null>(null);
  const suppressClick = useRef(false);
  const [settling, setSettling] = useState(false);

  const openProject = useCallback((path: string, newWindow = false) => {
    if (path === nav.repoPath && !newWindow) {
      nav.toOverview();
      return;
    }
    if (newWindow) {
      void openRepoAt(path, navigate, { newWindow });
      return;
    }
    const last = lastLocationFor(path);
    if (last) {
      navigate(last);
      return;
    }
    void openRepoAt(path, navigate);
  }, [nav, navigate]);


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
        const index = projects.indexOf(nav.repoPath);
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
  }, [projects, nav.repoPath, openProject]);

  const targetIndex = drag?.active ? Math.max(0, Math.min(projects.length - 1, drag.from + Math.round(drag.dy / SLOT))) : null;

  const offsetFor = (index: number) => {
    if (!drag?.active || targetIndex === null) {
      return 0;
    }
    if (index === drag.from) {
      return drag.dy;
    }
    if (drag.from < targetIndex && index > drag.from && index <= targetIndex) {
      return -SLOT;
    }
    if (drag.from > targetIndex && index < drag.from && index >= targetIndex) {
      return SLOT;
    }
    return 0;
  };

  const dragRef = useRef(drag);
  dragRef.current = drag;
  const targetRef = useRef(targetIndex);
  targetRef.current = targetIndex;
  const projectsRef = useRef(projects);
  projectsRef.current = projects;

  const handlePointerDown = (event: React.PointerEvent<HTMLButtonElement>, index: number) => {
    if (event.button !== 0) {
      return;
    }
    suppressClick.current = false;
    setDrag({ from: index, startY: event.clientY, dy: 0, active: false });
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
      const limit = SLOT * (projectsRef.current.length - 1);
      const min = -current.from * SLOT - 8;
      const max = limit - current.from * SLOT + 8;
      setDrag({ ...current, dy: Math.max(min, Math.min(max, dy)), active: true });
    };
    const onUp = () => {
      const current = dragRef.current;
      const target = targetRef.current;
      if (current?.active && target !== null && target !== current.from) {
        setSettling(true);
        move(projectsRef.current[current.from], target);
        requestAnimationFrame(() => requestAnimationFrame(() => setSettling(false)));
      }
      setDrag(null);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
  }, [dragging, move]);

  return (
    <nav
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
      <div className="flex flex-col items-center gap-2.5 w-full pt-1.5">
        {projects.map((path, index) => (
          <ProjectTile
            key={path}
            path={path}
            index={index}
            current={path === nav.repoPath}
            busy={run?.context.repoPath === path}
            offset={offsetFor(index)}
            dragging={drag?.active === true && drag.from === index}
            animate={drag?.active === true && !settling}
            onPointerDown={handlePointerDown}
            onOpen={(newWindow) => openProject(path, newWindow)}
            onRemove={() => {
              remove(path);
              toast.success(`Removed ${repoName(path)} from the sidebar`);
            }}
          />
        ))}
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
      <div data-tauri-drag-region className="flex-1 w-full" />
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
    </nav>
  );
}
