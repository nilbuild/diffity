export type LineDiffEntry = { type: 'context' | 'add' | 'delete'; text: string };

const MAX_CELLS = 4_000_000;

export function diffLines(oldText: string, newText: string): LineDiffEntry[] {
  const a = oldText === '' ? [] : oldText.split('\n');
  const b = newText === '' ? [] : newText.split('\n');
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) {
    start++;
  }
  let endA = a.length;
  let endB = b.length;
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
    endA--;
    endB--;
  }
  const midA = a.slice(start, endA);
  const midB = b.slice(start, endB);
  const head: LineDiffEntry[] = a.slice(0, start).map((text) => ({ type: 'context', text }));
  const tail: LineDiffEntry[] = a.slice(endA).map((text) => ({ type: 'context', text }));

  if (midA.length * midB.length > MAX_CELLS) {
    return [
      ...head,
      ...midA.map((text): LineDiffEntry => ({ type: 'delete', text })),
      ...midB.map((text): LineDiffEntry => ({ type: 'add', text })),
      ...tail,
    ];
  }

  const rows = midA.length + 1;
  const cols = midB.length + 1;
  const table = new Uint32Array(rows * cols);
  for (let i = midA.length - 1; i >= 0; i--) {
    for (let j = midB.length - 1; j >= 0; j--) {
      table[i * cols + j] = midA[i] === midB[j]
        ? table[(i + 1) * cols + j + 1] + 1
        : Math.max(table[(i + 1) * cols + j], table[i * cols + j + 1]);
    }
  }
  const middle: LineDiffEntry[] = [];
  let i = 0;
  let j = 0;
  while (i < midA.length && j < midB.length) {
    if (midA[i] === midB[j]) {
      middle.push({ type: 'context', text: midA[i] });
      i++;
      j++;
      continue;
    }
    if (table[(i + 1) * cols + j] >= table[i * cols + j + 1]) {
      middle.push({ type: 'delete', text: midA[i] });
      i++;
      continue;
    }
    middle.push({ type: 'add', text: midB[j] });
    j++;
  }
  while (i < midA.length) {
    middle.push({ type: 'delete', text: midA[i++] });
  }
  while (j < midB.length) {
    middle.push({ type: 'add', text: midB[j++] });
  }
  return [...head, ...middle, ...tail];
}

/** Keeps changed lines plus `context` lines around them; gaps become `null`. */
export function collapseContext(entries: LineDiffEntry[], context = 3): (LineDiffEntry | null)[] {
  const keep = new Array<boolean>(entries.length).fill(false);
  entries.forEach((entry, index) => {
    if (entry.type === 'context') {
      return;
    }
    for (let k = Math.max(0, index - context); k <= Math.min(entries.length - 1, index + context); k++) {
      keep[k] = true;
    }
  });
  const result: (LineDiffEntry | null)[] = [];
  let skipped = false;
  entries.forEach((entry, index) => {
    if (keep[index]) {
      result.push(entry);
      skipped = false;
      return;
    }
    if (!skipped) {
      result.push(null);
      skipped = true;
    }
  });
  return result;
}
