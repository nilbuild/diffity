export const DIFF_THEMES = { dark: 'github-dark', light: 'github-light' } as const;

export const FILE_HEADER_HEIGHT = 36;

/**
 * Maps @pierre/diffs onto the app tokens (styles.css). App CSS variables inherit into the
 * library's encapsulated DOM, and the `unsafe` layer wins over the library's base layer, so the
 * code surface uses the app's GitHub-style diff colours (--diff-*) directly instead of the
 * library's colour mixing.
 * Selection paints only code lines (yellow, like a commented line); annotation rows stay neutral.
 */
export const SURFACE_TOKEN_CSS = `
:host {
  --diffs-light-bg: var(--canvas);
  --diffs-dark-bg: var(--canvas);
  --diffs-light: var(--fg);
  --diffs-dark: var(--fg);
  --diffs-addition-color-override: var(--added);
  --diffs-deletion-color-override: var(--removed);
  --diffs-modified-color-override: var(--accent);
  --diffs-fg-number-override: var(--fg-subtle);
  --diffs-fg-number-addition-override: var(--fg-subtle);
  --diffs-fg-number-deletion-override: var(--fg-subtle);
  --diffs-bg-addition-emphasis-override: var(--diff-add-word);
  --diffs-bg-deletion-emphasis-override: var(--diff-del-word);
  --diffs-bg-separator-override: var(--diff-hunk-bg);
  --diffs-bg-context-override: var(--diff-expanded-bg);
  --diffs-bg-context-gutter-override: var(--diff-expanded-bg);
  --diffs-bg-buffer-override: var(--muted);
  --diffs-bg-hover-override: var(--fg-subtle);
  --diffs-gap-style: 1px solid var(--border-subtle);
}
[data-diff-type=split][data-overflow=scroll] [data-deletions] {
  border-right: 1px solid var(--border-subtle);
}
[data-line-type=change-addition]:is([data-line], [data-no-newline], [data-column-number], [data-gutter-buffer]) {
  --diffs-computed-diff-line-bg: var(--diff-add-bg);
}
[data-line-type=change-deletion]:is([data-line], [data-no-newline], [data-column-number], [data-gutter-buffer]) {
  --diffs-computed-diff-line-bg: var(--diff-del-bg);
}
[data-diff-span] {
  border-radius: 2px;
}
:is([data-line], [data-no-newline])[data-selected-line] {
  --diffs-computed-selected-line-bg: var(--diff-comment-bg);
}
:is([data-column-number], [data-gutter-buffer])[data-selected-line] {
  --diffs-computed-selected-line-bg: var(--diff-comment-gutter);
  color: var(--fg);
}
[data-line-annotation],
[data-gutter-buffer=annotation] {
  --diffs-annotation-bg: var(--canvas);
}
[data-line-annotation][data-selected-line],
[data-gutter-buffer=annotation][data-selected-line] {
  --diffs-computed-selected-line-bg: var(--canvas);
}
[data-separator=line-info],
[data-separator=line-info-basic] {
  height: 28px;
}
[data-separator-wrapper],
[data-separator-content],
[data-expand-button],
[data-additions] [data-gutter] [data-separator] [data-separator-wrapper] {
  background-color: transparent;
}
[data-separator-content] {
  color: var(--diff-hunk-fg);
  font-family: var(--diffs-font-family);
  font-size: 12px;
}
[data-separator-content]:hover {
  color: var(--diff-hunk-fg);
}
[data-expand-button] {
  color: color-mix(in srgb, var(--diff-hunk-fg) 70%, transparent);
  border-color: var(--canvas);
}
[data-expand-button]:hover {
  color: var(--diff-hunk-fg);
}
[data-utility-button] {
  width: 18px;
  height: 18px;
  margin-top: 1px;
  margin-right: calc(-18px + 1ch);
  border-radius: 4px;
  background-color: var(--accent-solid);
  color: var(--accent-fg);
}
[data-utility-button]:hover {
  background-color: var(--accent-hover);
}
[data-utility-button] svg {
  width: 10px;
  height: 10px;
}
`;

/** Token colours plus the flat bordered file-card chrome used by CodeSurface. */
export const SURFACE_UNSAFE_CSS = `${SURFACE_TOKEN_CSS}
:host {
  display: block;
  position: relative;
  border-radius: 8px;
  overflow: clip;
}
:host::after {
  content: '';
  position: absolute;
  inset: 0;
  z-index: 20;
  border: 1px solid var(--border);
  border-radius: 8px;
  pointer-events: none;
}
[data-diffs-header] {
  box-sizing: border-box;
  height: ${FILE_HEADER_HEIGHT}px;
  min-height: ${FILE_HEADER_HEIGHT}px;
  padding-inline: 6px 6px;
  gap: 8px;
  font-size: 12px;
  background-color: var(--panel);
  border-bottom: 1px solid var(--border);
}
[data-diffs-header][data-sticky] {
  background-color: var(--panel);
}
[data-diffs-header] [data-header-content] {
  gap: 6px;
}
[data-diffs-header] [data-title] {
  font-family: var(--diffs-font-family);
  font-weight: 400;
  color: var(--fg);
}
[data-diffs-header] [data-prev-name] {
  font-family: var(--diffs-font-family);
  color: var(--fg-subtle);
  text-decoration: line-through;
  opacity: 1;
}
[data-diffs-header] [data-change-icon] {
  display: none;
}
[data-diffs-header] [data-metadata] {
  font-size: 12px;
  gap: 6px;
}
[data-diffs-header] :is([data-additions-count], [data-deletions-count]) {
  font-weight: 600;
}
`;

export const surfaceStyleVars = {
  '--diffs-font-family': 'var(--font-mono)',
  '--diffs-header-font-family': 'var(--font-sans)',
  '--diffs-font-size': '12px',
  '--diffs-line-height': '20px',
  '--diffs-tab-size': '2',
} as Record<string, string>;
