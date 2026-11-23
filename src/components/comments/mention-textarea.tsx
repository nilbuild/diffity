import { forwardRef, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { cn } from '../../lib/cn';
import { splitMentions } from '../../lib/mentions';
import { getRepoPathOrNull } from '../../lib/api';
import { FolderOpenIcon, SparkleIcon } from '../ui/icon';
import { AGENTS, useInstalledAgents, type AgentMeta } from '../../features/claude/agents';
import { knownProjects, rememberFolder, splitProjectMentions, useProjectDirectory, type KnownProject } from '../../features/groups/project-directory';
import { groupOf, projectName, useGroups } from '../../features/groups/groups';
import { parentPathOf, useAllTasks } from '../../features/tasks/tasks';
import { shortPath } from '../../features/welcome/recent-repos';
import { RepoBadge } from '../../features/welcome/repo-badge';
import { pickFolder } from '../../features/welcome/open-repo';

interface MentionTextareaProps {
  value: string;
  onChange: (value: string) => void;
  onKeyDown?: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  placeholder?: string;
  rows?: number;
  className?: string;
  autoFocus?: boolean;
  id?: string;
  spellCheck?: boolean;
}

interface MentionQuery {
  start: number;
  end: number;
  typed: string;
}

type Suggestion =
  | { kind: 'agent'; key: string; agent: AgentMeta }
  | { kind: 'project'; key: string; project: KnownProject; inGroup: boolean }
  | { kind: 'folder'; key: string };

const MAX_PROJECTS = 8;

const BACKDROP_RESET = 'absolute inset-0 m-0 overflow-hidden whitespace-pre-wrap break-words pointer-events-none select-none text-transparent resize-none placeholder:text-transparent';

function MentionBackdrop(props: { value: string; projects: KnownProject[]; className?: string; backdropRef: React.RefObject<HTMLDivElement | null> }) {
  const { value, projects, className, backdropRef } = props;

  return (
    <div ref={backdropRef} aria-hidden className={cn(className, BACKDROP_RESET)}>
      {splitMentions(value).map((part, index) => {
        if (part.mention) {
          return (
            <mark key={index} className="rounded bg-claude/15 text-transparent ring-1 ring-claude/30">
              {part.text}
            </mark>
          );
        }
        return splitProjectMentions(part.text, projects).map((piece, pieceIndex) => {
          if (!piece.project) {
            return <span key={`${index}-${pieceIndex}`}>{piece.text}</span>;
          }
          return (
            <mark key={`${index}-${pieceIndex}`} className="rounded bg-fill text-transparent ring-1 ring-control-border">
              {piece.text}
            </mark>
          );
        });
      })}
      {'\n'}
    </div>
  );
}

function findMentionQuery(value: string, caret: number): MentionQuery | null {
  const before = value.slice(0, caret);
  const match = /(^|[\s(])@([\w.-]*)$/.exec(before);
  if (!match) {
    return null;
  }
  const typed = match[2].toLowerCase();
  return { start: caret - typed.length - 1, end: caret, typed };
}

function suggestionsFor(
  query: MentionQuery | null,
  agents: AgentMeta[],
  projects: KnownProject[],
  repoPath: string | null,
  groupPaths: string[],
): Suggestion[] {
  if (!query) {
    return [];
  }
  const { typed } = query;
  const agentItems: Suggestion[] = agents
    .filter((agent) => agent.handle.startsWith(typed) && agent.handle !== typed)
    .map((agent) => ({ kind: 'agent', key: `agent:${agent.id}`, agent }));
  const matching = projects.filter((project) => {
    const name = project.name.toLowerCase();
    return project.path !== repoPath && name !== typed && name.includes(typed);
  });
  const outside = matching.filter((project) => !groupPaths.includes(project.path));
  const inside = matching.filter((project) => groupPaths.includes(project.path));
  const projectItems: Suggestion[] = [...outside, ...inside]
    .slice(0, MAX_PROJECTS)
    .map((project) => ({ kind: 'project', key: `project:${project.path}`, project, inGroup: groupPaths.includes(project.path) }));
  const folder: Suggestion[] = 'choose a folder'.includes(typed) || typed === '' || projectItems.length === 0 ? [{ kind: 'folder', key: 'folder' }] : [];
  return [...agentItems, ...projectItems, ...folder];
}

export const MentionTextarea = forwardRef<HTMLTextAreaElement, MentionTextareaProps>(function MentionTextarea(props, ref) {
  const { value, onChange, onKeyDown, placeholder, rows, className, autoFocus, id, spellCheck } = props;
  const innerRef = useRef<HTMLTextAreaElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState<MentionQuery | null>(null);
  const [active, setActive] = useState(0);
  const installed = useInstalledAgents();
  const rail = useProjectDirectory((state) => state.rail);
  const folders = useProjectDirectory((state) => state.folders);
  const projects = useMemo(() => knownProjects({ rail, folders }), [rail, folders]);
  const tasks = useAllTasks();
  const repoPathOrTask = getRepoPathOrNull();
  const repoPath = repoPathOrTask ? parentPathOf(tasks, repoPathOrTask) : null;
  const groups = useGroups((state) => state.groups);
  const groupPaths = repoPath ? groupOf(groups, repoPath)?.paths ?? [] : [];
  const suggestions = suggestionsFor(query, installed.length > 0 ? installed : AGENTS, projects, repoPath, groupPaths);
  const selected = suggestions[Math.min(active, suggestions.length - 1)] ?? null;
  const firstProject = suggestions.findIndex((item) => item.kind !== 'agent');

  useImperativeHandle(ref, () => innerRef.current as HTMLTextAreaElement);

  const refreshQuery = (next: string, caret: number) => {
    setQuery(findMentionQuery(next, caret));
    setActive(0);
  };

  const insert = (at: MentionQuery, handle: string) => {
    const text = `@${handle} `;
    const current = innerRef.current?.value ?? value;
    onChange(current.slice(0, at.start) + text + current.slice(at.end));
    const caret = at.start + text.length;
    requestAnimationFrame(() => {
      const el = innerRef.current;
      if (!el) {
        return;
      }
      el.focus();
      el.setSelectionRange(caret, caret);
    });
  };

  const accept = async (item: Suggestion | null) => {
    if (!query || !item) {
      return;
    }
    const at = query;
    setQuery(null);
    if (item.kind === 'agent') {
      insert(at, item.agent.handle);
      return;
    }
    if (item.kind === 'project') {
      insert(at, item.project.name);
      return;
    }
    const path = await pickFolder('Mention a folder');
    if (!path) {
      innerRef.current?.focus();
      return;
    }
    rememberFolder(path);
    insert(at, projectName(path));
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (selected && (e.key === 'Enter' || e.key === 'Tab') && !e.metaKey && !e.ctrlKey) {
      e.preventDefault();
      void accept(selected);
      return;
    }
    if (suggestions.length > 1 && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      e.preventDefault();
      const step = e.key === 'ArrowDown' ? 1 : -1;
      setActive((current) => (current + step + suggestions.length) % suggestions.length);
      return;
    }
    if (selected && e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      setQuery(null);
      return;
    }
    onKeyDown?.(e);
  };

  const syncScroll = () => {
    const el = innerRef.current;
    const backdrop = backdropRef.current;
    if (!el || !backdrop) {
      return;
    }
    backdrop.scrollTop = el.scrollTop;
  };

  return (
    <div className="relative">
      <MentionBackdrop value={value} projects={projects} className={className} backdropRef={backdropRef} />
      <textarea
        ref={innerRef}
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          refreshQuery(e.target.value, e.target.selectionStart);
        }}
        onKeyDown={handleKeyDown}
        onClick={(e) => refreshQuery(value, e.currentTarget.selectionStart)}
        onBlur={() => setQuery(null)}
        onScroll={syncScroll}
        placeholder={placeholder}
        rows={rows}
        autoFocus={autoFocus}
        id={id}
        spellCheck={spellCheck}
        className={cn(className, 'relative bg-transparent')}
      />
      {suggestions.length > 0 && (
        <div role="listbox" aria-label="Mention" className="absolute left-2 top-full -mt-1 z-30 w-72 py-1 bg-overlay rounded-lg ring-1 ring-overlay-border">
          {suggestions.map((item, index) => (
            <SuggestionRow
              key={item.key}
              item={item}
              selected={item === selected}
              heading={index === firstProject && item.kind === 'project' ? 'Projects Claude can read' : null}
              separated={item.kind === 'folder' && index > 0}
              onPick={() => void accept(item)}
              onHover={() => setActive(index)}
            />
          ))}
        </div>
      )}
    </div>
  );
});

function SuggestionRow(props: { item: Suggestion; selected: boolean; heading: string | null; separated: boolean; onPick: () => void; onHover: () => void }) {
  const { item, selected, heading, separated, onPick, onHover } = props;
  const rowClass = cn('flex items-center gap-2.5 w-full px-3 py-1.5 text-xs text-text cursor-pointer text-left', selected && 'bg-hover');

  return (
    <>
      {heading && <div className="px-3 pt-1.5 pb-0.5 text-[11px] text-text-muted">{heading}</div>}
      {separated && <div className="my-1 border-t border-overlay-border" />}
      <button
        type="button"
        role="option"
        aria-selected={selected}
        onMouseDown={(e) => {
          e.preventDefault();
          onPick();
        }}
        onMouseEnter={onHover}
        className={rowClass}
      >
        <SuggestionContent item={item} />
      </button>
    </>
  );
}

function SuggestionContent(props: { item: Suggestion }) {
  const { item } = props;

  if (item.kind === 'agent') {
    return (
      <>
        <SparkleIcon className="w-3.5 h-3.5 text-claude" />
        <span className="font-semibold">@{item.agent.handle}</span>
        <span className="text-text-muted truncate">Ask {item.agent.name}</span>
      </>
    );
  }
  if (item.kind === 'project') {
    return (
      <>
        <RepoBadge name={item.project.name} path={item.project.path} className="w-4 h-4 rounded text-[8px]" />
        <span className="font-medium truncate">{item.project.name}</span>
        <span className="flex-1 min-w-0 text-right text-text-muted truncate">{item.inGroup ? 'already in group' : shortPath(item.project.path)}</span>
      </>
    );
  }
  return (
    <>
      <FolderOpenIcon size="sm" className="text-text-secondary" />
      <span className="text-text-secondary">Choose a folder…</span>
    </>
  );
}
