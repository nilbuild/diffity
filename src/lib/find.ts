import type { DiffFile, DiffLine } from '@/lib/diff-parser';
import { getFilePath } from './diff-utils';

/** One searchable line: `scope` is the file (`data-find-scope`), `key` the rendered line (`data-find-line`). */
export interface FindLine {
  scope: string;
  key: string;
  text: string;
}

export interface FindMatch {
  /** Index into the searched lines. */
  line: number;
  scope: string;
  key: string;
  start: number;
  end: number;
}

export interface FindResult {
  matches: FindMatch[];
  truncated: boolean;
  /** Why a regular expression can't be used ("Unterminated group"). */
  error?: string;
}

export interface FindOptions {
  caseSensitive: boolean;
  wholeWord?: boolean;
  regex?: boolean;
}

export const FIND_MATCH_LIMIT = 5000;

/** The key a diff row renders as `data-find-line`: deleted rows by old number, the rest by new (like the syntax map). */
export function diffLineKey(line: DiffLine): string {
  return `${line.type}-${line.type === 'delete' ? line.oldLineNumber : line.newLineNumber}`;
}

/** Every hunk line of every file, in the order the diff shows them. */
export function diffFindLines(files: DiffFile[]): FindLine[] {
  const lines: FindLine[] = [];
  for (const file of files) {
    const scope = getFilePath(file);
    for (const hunk of file.hunks) {
      for (const line of hunk.lines) {
        lines.push({ scope, key: diffLineKey(line), text: line.content });
      }
    }
  }
  return lines;
}

export function fileFindLines(scope: string, content: string[]): FindLine[] {
  return content.map((text, index) => ({ scope, key: String(index + 1), text }));
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const lowered = new WeakMap<FindLine, string>();

function lowerText(line: FindLine): string {
  let lower = lowered.get(line);
  if (lower === undefined) {
    lower = line.text.toLowerCase();
    lowered.set(line, lower);
  }
  return lower;
}

function patternError(error: unknown): string {
  const message = String((error as Error)?.message ?? error).replace(/^Invalid regular expression: \/.*\/[a-z]*: /, '');
  return message.charAt(0).toUpperCase() + message.slice(1);
}

/** Regex or whole-word search: the query as a pattern (escaped unless `regex`), skipping empty matches. */
function searchPattern(lines: FindLine[], query: string, options: FindOptions, limit: number): FindResult {
  const matches: FindMatch[] = [];
  const source = options.regex ? query : escapeRegExp(query);
  let pattern: RegExp;
  try {
    pattern = new RegExp(options.wholeWord ? `(?<!\\w)(?:${source})(?!\\w)` : source, options.caseSensitive ? 'g' : 'gi');
  } catch (error) {
    return { matches, truncated: false, error: patternError(error) };
  }
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    pattern.lastIndex = 0;
    for (const found of line.text.matchAll(pattern)) {
      if (found[0].length === 0) {
        continue;
      }
      matches.push({ line: index, scope: line.scope, key: line.key, start: found.index, end: found.index + found[0].length });
      if (matches.length >= limit) {
        return { matches, truncated: true };
      }
    }
  }
  return { matches, truncated: false };
}

/** Searches `lines` for the query (plain text unless `regex`), case-insensitive unless asked, stopping at `limit` matches. */
export function searchLines(lines: FindLine[], query: string, options: FindOptions, limit = FIND_MATCH_LIMIT): FindResult {
  const matches: FindMatch[] = [];
  if (!query) {
    return { matches, truncated: false };
  }
  if (options.regex || options.wholeWord) {
    return searchPattern(lines, query, options, limit);
  }
  const { caseSensitive } = options;
  const needle = caseSensitive ? query : query.toLowerCase();
  const pattern = caseSensitive ? null : new RegExp(escapeRegExp(query), 'gi');

  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    const push = (start: number, end: number) => {
      matches.push({ line: index, scope: line.scope, key: line.key, start, end });
      return matches.length >= limit;
    };

    if (caseSensitive) {
      let from = line.text.indexOf(needle);
      while (from >= 0) {
        if (push(from, from + needle.length)) {
          return { matches, truncated: true };
        }
        from = line.text.indexOf(needle, from + needle.length);
      }
      continue;
    }

    const lower = lowerText(line);
    if (lower.length !== line.text.length && pattern) {
      pattern.lastIndex = 0;
      for (const found of line.text.matchAll(pattern)) {
        if (push(found.index, found.index + found[0].length)) {
          return { matches, truncated: true };
        }
      }
      continue;
    }
    let from = lower.indexOf(needle);
    while (from >= 0) {
      if (push(from, from + needle.length)) {
        return { matches, truncated: true };
      }
      from = lower.indexOf(needle, from + needle.length);
    }
  }
  return { matches, truncated: false };
}

/** Index of the first match in `scope` or after it (by line order); 0 when the scope is unknown or has none after. */
export function firstMatchFrom(lines: FindLine[], matches: FindMatch[], scope: string | null): number {
  if (!scope || matches.length === 0) {
    return 0;
  }
  const lineIndex = lines.findIndex((line) => line.scope === scope);
  if (lineIndex < 0) {
    return 0;
  }
  const index = matches.findIndex((match) => match.line >= lineIndex);
  return index < 0 ? 0 : index;
}

/** Where the same match (scope, key, offset) sits in a fresh result, so a refreshed diff keeps your place. */
export function carryCurrent(previous: FindMatch | null, matches: FindMatch[]): number {
  if (!previous) {
    return -1;
  }
  return matches.findIndex((match) => match.scope === previous.scope && match.key === previous.key && match.start === previous.start);
}

/** Text offsets of the rendered text of `element` (buttons such as "Show all" excluded), for building ranges. */
export function textSegments(element: Element): { node: Text; start: number }[] {
  const segments: { node: Text; start: number }[] = [];
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, {
    acceptNode: (node) => (node.parentElement?.closest('button') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
  });
  let offset = 0;
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const text = node as Text;
    segments.push({ node: text, start: offset });
    offset += text.data.length;
  }
  return segments;
}

export function rangeFor(segments: { node: Text; start: number }[], start: number, end: number): Range | null {
  const locate = (offset: number, preferNext: boolean) => {
    for (let i = 0; i < segments.length; i++) {
      const segment = segments[i];
      const length = segment.node.data.length;
      const inside = preferNext ? offset < segment.start + length : offset <= segment.start + length;
      if (offset >= segment.start && inside) {
        return { node: segment.node, offset: offset - segment.start };
      }
    }
    return null;
  };
  const from = locate(start, true);
  const to = locate(end, false);
  if (!from || !to) {
    return null;
  }
  const range = document.createRange();
  range.setStart(from.node, from.offset);
  range.setEnd(to.node, to.offset);
  return range;
}
