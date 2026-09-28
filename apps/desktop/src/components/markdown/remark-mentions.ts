interface MdNode {
  type: string;
  value?: string;
  children?: MdNode[];
  data?: { hName?: string; hProperties?: Record<string, unknown> };
}

const MENTION = /(^|[^\p{L}\p{N}_\-@./])(@claude)(?![\p{L}\p{N}_\-@/]|\.[\p{L}\p{N}_-])/giu;

export const MENTION_CLASS = 'mention rounded-sm bg-accent-soft px-1 font-medium text-accent';

function split(value: string): MdNode[] | null {
  const parts: MdNode[] = [];
  let last = 0;
  MENTION.lastIndex = 0;
  let match = MENTION.exec(value);
  while (match) {
    const start = match.index + match[1].length;
    if (start > last) {
      parts.push({ type: 'text', value: value.slice(last, start) });
    }
    parts.push({
      type: 'mention',
      children: [{ type: 'text', value: match[2] }],
      data: { hName: 'span', hProperties: { className: MENTION_CLASS } },
    });
    last = start + match[2].length;
    match = MENTION.exec(value);
  }
  if (parts.length === 0) {
    return null;
  }
  if (last < value.length) {
    parts.push({ type: 'text', value: value.slice(last) });
  }
  return parts;
}

function walk(node: MdNode) {
  if (!node.children || node.type === 'link') {
    return;
  }
  const next: MdNode[] = [];
  for (const child of node.children) {
    if (child.type === 'text' && child.value) {
      next.push(...(split(child.value) ?? [child]));
      continue;
    }
    walk(child);
    next.push(child);
  }
  node.children = next;
}

/** Renders `@claude` mentions (outside code and links) as accent pills. */
export function remarkMentions() {
  return (tree: MdNode) => walk(tree);
}
