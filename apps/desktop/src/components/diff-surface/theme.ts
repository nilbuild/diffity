export const DIFF_THEMES = { dark: 'pierre-dark', light: 'pierre-light' } as const;

export const SURFACE_UNSAFE_CSS = `
[data-diffs-header] {
  font-size: 12px;
}
[data-diffs-header] [data-title] {
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
