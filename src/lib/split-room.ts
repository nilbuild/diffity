/** Split falls back to unified below this many code characters per side… */
export const SPLIT_MIN_CHARS = 50;
/** …and comes back from this many, so a width near the line doesn't flip back and forth. */
export const SPLIT_RESUME_CHARS = 55;

/** File card padding (`px-5` on each side) plus its 1px borders. */
const CARD_CHROME = 42;
/** Each side's code cell padding (`px-3`) plus the 1px divider. */
const CELL_CHROME = 25;

export function gutterWidth(codeSize: number): number {
  return Math.max(48, codeSize * 3.8);
}

/** Code characters that fit on each side of a split table in a diff column this wide. */
export function splitCharsPerSide(columnWidth: number, codeSize: number, charWidth: number): number {
  if (charWidth <= 0) {
    return Infinity;
  }
  const side = (columnWidth - CARD_CHROME) / 2 - gutterWidth(codeSize) - CELL_CHROME;
  return Math.max(0, Math.floor(side / charWidth));
}

/** Whether split fits, given whether it fitted before (`null` on the first measure). */
export function splitFits(previous: boolean | null, chars: number): boolean {
  if (previous === null) {
    return chars >= SPLIT_MIN_CHARS;
  }
  if (previous) {
    return chars >= SPLIT_MIN_CHARS;
  }
  return chars >= SPLIT_RESUME_CHARS;
}
