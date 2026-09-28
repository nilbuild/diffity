export const DIFF_THEMES = { dark: 'pierre-dark', light: 'pierre-light' } as const;

/**
 * Maps @pierre/diffs onto the app tokens (styles.css). App CSS variables inherit into the
 * library's encapsulated DOM, and the `unsafe` layer wins over the theme's inline colours, so the
 * code surface shares the app's canvas, borders and semantic add/remove colours.
 * Every file renders as a flat bordered card, header separated by a 1px border.
 * Keep the header height at the library default (44px): CodeView virtualises using that metric.
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
  --diffs-bg-separator-override: var(--panel);
  --diffs-bg-context-override: var(--panel);
  --diffs-bg-context-gutter-override: var(--panel);
  --diffs-bg-buffer-override: var(--panel);
  --diffs-bg-hover-override: var(--fg-subtle);
}
[data-separator-content] {
  color: var(--fg-muted);
  font-size: 12px;
}
[data-separator-content]:hover,
[data-expand-button]:hover {
  color: var(--fg);
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
  height: 44px;
  min-height: 44px;
  padding-inline: 8px 8px;
  font-size: 13px;
  background-color: var(--panel);
  border-bottom: 1px solid var(--border);
}
[data-diffs-header][data-sticky] {
  background-color: var(--panel);
}
[data-diffs-header] [data-title] {
  font-weight: 600;
  color: var(--fg);
}
[data-diffs-header] [data-prev-name] {
  color: var(--fg-muted);
}
[data-diffs-header] [data-metadata] {
  font-size: 12px;
}
`;

export const surfaceStyleVars = {
  '--diffs-font-family': 'var(--font-mono)',
  '--diffs-header-font-family': 'var(--font-sans)',
  '--diffs-font-size': '12px',
  '--diffs-line-height': '20px',
  '--diffs-tab-size': '2',
} as Record<string, string>;
