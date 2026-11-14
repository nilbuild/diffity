import type { IconName } from '@/lib/icons';

export interface FeatureRow {
  term: string;
  /** Text after the dot. Wrap code in backticks to show it as a key cap. */
  text: string;
  kbd?: string;
}

export interface TerminalBlock {
  title: string;
  meta: string;
  lines: { command: string; text: string }[];
}

export type GroupId = 'reviewing' | 'with-agents' | 'with-github' | 'getting-around';

export interface Group {
  id: GroupId;
  name: string;
  title: string;
  icon: IconName;
}

export interface Feature {
  id: string;
  group: GroupId;
  title: string;
  lead: string;
  isNew?: boolean;
  navLabel: string;
  rows?: FeatureRow[];
  terminal?: TerminalBlock;
  shot?: { src: string; alt: string };
  /** A stick scene from public/scenes, shown instead of a screenshot. */
  scene?: { id: string; label: string };
}

export const GROUPS: Group[] = [
  { id: 'reviewing', name: 'Review', title: 'Read the diff and comment on any line', icon: 'comment' },
  { id: 'with-agents', name: 'Agents', title: 'Let Claude Code or Codex do the fixing', icon: 'sparkle' },
  { id: 'with-github', name: 'GitHub', title: 'Pull requests in, reviews out', icon: 'gitHub' },
  { id: 'getting-around', name: 'Get around', title: 'Keyboard, projects and the terminal', icon: 'keyboard' },
];

export const FEATURES: Feature[] = [
  {
    id: 'comment',
    group: 'reviewing',
    scene: { id: 'diffity-comment', label: 'You drag across line numbers to select three lines, write a comment, and it pins to those lines.' },
    title: 'Comment on your diff',
    lead: 'Drag across line numbers, or click the + next to a line, and write what you think. You can comment on one line, many lines, a file or the whole change.',
    navLabel: 'Comments',
    rows: [
      { term: 'Suggest a change', text: 'write the fix in a comment and apply it in one click, with undo' },
      { term: 'Undo', text: 'bring back a comment you deleted or resolved' },
      { kbd: ']', term: 'Next comment', text: 'jump to the next open one, `[` goes back' },
    ],
    shot: { src: '/screenshots/comment.gif', alt: 'Selecting lines in a diff and leaving a comment' },
  },
  {
    id: 'refs',
    group: 'reviewing',
    scene: { id: 'diffity-refs', label: 'You slide a bracket along a line of commits to pick a commit, a range or your uncommitted changes, and the diff swaps to show it.' },
    title: 'Review any commit or range',
    lead: 'Pick what you want to see from the menu next to the project name.',
    navLabel: 'Commits and ranges',
    rows: [
      { term: 'Uncommitted changes', text: 'what you are working on right now' },
      { term: 'A commit', text: 'search and open any commit' },
      { term: 'A range', text: 'everything between two commits' },
      { term: 'A branch', text: 'all the work since it left main, uncommitted edits included' },
    ],
    shot: { src: '/screenshots/refs.gif', alt: 'Searching commits in the ref picker and opening one' },
  },
  {
    id: 'files',
    group: 'reviewing',
    scene: { id: 'diffity-files', label: 'You pull a file from a filing cabinet, it opens in Diffity, and you pin a comment on one of its lines.' },
    title: 'Comment on any file',
    lead: 'Open the Files tab, pick any file in the repo and comment on its lines. Even code the diff does not touch. Big files stay fast.',
    navLabel: 'Any file',
    shot: { src: '/screenshots/files.gif', alt: 'Opening a file from the Files tab and commenting on two of its lines' },
  },
  {
    id: 'fix',
    group: 'with-agents',
    navLabel: 'Fix comments',
    scene: { id: 'diffity-fix', label: 'You press Send, two comments fly to the agent, and it fixes each line and replies under each comment.' },
    title: 'Let your agent fix your comments',
    lead: 'Click Send. Claude Code or Codex goes through your comments one by one, changes the code and replies in each thread. Then you review its changes like any other diff.',
    rows: [
      { term: 'Stays open', text: 'a comment the agent fixed waits for you to resolve it' },
      { term: 'Queue', text: 'line up runs and retry the ones that fail' },
      { term: 'History', text: 'see past agent runs from `⌘K`' },
    ],
    shot: { src: '/screenshots/claude-fix.gif', alt: 'Sending two comments to Claude and its edits and replies landing on the diff' },
  },
  {
    id: 'ask',
    group: 'with-agents',
    scene: { id: 'diffity-ask', label: 'You mention @claude or @codex in a comment and that agent answers right under it in the thread.' },
    title: 'Ask @claude or @codex',
    lead: 'Not sure about something? Mention an agent in any comment and it answers right there in the thread.',
    navLabel: 'Ask an agent',
    rows: [
      { term: '@claude', text: 'asks Claude Code' },
      { term: '@codex', text: 'asks Codex' },
      { term: 'Reply to an agent', text: 'your reply goes back to the same agent' },
    ],
    shot: { src: '/screenshots/claude-reply.gif', alt: 'Mentioning @claude in a comment and Claude replying in the thread' },
  },
  {
    id: 'review',
    group: 'with-agents',
    scene: { id: 'diffity-agent-review', label: 'You ask the agent for a review and sip coffee while it scans the diff and pins notes on the lines that matter.' },
    title: 'Get a review from your agent',
    lead: 'Ask for a review and, if you like, say what to look at. The agent reads the diff and leaves comments on the lines that matter, while you watch.',
    navLabel: 'Agent review',
    rows: [
      { term: 'Your focuses', text: 'add your own, like a team checklist or a skill to use' },
      { term: 'Suggestions', text: 'its comments can include changes you apply in one click' },
      { term: 'To GitHub', text: 'add an agent comment to your GitHub review and edit it first' },
    ],
    shot: { src: '/screenshots/claude-review.gif', alt: 'Asking Claude to review and its comments appearing on the diff' },
  },
  {
    id: 'guides',
    group: 'with-agents',
    scene: { id: 'diffity-guide', label: 'The agent taps each box of a diagram in turn, each step lights up its code in the diff, a risky step gets a warning, and you follow along.' },
    title: 'Read a guide to the change',
    lead: 'Open the Guide tab and your agent writes a walkthrough of the change, in an order that makes sense, with the risky parts first.',
    isNew: true,
    navLabel: 'Guides',
    rows: [
      { term: 'Diagram', text: 'plays step by step, click a box to jump to its code' },
      { term: 'Call stack', text: 'step through how the change runs, each step lit up in the diff' },
      { term: 'Risky spots', text: 'called out up front' },
      { term: 'Outside the diff', text: 'code elsewhere that the change may break' },
    ],
  },
  {
    id: 'agents',
    group: 'with-agents',
    scene: { id: 'diffity-agents', label: 'You turn a dial to pick Claude or Codex, the chosen agent gets a new model and more effort, and it powers up.' },
    title: 'Pick your agent and model',
    lead: 'Use Claude Code, Codex or both. The model menu lists the models of every agent you have installed, grouped by agent, so picking a model also picks the agent. You can also pick how much effort it puts in.',
    isNew: true,
    navLabel: 'Agents and models',
    rows: [
      { term: 'Per task', text: 'pick a model for reviews, fixes and replies' },
      { term: 'Per project', text: 'Diffity remembers your last pick' },
      { term: 'Per thread', text: 'change it for one reply only' },
      { term: 'Defaults', text: 'set them in Settings → Agents' },
      { term: 'Always current', text: 'new models show up without a Diffity update' },
    ],
    terminal: {
      title: 'Install an agent',
      meta: 'Then sign in',
      lines: [
        { command: 'npm i -g @anthropic-ai/claude-code', text: 'Claude Code, then run claude to log in' },
        { command: 'npm i -g @openai/codex', text: 'Codex, then run codex login' },
      ],
    },
  },
  {
    id: 'tasks',
    group: 'with-agents',
    scene: { id: 'diffity-tasks', label: 'You start a new task and a third agent begins on its own branch beside two others; one finishes, you review it over two rounds, and it merges into main.' },
    title: 'Run agents side by side',
    lead: 'Start a task and an agent works on it in its own worktree, so several can run at once without touching your branch. Review each round like any diff, send comments back, then open a pull request or merge it.',
    isNew: true,
    navLabel: 'Tasks',
    rows: [
      { kbd: '⌘N', term: 'New task', text: 'say what you want and pick an agent' },
      { term: 'Rounds', text: 'review what changed since the last round' },
      { term: 'Finish', text: 'open a pull request or merge it' },
      { term: 'Before you quit', text: 'Diffity warns you while agents are still running' },
    ],
  },
  {
    id: 'handoff',
    group: 'with-agents',
    navLabel: 'Hand off',
    title: 'Hand comments to your terminal agent',
    lead: 'The agent that wrote the change has the context to fix it. Connect Claude Code or Codex from Settings → Terminal, then ask it to address your review. It reads your comments, makes the changes, replies in each thread and resolves the fixed ones.',
    rows: [
      { term: 'Any MCP agent', text: 'OpenCode, Cursor and others, with the setup from the same place' },
      { term: 'Live', text: 'threads update in Diffity as it works, labelled with its name' },
      { term: 'Drafts', text: 'stay private until you submit them' },
    ],
    terminal: {
      title: 'In your agent',
      meta: 'Claude Code or Codex',
      lines: [
        { command: 'address my Diffity review', text: 'reads, fixes, replies and resolves' },
        { command: "open it in Diffity when you're done", text: 'opens its changes for you to review' },
      ],
    },
  },
  {
    id: 'prs',
    group: 'with-github',
    scene: { id: 'diffity-prs', label: 'You pull a pull request out of a mailbox into Diffity, which checks out the branch, shows its diff and runs it, and you leave a comment.' },
    title: 'Review pull requests',
    lead: 'Pick a pull request from the branch menu. Diffity checks it out locally, so you can read it, run it and comment as you go. Comments stay with each branch.',
    navLabel: 'Pull requests',
    rows: [
      { term: 'Out of date', text: 'update your copy of the pull request in one click' },
      { term: 'Not cloned yet', text: 'Diffity offers to clone it and shows the progress' },
      { term: 'Worktrees', text: 'a pull request checked out in a worktree opens there' },
    ],
    shot: { src: '/screenshots/pull-request.gif', alt: 'Checking out a pull request from the branch switcher and opening the review panel' },
  },
  {
    id: 'post',
    group: 'with-github',
    navLabel: 'Post a review',
    scene: { id: 'diffity-post', label: 'You stamp a verdict on the review, it flies to GitHub, a GitHub comment flies back onto the diff and you resolve it.' },
    title: 'Post your review to GitHub',
    lead: 'When you are done, click Submit review. Comments from GitHub show up in the diff too, so you can reply or resolve them from the app.',
    rows: [
      { term: 'Comment', text: 'share notes without a verdict' },
      { term: 'Approve', text: 'good to merge' },
      { term: 'Request changes', text: 'needs more work first' },
      { term: 'Suggestions', text: 'yours show up as suggested changes on GitHub, and GitHub ones apply here' },
    ],
    shot: { src: '/screenshots/post-review.gif', alt: 'Drafting a review comment on a pull request next to synced GitHub threads and approving it' },
  },
  {
    id: 'home',
    group: 'getting-around',
    scene: { id: 'diffity-home', label: 'A new pull request jumps to the top of Home; you open it, comment on a line, and it drops off the list.' },
    title: 'Start from Home',
    lead: 'Home lists what needs your attention first, like pull requests waiting on your review across all your repos.',
    navLabel: 'Home',
  },
  {
    id: 'projects',
    group: 'getting-around',
    scene: { id: 'diffity-projects', label: 'You press one key and Diffity jumps to another repo from its left rail.' },
    title: 'Switch projects',
    lead: 'Open a repo once and it stays in the left rail.',
    navLabel: 'Projects',
    rows: [
      { kbd: '⌘O', term: 'Open a repo', text: 'add it to the rail' },
      { kbd: '⌘1–9', term: 'Go back to it', text: 'one key per project' },
      { term: 'Worktrees', text: 'listed in `⌘O` next to your repos, one click to open' },
    ],
    shot: { src: '/screenshots/projects.gif', alt: 'Switching between projects in the rail' },
  },
  {
    id: 'keys',
    group: 'getting-around',
    scene: { id: 'diffity-keys', label: 'You press a shortcut key, a search box drops over Diffity, and it jumps to the result you pick.' },
    title: 'Jump anywhere',
    lead: 'Keep your hands on the keyboard.',
    navLabel: 'Shortcuts',
    rows: [
      { kbd: '⌘P', term: 'Open a file', text: 'any file in the repo' },
      { kbd: '⌘K', term: 'Search everything', text: 'commits, comments, pull requests and every action' },
      { kbd: '⌘F', term: 'Find in the diff', text: 'searches every file, even collapsed ones' },
      { kbd: '⌘G', term: 'Next match', text: 'jump to the next result' },
      { kbd: '⇧⌘F', term: 'Search code', text: 'across every file in the repo' },
      { kbd: 'A', term: 'Ask the agent', text: 'about the comment you are on, `⇧R` to reply, `E` to resolve' },
    ],
    shot: { src: '/screenshots/palette.gif', alt: 'Opening a file with Command P and switching to dark theme with Command K' },
  },
  {
    id: 'terminal',
    group: 'getting-around',
    scene: { id: 'diffity-terminal', label: 'You or your agent type diffity in the terminal and it flips into Diffity, ready to review.' },
    title: 'Open it from the terminal, or from your agent',
    lead: 'Install the command once from Settings → Terminal. Then run it anywhere. Your agent can run it too, so you can ask Claude Code or Codex to open its changes in Diffity before it opens a PR.',
    navLabel: 'Terminal',
    terminal: {
      title: 'Terminal',
      meta: 'zsh',
      lines: [
        { command: 'diffity', text: 'your uncommitted changes' },
        { command: 'diffity ~/code/app', text: 'another repo' },
        { command: 'diffity --ref main', text: 'everything on this branch since main' },
        { command: 'diffity --ref HEAD~1..HEAD', text: 'the last commit' },
        { command: 'diffity github.com/owner/repo/pull/42', text: 'check out and review a PR' },
        { command: 'diffity src/app.ts', text: 'one file, in the Files tab' },
        { command: 'diffity -n', text: 'in a new window' },
      ],
    },
  },
  {
    id: 'more',
    group: 'getting-around',
    title: 'And the small things',
    lead: 'Details that make long reviews easier.',
    navLabel: 'And more',
    rows: [
      { term: 'Changed since you viewed it', text: 'a viewed file opens up again when it changes' },
      { term: 'Hide generated files', text: 'add a `.diffityignore` and they stay out of your diffs' },
      { term: 'Mermaid diagrams', text: 'drawn right in the diff, in light and dark' },
      { term: 'Colour-blind friendly', text: 'switch the diff to blue and orange' },
      { term: 'Split or unified', text: 'change the layout any time' },
      { term: 'Light or dark', text: 'follows your system, or pick one' },
      { term: 'Fonts', text: 'pick the interface and code fonts, size and tab width' },
      { term: 'Line wrapping', text: 'turn it off to scroll long lines sideways' },
      { term: 'Clean up', text: 'delete comments and chats per project from Settings → Data' },
      { term: 'Updates itself', text: 'new versions install in place' },
    ],
  },
];

export function featuresIn(group: Group) {
  return FEATURES.filter((feature) => feature.group === group.id);
}
