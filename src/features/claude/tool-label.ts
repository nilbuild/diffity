import type { ActivityItem } from './run-activity';
import { describeShell } from './shell-label';

type ToolItem = Extract<ActivityItem, { kind: 'tool' }>;

export type ToolCategory = 'command' | 'read' | 'edit' | 'search' | 'fetch' | 'comment' | 'other';

export interface ToolLabel {
  /** What the agent did, in words: "Ran", "Read", "Listed comments". */
  verb: string;
  /** What it did it on: a command, a path or a pattern. */
  subject: string | null;
  /** Shell commands and patterns read best in monospace; paths are split into name and folder instead. */
  subjectKind: 'code' | 'path' | 'text';
  /** The MCP server the tool came from, when it isn't Diffity's own. */
  source: string | null;
  /** The full shell command, for commands summarized in words. */
  command?: string;
  /** Commands chained after the summarized one. */
  more?: number;
  category: ToolCategory;
}

const DIFFITY_TOOLS: Record<string, { verb: string; category: ToolCategory }> = {
  get_diff: { verb: 'Read the diff', category: 'read' },
  list_threads: { verb: 'Checked comments', category: 'comment' },
  add_comment: { verb: 'Added a comment', category: 'comment' },
  add_general_comment: { verb: 'Added a general comment', category: 'comment' },
  reply: { verb: 'Replied to a comment', category: 'comment' },
  resolve: { verb: 'Resolved a comment', category: 'comment' },
  dismiss: { verb: 'Dismissed a comment', category: 'comment' },
  set_guide: { verb: 'Wrote the guide', category: 'edit' },
};

const NAMED_TOOLS: Record<string, string> = {
  ToolSearch: 'Loaded tools',
  TodoWrite: 'Updated the plan',
  Task: 'Started a subagent',
  Agent: 'Started a subagent',
  WebSearch: 'Searched the web',
  WebFetch: 'Fetched a page',
  codemode: 'Ran a tool script',
  tool_search: 'Loaded tools',
};

const PLACEHOLDERS: Record<string, string> = {
  Terminal: 'Running a command',
  'Read File': 'Reading a file',
  'Preparing file…': 'Preparing an edit',
  Edit: 'Editing a file',
  Write: 'Writing a file',
};

const PATH_VERBS = ['Read', 'Write', 'Edit', 'Delete', 'Move', 'View', 'Create', 'List'];

function humanize(name: string) {
  const words = name.replace(/[_-]+/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2').trim().toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function stripRoot(text: string, repoPath: string) {
  const root = repoPath.endsWith('/') ? repoPath : `${repoPath}/`;
  const bare = root.slice(0, -1);
  return text
    .replace(new RegExp(`^cd ${escape(bare)}/? *(&&|;) *`), '')
    .split(root).join('');
}

function escape(text: string) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function categoryOf(toolKind: string): ToolCategory {
  switch (toolKind) {
    case 'execute':
      return 'command';
    case 'read':
      return 'read';
    case 'edit':
    case 'delete':
    case 'move':
      return 'edit';
    case 'search':
      return 'search';
    case 'fetch':
      return 'fetch';
    default:
      return 'other';
  }
}

export function describeTool(tool: Pick<ToolItem, 'title' | 'toolKind'>, repoPath: string): ToolLabel {
  const title = stripRoot(tool.title.trim(), repoPath);
  const category = categoryOf(tool.toolKind);

  const placeholder = PLACEHOLDERS[title];
  if (placeholder) {
    return { verb: placeholder, subject: null, subjectKind: 'text', source: null, category };
  }

  const mcp = title.match(/^mcp__(.+?)__(.+)$/);
  if (mcp) {
    const [, server, name] = mcp;
    const known = server === 'diffity' ? DIFFITY_TOOLS[name] : undefined;
    if (known) {
      return { verb: known.verb, subject: null, subjectKind: 'text', source: null, category: known.category };
    }
    return { verb: humanize(name), subject: null, subjectKind: 'text', source: humanize(server), category: 'other' };
  }

  const named = NAMED_TOOLS[title];
  if (named) {
    return { verb: named, subject: null, subjectKind: 'text', source: null, category };
  }

  if (category === 'command') {
    const shell = describeShell(title);
    return { verb: shell.verb, subject: shell.subject, subjectKind: shell.subjectKind, source: null, category, command: title, more: shell.more };
  }

  const [first, ...rest] = title.split(' ');
  if (PATH_VERBS.includes(first) && rest.length > 0) {
    return { verb: first, subject: rest.join(' '), subjectKind: 'path', source: null, category: category === 'other' ? 'edit' : category };
  }

  if (category === 'search') {
    return { verb: 'Searched', subject: title, subjectKind: 'code', source: null, category };
  }

  return { verb: title, subject: null, subjectKind: 'text', source: null, category };
}

const NOUNS: Record<ToolCategory, [string, string, string]> = {
  command: ['Ran', 'command', 'commands'],
  read: ['read', 'file', 'files'],
  edit: ['edited', 'file', 'files'],
  search: ['ran', 'search', 'searches'],
  fetch: ['fetched', 'page', 'pages'],
  comment: ['used', 'tool', 'tools'],
  other: ['used', 'tool', 'tools'],
};

/** "Read 3 files, ran 2 commands" for a run of tool calls. */
export function summarizeTools(labels: ToolLabel[]): string {
  const counts = new Map<ToolCategory, number>();
  for (const label of labels) {
    const category = label.category === 'comment' ? 'other' : label.category;
    counts.set(category, (counts.get(category) ?? 0) + 1);
  }
  const order: ToolCategory[] = ['read', 'search', 'command', 'edit', 'fetch', 'other'];
  const parts = order
    .filter((category) => counts.has(category))
    .map((category) => {
      const count = counts.get(category)!;
      const [verb, one, many] = NOUNS[category];
      return `${verb.toLowerCase()} ${count} ${count === 1 ? one : many}`;
    });
  const text = parts.join(', ');
  return text.charAt(0).toUpperCase() + text.slice(1);
}
