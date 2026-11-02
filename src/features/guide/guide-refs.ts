import { createContext, useContext } from 'react';
import type { Side } from '../../lib/types';

/** A spot in the diff the guide points at: a file, or one line of it. */
export interface GuideRef {
  path: string;
  line?: number;
  side: Side;
}

export interface GuideRefs {
  open: (ref: GuideRef) => void;
  /** The file is in the diff, so a link to it can go somewhere. */
  has: (path: string) => boolean;
}

/** Set while the guide is on screen; without it references render as plain code. */
export const GuideRefContext = createContext<GuideRefs | null>(null);

export function useGuideRefs(): GuideRefs | null {
  return useContext(GuideRefContext);
}

const REF = /\[\[([^[\]#\n]+?)(?:#L(\d+)(?:-L?\d+)?)?\]\]/g;
const CODE = /(```[\s\S]*?```|`[^`\n]*`)/;
const HREF_PREFIX = '#diffity-ref:';

/** `src/a.ts` or `src/a.ts#L12` (a range keeps its first line). */
export function parseRef(text: string): GuideRef | null {
  const match = /^([^[\]#\n]+?)(?:#L(\d+)(?:-L?\d+)?)?$/.exec(text.trim());
  if (!match) {
    return null;
  }
  return { path: match[1].trim().replace(/^\.\//, ''), line: match[2] ? Number(match[2]) : undefined, side: 'new' };
}

export function refLabel(ref: GuideRef): string {
  const name = ref.path.split('/').pop() ?? ref.path;
  return ref.line ? `${name}:${ref.line}` : name;
}

export function refHref(ref: GuideRef): string {
  return `${HREF_PREFIX}${encodeURIComponent(ref.path)}${ref.line ? `:${ref.line}` : ''}`;
}

export function refFromHref(href: string | undefined): GuideRef | null {
  if (!href?.startsWith(HREF_PREFIX)) {
    return null;
  }
  const match = /^([^:]+)(?::(\d+))?$/.exec(href.slice(HREF_PREFIX.length));
  if (!match) {
    return null;
  }
  return { path: decodeURIComponent(match[1]), line: match[2] ? Number(match[2]) : undefined, side: 'new' };
}

/** Turns `[[path#L12]]` into a Markdown link the guide renders as a jump into the diff; code spans stay literal. */
export function linkRefs(markdown: string): string {
  if (!markdown.includes('[[')) {
    return markdown;
  }
  return markdown
    .split(CODE)
    .map((part, index) => {
      if (index % 2 === 1) {
        return part;
      }
      return part.replace(REF, (whole, path: string, line: string | undefined) => {
        const ref = parseRef(line ? `${path}#L${line}` : path);
        return ref ? `[${refLabel(ref)}](${refHref(ref)})` : whole;
      });
    })
    .join('');
}

/** The key of an arrow from one node to another, as `diagramRefs` and the diagram use it. */
export function edgeKey(from: string, to: string): string {
  return `${from}->${to}`;
}

/** The diagram's `%% ref node:<id> [[path#L12]]` and `%% ref edge:<a>-><b> [[…]]` lines, by node id or `edgeKey`. */
export function diagramRefs(chart: string): Map<string, GuideRef> {
  const refs = new Map<string, GuideRef>();
  for (const match of chart.matchAll(/^\s*%%\s*ref\s+(?:node:|edge:)(\S+)\s+\[\[([^\]]+)\]\]/gm)) {
    const ref = parseRef(match[2]);
    if (ref && !refs.has(match[1])) {
      refs.set(match[1], ref);
    }
  }
  return refs;
}
