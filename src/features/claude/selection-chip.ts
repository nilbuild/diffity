import type { ContextChip } from '../../lib/types';

const MAX_SNIPPET = 4000;

export function chipLabel(chip: ContextChip): string {
  const name = chip.filePath.split('/').pop() ?? chip.filePath;
  if (!chip.startLine) {
    return name;
  }
  const end = chip.endLine && chip.endLine !== chip.startLine ? `–${chip.endLine}` : '';
  return `${name} L${chip.startLine}${end}${chip.side === 'old' ? ' (old)' : ''}`;
}

/** The diff lines the user has selected, as a chip, or null when the selection isn't in a diff. */
export function chipFromSelection(): ContextChip | null {
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed || selection.rangeCount === 0) {
    return null;
  }
  const lineOf = (node: Node | null) => {
    const element = node instanceof Element ? node : node?.parentElement;
    return element?.closest<HTMLElement>('[data-find-line]') ?? null;
  };
  const startEl = lineOf(selection.anchorNode);
  const endEl = lineOf(selection.focusNode);
  const scope = (startEl ?? endEl)?.closest<HTMLElement>('[data-find-scope]');
  const filePath = scope?.dataset.findScope;
  if (!filePath || !startEl || !endEl) {
    return null;
  }
  const parse = (key: string | undefined) => {
    const match = key?.match(/^(?:(\w+)-)?(\d+)$/);
    if (!match) {
      return null;
    }
    return { side: match[1] === 'delete' ? ('old' as const) : ('new' as const), line: Number(match[2]) };
  };
  const a = parse(startEl.dataset.findLine);
  const b = parse(endEl.dataset.findLine);
  if (!a || !b) {
    return null;
  }
  const snippet = selection.toString().slice(0, MAX_SNIPPET);
  if (a.side !== b.side) {
    return { filePath, snippet };
  }
  return { filePath, side: a.side, startLine: Math.min(a.line, b.line), endLine: Math.max(a.line, b.line), snippet };
}
