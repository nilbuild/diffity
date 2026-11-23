import { create } from 'zustand';
import { AGENT_HANDLES, stripCode } from '../../lib/mentions';
import type { LinkedProject } from '../../lib/types';
import { getGroups, groupOf, projectName, type ProjectGroup } from './groups';

/** A project that can be @mentioned: one on the rail, or a folder picked from the @ menu. */
export interface KnownProject {
  name: string;
  path: string;
}

const FOLDERS_KEY = 'diffity-mention-folders';
const MAX_FOLDERS = 20;

function readFolders(): string[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(FOLDERS_KEY) ?? '[]');
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [];
  } catch {
    return [];
  }
}

interface DirectoryState {
  /** Rail projects in rail order. */
  rail: string[];
  /** Folders picked with "Choose a folder…", newest first. */
  folders: string[];
}

export const useProjectDirectory = create<DirectoryState>(() => ({ rail: [], folders: readFolders() }));

export function setRailProjects(rail: string[]) {
  const current = useProjectDirectory.getState().rail;
  if (current.length === rail.length && current.every((path, index) => path === rail[index])) {
    return;
  }
  useProjectDirectory.setState({ rail });
}

export function rememberFolder(path: string) {
  const folders = [path, ...useProjectDirectory.getState().folders.filter((item) => item !== path)].slice(0, MAX_FOLDERS);
  useProjectDirectory.setState({ folders });
  try {
    localStorage.setItem(FOLDERS_KEY, JSON.stringify(folders));
  } catch {
    return;
  }
}

export function knownProjects(state: DirectoryState = useProjectDirectory.getState()): KnownProject[] {
  const paths = [...state.rail, ...state.folders.filter((path) => !state.rail.includes(path))];
  return paths.map((path) => ({ name: projectName(path), path }));
}

const NAME_CHAR = '[\\p{L}\\p{N}_.\\-]';
const PROJECT_MENTION = new RegExp(`(^|[^\\p{L}\\p{N}_\\-@./])@([\\p{L}\\p{N}_]${NAME_CHAR}*)`, 'gu');
const HANDLES = new Set<string>(AGENT_HANDLES);

/** The known project a mention names: `@roadmap.sh.` is roadmap.sh, so trailing dots and dashes are tried off. */
function matchProject(token: string, projects: KnownProject[]): KnownProject | null {
  let candidate = token;
  while (candidate) {
    const lower = candidate.toLowerCase();
    if (HANDLES.has(lower)) {
      return null;
    }
    const found = projects.find((project) => project.name.toLowerCase() === lower);
    if (found) {
      return found;
    }
    if (!/[.\-]$/.test(candidate)) {
      return null;
    }
    candidate = candidate.slice(0, -1);
  }
  return null;
}

export interface ProjectMentionPart {
  text: string;
  project: KnownProject | null;
}

/** Splits plain text (no code) into project mentions and the rest. */
export function splitProjectMentions(text: string, projects: KnownProject[]): ProjectMentionPart[] {
  const parts: ProjectMentionPart[] = [];
  let last = 0;
  for (const match of text.matchAll(PROJECT_MENTION)) {
    const project = matchProject(match[2], projects);
    if (!project) {
      continue;
    }
    const start = (match.index ?? 0) + match[1].length;
    const length = project.name.length + 1;
    if (start > last) {
      parts.push({ text: text.slice(last, start), project: null });
    }
    parts.push({ text: text.slice(start, start + length), project });
    last = start + length;
  }
  if (last < text.length) {
    parts.push({ text: text.slice(last), project: null });
  }
  return parts;
}

/** Projects mentioned in `body` outside code, each once, in order. */
export function mentionedProjects(body: string, projects: KnownProject[]): KnownProject[] {
  const found: KnownProject[] = [];
  for (const part of splitProjectMentions(stripCode(body), projects)) {
    if (part.project && !found.some((project) => project.path === part.project?.path)) {
      found.push(part.project);
    }
  }
  return found;
}

/** What an agent working in `repoPath` may read: the other projects of its group, then the projects mentioned in `texts`. */
export function linkedProjects(repoPath: string, texts: string[], projects: KnownProject[] = knownProjects(), groups: ProjectGroup[] = getGroups()): LinkedProject[] {
  const result: LinkedProject[] = [];
  const add = (path: string, reason: LinkedProject['reason']) => {
    if (path === repoPath || result.some((project) => project.path === path)) {
      return;
    }
    result.push({ path, name: projectName(path), reason });
  };
  for (const path of groupOf(groups, repoPath)?.paths ?? []) {
    add(path, 'group');
  }
  for (const text of texts) {
    for (const project of mentionedProjects(text, projects)) {
      add(project.path, 'mentioned');
    }
  }
  return result;
}

interface HastNode {
  type: string;
  tagName?: string;
  value?: string;
  properties?: Record<string, unknown>;
  children?: HastNode[];
}

const PROJECT_MENTION_CLASS = ['project-mention', 'px-0.5', 'rounded', 'bg-fill', 'text-text', 'font-medium'];

function highlightProjects(node: HastNode, projects: KnownProject[]) {
  if (!node.children || node.tagName === 'code' || node.tagName === 'pre' || node.tagName === 'a') {
    return;
  }
  const next: HastNode[] = [];
  for (const child of node.children) {
    if (child.type !== 'text' || !child.value) {
      highlightProjects(child, projects);
      next.push(child);
      continue;
    }
    for (const part of splitProjectMentions(child.value, projects)) {
      if (!part.project) {
        next.push({ type: 'text', value: part.text });
        continue;
      }
      next.push({
        type: 'element',
        tagName: 'span',
        properties: { className: PROJECT_MENTION_CLASS, title: part.project.path },
        children: [{ type: 'text', value: part.text }],
      });
    }
  }
  node.children = next;
}

/** rehype plugin: marks mentions of known projects outside code. */
export function rehypeProjectMentions(projects: KnownProject[]) {
  return () => (tree: HastNode) => {
    if (projects.length === 0) {
      return;
    }
    highlightProjects(tree, projects);
  };
}
