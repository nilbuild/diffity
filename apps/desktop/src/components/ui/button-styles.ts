const base = 'inline-flex items-center justify-center gap-1.5 shrink-0 whitespace-nowrap rounded-md text-[13px] transition-colors cursor-pointer disabled:opacity-45 disabled:cursor-default';

export const buttonPrimary = `${base} h-7 px-3 font-medium border border-transparent bg-primary text-white hover:bg-primary-hover disabled:opacity-100 disabled:bg-fill disabled:text-text-muted disabled:hover:bg-fill disabled:border-control-border/70`;
export const buttonOutline = `${base} h-7 px-3 border border-control-border bg-raised text-text hover:bg-control-hover disabled:hover:bg-raised`;
export const buttonGhost = `${base} h-7 px-2.5 text-text-secondary hover:bg-hover hover:text-text`;
export const buttonIcon = `${base} w-7 h-7 text-text-secondary hover:bg-hover hover:text-text`;
export const buttonIconOutline = `${base} w-7 h-7 border border-control-border bg-raised text-text-secondary hover:bg-control-hover hover:text-text`;
export const buttonIconSmall = `${base} w-6 h-6 text-text-muted hover:bg-hover hover:text-text`;
export const buttonSmall = `${base} h-6 px-2 text-xs`;

export const buttonClaude = `${base} h-7 px-3 font-medium border border-claude/30 bg-claude/10 text-claude hover:bg-claude/16`;
export const buttonClaudeSolid = `${base} h-7 px-3 font-medium border border-transparent bg-claude text-white hover:bg-claude-hover disabled:opacity-100 disabled:bg-fill disabled:text-text-muted disabled:border-control-border/70`;
export const buttonGroupClaude = 'flex items-stretch h-7 shrink-0 rounded-md border border-claude/30 bg-claude/10 overflow-hidden';
export const buttonGroupClaudeItem = 'flex items-center gap-1.5 px-2.5 text-[13px] font-medium text-claude hover:bg-claude/15 transition-colors cursor-pointer disabled:opacity-45 disabled:cursor-default';
export const buttonGroupClaudeDivider = 'border-l border-claude/25';

export const buttonGroup = 'flex items-stretch h-7 shrink-0 rounded-md border border-control-border bg-raised overflow-hidden';
export const buttonGroupItem = 'flex items-center gap-1.5 px-2.5 text-[13px] text-text hover:bg-control-hover transition-colors cursor-pointer disabled:opacity-45 disabled:cursor-default';
export const buttonGroupDivider = 'border-l border-control-border';

export const inputField = 'w-full h-7 px-2.5 rounded-md bg-raised border border-control-border text-[13px] text-text placeholder:font-sans placeholder:text-text-muted outline-none transition-colors hover:border-control-border focus:border-focus focus:hover:border-focus';

export const overlayPanel = 'bg-overlay rounded-lg ring-1 ring-overlay-border';

export const sectionLabel = 'px-2.5 pt-2 pb-1 text-[11px] font-medium text-text-secondary';

export const segmentActive = 'bg-toggle text-text font-medium ring-1 ring-toggle-border';
export const segmentInactive = 'text-text-secondary hover:text-text';
