import { isMac } from './platform';

export interface Shortcut {
  /** Set when another surface (the ⌘K palette) prints this key beside its own row. */
  id?: string;
  label: string;
  /** Each entry is one cap: alternatives, or the caps of one gesture. */
  keys: string[];
  /** "J or K" between alternatives; nothing between the caps of one gesture. */
  join?: 'or' | 'none';
}

export interface ShortcutSection {
  title: string;
  shortcuts: Shortcut[];
}

/** ⌘-chords in macOS modifier order (⌃⌥⇧⌘), or Ctrl+… elsewhere. */
export function chord(key: string, modifiers: { shift?: boolean; alt?: boolean } = {}): string {
  if (isMac) {
    return `${modifiers.alt ? '⌥' : ''}${modifiers.shift ? '⇧' : ''}⌘${key}`;
  }
  return ['Ctrl', modifiers.alt && 'Alt', modifiers.shift && 'Shift', key].filter(Boolean).join('+');
}

/**
 * Every key the app answers. The shortcuts sheet (`?`), Settings → Keyboard shortcuts and the ⌘K palette's hints
 * all read this list, so a key added to a handler is added here too.
 */
export const SHORTCUT_SECTIONS: ShortcutSection[] = [
  {
    title: 'General',
    shortcuts: [
      { id: 'palette', label: 'Command palette', keys: [chord('K')] },
      { id: 'go-to-file', label: 'Go to file', keys: [chord('P')] },
      { id: 'palette-actions', label: 'Actions only', keys: [chord('P', { shift: true })] },
      { id: 'shortcuts', label: 'Keyboard shortcuts', keys: ['?'] },
      { id: 'settings', label: 'Settings', keys: [chord(',')] },
      { id: 'toggle-sidebar', label: 'Show or hide the sidebar', keys: [chord('\\')] },
      { id: 'refresh', label: 'Refresh, keeping your place and unsent comments', keys: [chord('R')] },
      { label: 'Close, or cancel', keys: ['Esc'] },
    ],
  },
  {
    title: 'Projects',
    shortcuts: [
      { id: 'open', label: 'Open a project, a path or a GitHub URL', keys: [chord('O')] },
      { id: 'browse', label: 'Browse for a folder', keys: [chord('O', { shift: true })] },
      { id: 'go-home', label: 'Home: history and what to review', keys: [chord('H', { shift: true })] },
      { label: 'Switch to project 1 to 9', keys: [chord('1–9')] },
      { label: 'Previous or next project', keys: [chord('[', { shift: true }), chord(']', { shift: true })] },
      { label: 'Open a project in a new window', keys: [`${isMac ? '⌘' : 'Ctrl+'}Click`] },
    ],
  },
  {
    title: 'Changes',
    shortcuts: [
      { id: 'file-next', label: 'Next file', keys: ['J'] },
      { id: 'file-prev', label: 'Previous file', keys: ['K'] },
      { label: 'Next or previous changed hunk', keys: ['N', 'P'] },
      { id: 'view-unified', label: 'Unified view', keys: ['U'] },
      { id: 'view-split', label: 'Split view', keys: ['S'] },
      { label: 'Collapse or expand the file', keys: ['X'] },
      { id: 'view-collapse', label: 'Collapse or expand all files', keys: ['⇧X'] },
      { label: 'Mark the file as viewed', keys: ['R'] },
      { label: 'Filter files', keys: ['/'] },
      { id: 'copy-path', label: 'Copy the focused file’s path', keys: [chord('C', { alt: true })] },
      { id: 'copy-contents', label: 'Copy the focused file’s contents', keys: [chord('C', { alt: true, shift: true })] },
    ],
  },
  {
    title: 'Files',
    shortcuts: [
      { label: 'Filter files', keys: ['/'] },
      { label: 'Open the file in your editor', keys: [chord('E', { shift: true })] },
    ],
  },
  {
    title: 'Comments',
    shortcuts: [
      { id: 'comments', label: 'All comments in every view', keys: ['C'] },
      { label: 'Comment on a line, drag for a range', keys: ['Click'] },
      { label: 'Submit the comment', keys: [chord('↵')] },
      { label: 'Cancel the comment', keys: ['Esc'] },
      { label: 'Ask Claude Code in a comment', keys: ['@claude'] },
    ],
  },
  {
    title: 'In the palette',
    shortcuts: [
      { label: 'Move between rows', keys: ['↑', '↓'], join: 'none' },
      { label: 'Run the row', keys: ['↵'] },
      { label: 'Open a file in your editor', keys: [chord('↵')] },
    ],
  },
];

function fold(text: string): string {
  return text.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

/** Rows whose section title or label carry every word typed; empty sections are dropped. */
export function matchShortcuts(sections: ShortcutSection[], query: string): ShortcutSection[] {
  const words = query.split(/\s+/).map(fold).filter(Boolean);
  if (!words.length) {
    return sections;
  }
  return sections
    .map((section) => ({
      ...section,
      shortcuts: section.shortcuts.filter((shortcut) => {
        const text = fold(`${section.title} ${shortcut.label} ${shortcut.keys.join(' ')}`);
        return words.every((word) => text.includes(word));
      }),
    }))
    .filter((section) => section.shortcuts.length);
}

const BY_ID = new Map(
  SHORTCUT_SECTIONS.flatMap((section) => section.shortcuts)
    .filter((shortcut) => shortcut.id)
    .map((shortcut) => [shortcut.id, shortcut]),
);

/** The first key of a shortcut, as the palette prints it beside a row. */
export function shortcutHint(id: string): string | undefined {
  return BY_ID.get(id)?.keys[0];
}
