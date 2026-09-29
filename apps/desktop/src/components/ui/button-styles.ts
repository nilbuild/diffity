const base = 'inline-flex items-center justify-center gap-1.5 shrink-0 whitespace-nowrap rounded-md text-xs transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-default';

export const buttonPrimary = `${base} h-7 px-2.5 font-medium bg-accent text-white hover:bg-accent-hover`;
export const buttonOutline = `${base} h-7 px-2.5 border border-border bg-raised text-text-secondary hover:bg-hover hover:text-text`;
export const buttonGhost = `${base} h-7 px-2 text-text-secondary hover:bg-hover hover:text-text`;
export const buttonIcon = `${base} w-7 h-7 text-text-muted hover:bg-hover hover:text-text`;
export const buttonIconSmall = `${base} w-6 h-6 text-text-muted hover:bg-hover hover:text-text`;
export const buttonSmall = `${base} h-6 px-2`;

export const buttonGroup = 'flex items-stretch h-7 shrink-0 rounded-md border border-border bg-raised overflow-hidden';
export const buttonGroupItem = 'flex items-center gap-1.5 px-2 text-xs text-text-secondary hover:bg-hover hover:text-text transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-default';
export const buttonGroupDivider = 'border-l border-border';
