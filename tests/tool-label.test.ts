import { describe, expect, it } from 'vitest';
import { describeTool, summarizeTools } from '../src/features/claude/tool-label';

const repo = '/Users/me/app';

describe('tool labels', () => {
  it('names Diffity and other MCP tools in words', () => {
    expect(describeTool({ title: 'mcp__diffity__list_threads', toolKind: 'other' }, repo)).toMatchObject({ verb: 'Checked comments', source: null });
    expect(describeTool({ title: 'mcp__linear__get_issue', toolKind: 'other' }, repo)).toMatchObject({ verb: 'Get issue', source: 'Linear' });
    expect(describeTool({ title: 'ToolSearch', toolKind: 'other' }, repo)).toMatchObject({ verb: 'Loaded tools' });
  });

  it('shows commands without the cd into the repo', () => {
    expect(describeTool({ title: `cd ${repo} && git log -5`, toolKind: 'execute' }, repo)).toMatchObject({ verb: 'Checked git history', command: 'git log -5' });
    expect(describeTool({ title: 'Terminal', toolKind: 'execute' }, repo)).toMatchObject({ verb: 'Running a command', subject: null });
  });

  it('splits file tools into verb and repo-relative path', () => {
    expect(describeTool({ title: `Read ${repo}/src/a.ts (1 - 40)`, toolKind: 'read' }, repo)).toMatchObject({ verb: 'Read', subject: 'src/a.ts (1 - 40)', subjectKind: 'path' });
    expect(describeTool({ title: 'Write cart.test.js', toolKind: 'edit' }, repo)).toMatchObject({ verb: 'Write', subject: 'cart.test.js', category: 'edit' });
  });

  it('reads pi tool calls the way pi.rs titles them', () => {
    expect(describeTool({ title: `List ${repo}/src`, toolKind: 'search' }, repo)).toMatchObject({ verb: 'List', subject: 'src', category: 'search' });
    expect(describeTool({ title: `Edit ${repo}/src/a.ts`, toolKind: 'edit' }, repo)).toMatchObject({ verb: 'Edit', subject: 'src/a.ts', category: 'edit' });
    expect(describeTool({ title: 'setCached', toolKind: 'search' }, repo)).toMatchObject({ verb: 'Searched', subject: 'setCached' });
    expect(describeTool({ title: 'codemode', toolKind: 'other' }, repo)).toMatchObject({ verb: 'Ran a tool script' });
    expect(describeTool({ title: 'mcp__diffity__add_comment', toolKind: 'other' }, repo)).toMatchObject({ verb: 'Added a comment' });
  });

  it('summarizes a run of calls', () => {
    const labels = [
      describeTool({ title: 'Read a.ts', toolKind: 'read' }, repo),
      describeTool({ title: 'Read b.ts', toolKind: 'read' }, repo),
      describeTool({ title: 'ls', toolKind: 'execute' }, repo),
      describeTool({ title: 'mcp__diffity__resolve', toolKind: 'other' }, repo),
    ];
    expect(summarizeTools(labels)).toBe('Read 2 files, ran 1 command, used 1 tool');
  });
});
