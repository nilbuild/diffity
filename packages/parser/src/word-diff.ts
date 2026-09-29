import type { WordDiffSegment } from './types.js';

function tokenize(text: string): string[] {
  const tokens: string[] = [];
  let current = '';

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const isWordChar = /\w/.test(char);

    if (current.length === 0) {
      current = char;
      continue;
    }

    const prevIsWordChar = /\w/.test(current[current.length - 1]);

    if (isWordChar === prevIsWordChar) {
      current += char;
    } else {
      tokens.push(current);
      current = char;
    }
  }

  if (current.length > 0) {
    tokens.push(current);
  }

  return tokens;
}

function lcs(a: string[], b: string[]): string[][] {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () =>
    new Array(n + 1).fill(0)
  );

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  const result: string[][] = [];
  let i = m;
  let j = n;

  while (i > 0 && j > 0) {
    if (a[i - 1] === b[j - 1]) {
      result.unshift([a[i - 1], 'equal']);
      i--;
      j--;
    } else if (dp[i - 1][j] > dp[i][j - 1]) {
      i--;
    } else {
      j--;
    }
  }

  return result;
}

export function computeWordDiff(
  oldLine: string,
  newLine: string
): WordDiffSegment[] {
  if (oldLine === newLine) {
    return [{ text: oldLine, type: 'equal' }];
  }

  if (oldLine.length === 0) {
    return [{ text: newLine, type: 'insert' }];
  }

  if (newLine.length === 0) {
    return [{ text: oldLine, type: 'delete' }];
  }

  const oldTokens = tokenize(oldLine);
  const newTokens = tokenize(newLine);
  const common = lcs(oldTokens, newTokens);

  const segments: WordDiffSegment[] = [];
  let oi = 0;
  let ni = 0;
  let ci = 0;

  while (ci < common.length) {
    const commonToken = common[ci][0];

    let deleteText = '';
    while (oi < oldTokens.length && oldTokens[oi] !== commonToken) {
      deleteText += oldTokens[oi];
      oi++;
    }

    let insertText = '';
    while (ni < newTokens.length && newTokens[ni] !== commonToken) {
      insertText += newTokens[ni];
      ni++;
    }

    if (deleteText) {
      segments.push({ text: deleteText, type: 'delete' });
    }
    if (insertText) {
      segments.push({ text: insertText, type: 'insert' });
    }

    let equalText = '';
    while (
      oi < oldTokens.length &&
      ni < newTokens.length &&
      ci < common.length &&
      oldTokens[oi] === common[ci][0] &&
      newTokens[ni] === common[ci][0]
    ) {
      equalText += oldTokens[oi];
      oi++;
      ni++;
      ci++;
    }

    if (equalText) {
      segments.push({ text: equalText, type: 'equal' });
    }
  }

  let trailingDelete = '';
  while (oi < oldTokens.length) {
    trailingDelete += oldTokens[oi];
    oi++;
  }

  let trailingInsert = '';
  while (ni < newTokens.length) {
    trailingInsert += newTokens[ni];
    ni++;
  }

  if (trailingDelete) {
    segments.push({ text: trailingDelete, type: 'delete' });
  }
  if (trailingInsert) {
    segments.push({ text: trailingInsert, type: 'insert' });
  }

  return segments;
}
