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

export interface Feature {
  id: string;
  title: string;
  lead: string;
  isNew?: boolean;
  /** Shown in the sidebar when set. */
  nav?: { label: string; icon: IconName };
  rows?: FeatureRow[];
  terminal?: TerminalBlock;
  shot?: { src: string; alt: string };
}

export const FEATURES: Feature[] = [
  {
    id: 'comment',
    title: 'Comment on your diff',
    lead: 'Drag across line numbers, or click the + next to a line, and write what you think. You can comment on one line, many lines, a file or the whole change.',
    nav: { label: 'Comment and fix', icon: 'comment' },
    shot: { src: '/screenshots/comment.gif', alt: 'Selecting lines in a diff and leaving a comment' },
  },
  {
    id: 'fix',
    title: 'Let your agent fix your comments',
    lead: 'Click Send. Claude Code or Codex goes through your comments one by one, changes the code and replies in each thread. Then you review its changes like any other diff.',
    shot: { src: '/screenshots/claude-fix.gif', alt: 'Sending two comments to Claude and its edits and replies landing on the diff' },
  },
  {
    id: 'ask',
    title: 'Ask @claude or @codex',
    lead: 'Not sure about something? Mention an agent in any comment and it answers right there in the thread.',
    nav: { label: 'Ask an agent', icon: 'send' },
    rows: [
      { term: '@claude', text: 'asks Claude Code' },
      { term: '@codex', text: 'asks Codex' },
      { term: 'Reply to an agent', text: 'your reply goes back to the same agent' },
    ],
    shot: { src: '/screenshots/claude-reply.gif', alt: 'Mentioning @claude in a comment and Claude replying in the thread' },
  },
  {
    id: 'review',
    title: 'Get a review from your agent',
    lead: 'Ask for a review and, if you like, say what to look at. The agent reads the diff and leaves comments on the lines that matter, while you watch.',
    nav: { label: 'Agent review', icon: 'approve' },
    shot: { src: '/screenshots/claude-review.gif', alt: 'Asking Claude to review and its comments appearing on the diff' },
  },
  {
    id: 'agents',
    title: 'Pick your agent and model',
    lead: 'Use Claude Code, Codex or both. The model menu lists the models of every agent you have installed, grouped by agent, so picking a model also picks the agent. You can also pick how much effort it puts in.',
    isNew: true,
    nav: { label: 'Agents and models', icon: 'sparkle' },
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
    id: 'refs',
    title: 'Review any commit or range',
    lead: 'Pick what you want to see from the menu next to the project name.',
    nav: { label: 'Commits and ranges', icon: 'gitCompare' },
    rows: [
      { term: 'Uncommitted changes', text: 'what you are working on right now' },
      { term: 'A commit', text: 'search and open any commit' },
      { term: 'A range', text: 'everything between two commits' },
      { term: 'A branch', text: 'all the work since it left main, uncommitted edits included' },
    ],
    shot: { src: '/screenshots/refs.gif', alt: 'Searching commits in the ref picker and opening one' },
  },
  {
    id: 'prs',
    title: 'Review pull requests',
    lead: 'Pick a pull request from the branch menu. Diffity checks it out locally, so you can read it, run it and comment as you go. Comments stay with each branch.',
    nav: { label: 'Pull requests', icon: 'gitPullRequest' },
    shot: { src: '/screenshots/pull-request.gif', alt: 'Checking out a pull request from the branch switcher and opening the review panel' },
  },
  {
    id: 'post',
    title: 'Post your review to GitHub',
    lead: 'When you are done, click Submit review. Comments from GitHub show up in the diff too, so you can reply or resolve them from the app.',
    rows: [
      { term: 'Comment', text: 'share notes without a verdict' },
      { term: 'Approve', text: 'good to merge' },
      { term: 'Request changes', text: 'needs more work first' },
    ],
    shot: { src: '/screenshots/post-review.gif', alt: 'Drafting a review comment on a pull request next to synced GitHub threads and approving it' },
  },
  {
    id: 'files',
    title: 'Comment on any file',
    lead: 'Open the Files tab, pick any file in the repo and comment on its lines. Even code the diff does not touch. Big files stay fast.',
    nav: { label: 'Any file', icon: 'fileText' },
    shot: { src: '/screenshots/files.gif', alt: 'Opening a file from the Files tab and commenting on two of its lines' },
  },
  {
    id: 'keys',
    title: 'Jump anywhere',
    lead: 'Keep your hands on the keyboard.',
    nav: { label: 'Shortcuts', icon: 'keyboard' },
    rows: [
      { kbd: '⌘P', term: 'Open a file', text: 'any file in the repo' },
      { kbd: '⌘K', term: 'Search everything', text: 'commits, comments, pull requests and every action' },
      { kbd: '⌘F', term: 'Find in the diff', text: 'searches every file, even collapsed ones' },
      { kbd: '⌘G', term: 'Next match', text: 'jump to the next result' },
    ],
    shot: { src: '/screenshots/palette.gif', alt: 'Opening a file with Command P and switching to dark theme with Command K' },
  },
  {
    id: 'projects',
    title: 'Switch projects',
    lead: 'Open a repo once and it stays in the left rail.',
    nav: { label: 'Projects', icon: 'folder' },
    rows: [
      { kbd: '⌘O', term: 'Open a repo', text: 'add it to the rail' },
      { kbd: '⌘1–9', term: 'Go back to it', text: 'one key per project' },
    ],
    shot: { src: '/screenshots/projects.gif', alt: 'Switching between projects in the rail' },
  },
  {
    id: 'terminal',
    title: 'Open it from the terminal, or from your agent',
    lead: 'Install the command once from Settings → Terminal. Then run it anywhere. Your agent can run it too, so you can ask Claude Code or Codex to open its changes in Diffity before it opens a PR.',
    nav: { label: 'Terminal', icon: 'terminal' },
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
    title: 'And the small things',
    lead: 'Details that make long reviews easier.',
    nav: { label: 'And more', icon: 'plus' },
    rows: [
      { term: 'Changed since you viewed it', text: 'a viewed file opens up again when it changes' },
      { term: 'Hide generated files', text: 'add a `.diffityignore` and they stay out of your diffs' },
      { term: 'Mermaid diagrams', text: 'drawn right in the diff, in light and dark' },
      { term: 'Colour-blind friendly', text: 'switch the diff to blue and orange' },
      { term: 'Split or unified', text: 'change the layout any time' },
      { term: 'Light or dark', text: 'follows your system, or pick one' },
      { term: 'Clean up', text: 'delete comments and chats per project from Settings → Data' },
      { term: 'Updates itself', text: 'new versions install in place' },
    ],
  },
];

export function featureNumber(feature: Feature) {
  return String(FEATURES.indexOf(feature) + 1).padStart(2, '0');
}
