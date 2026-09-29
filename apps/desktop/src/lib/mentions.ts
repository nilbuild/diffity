// Mirror of `diffity_core::mentions::mentions_agent`: `@claude` (case-insensitive, whole word) outside code.

function stripCode(body: string): string {
  const out: string[] = [];
  let fence: { ch: string; len: number } | null = null;
  for (const line of body.split('\n')) {
    const marker = /^ {0,3}(`{3,}|~{3,})/.exec(line);
    if (fence) {
      const closes = marker && marker[1][0] === fence.ch && marker[1].length >= fence.len && line.trim() === marker[1];
      if (closes) {
        fence = null;
      }
      out.push('');
      continue;
    }
    if (marker) {
      fence = { ch: marker[1][0], len: marker[1].length };
      out.push('');
      continue;
    }
    out.push(line.replace(/(`+)[\s\S]*?\1(?!`)/g, ' '));
  }
  return out.join('\n');
}

const MENTION = /(^|[^\p{L}\p{N}_\-@./])@claude(?![\p{L}\p{N}_\-@/]|\.[\p{L}\p{N}_-])/iu;

export function mentionsAgent(body: string): boolean {
  return MENTION.test(stripCode(body));
}

const MENTION_GLOBAL = /(^|[^\p{L}\p{N}_\-@./])(@claude)(?![\p{L}\p{N}_\-@/]|\.[\p{L}\p{N}_-])/giu;

export type MentionPart = { text: string; mention: boolean };

/** Splits plain text (no code) into mention and non-mention parts. */
export function splitMentions(text: string): MentionPart[] {
  const parts: MentionPart[] = [];
  let last = 0;
  for (const match of text.matchAll(MENTION_GLOBAL)) {
    const start = (match.index ?? 0) + match[1].length;
    if (start > last) {
      parts.push({ text: text.slice(last, start), mention: false });
    }
    parts.push({ text: match[2], mention: true });
    last = start + match[2].length;
  }
  if (last < text.length) {
    parts.push({ text: text.slice(last), mention: false });
  }
  return parts;
}

interface HastNode {
  type: string;
  tagName?: string;
  value?: string;
  properties?: Record<string, unknown>;
  children?: HastNode[];
}

const MENTION_CLASS = ['mention', 'px-0.5', 'rounded', 'bg-accent/10', 'text-accent', 'font-medium'];

function highlightChildren(node: HastNode) {
  if (!node.children || node.tagName === 'code' || node.tagName === 'pre' || node.tagName === 'a') {
    return;
  }
  const next: HastNode[] = [];
  for (const child of node.children) {
    if (child.type !== 'text' || !child.value) {
      highlightChildren(child);
      next.push(child);
      continue;
    }
    for (const part of splitMentions(child.value)) {
      if (!part.mention) {
        next.push({ type: 'text', value: part.text });
        continue;
      }
      next.push({
        type: 'element',
        tagName: 'span',
        properties: { className: MENTION_CLASS },
        children: [{ type: 'text', value: part.text }],
      });
    }
  }
  node.children = next;
}

/** rehype plugin: wraps `@claude` mentions outside code in a highlighted span. */
export function rehypeMentions() {
  return (tree: HastNode) => {
    highlightChildren(tree);
  };
}
