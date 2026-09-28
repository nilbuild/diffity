import type { SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function base(props: IconProps) {
  const { size = 14, ...rest } = props;
  return {
    width: size,
    height: size,
    viewBox: '0 0 16 16',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.5,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
    ...rest,
  };
}

export const IconX = (props: IconProps) => (
  <svg {...base(props)}><path d="M4 4l8 8M12 4l-8 8" /></svg>
);
export const IconPlus = (props: IconProps) => (
  <svg {...base(props)}><path d="M8 3v10M3 8h10" /></svg>
);
export const IconCheck = (props: IconProps) => (
  <svg {...base(props)}><path d="M3 8.5l3 3 7-7" /></svg>
);
export const IconChevronDown = (props: IconProps) => (
  <svg {...base(props)}><path d="M4 6l4 4 4-4" /></svg>
);
export const IconChevronRight = (props: IconProps) => (
  <svg {...base(props)}><path d="M6 4l4 4-4 4" /></svg>
);
export const IconHistory = (props: IconProps) => (
  <svg {...base(props)}><path d="M2.5 8a5.5 5.5 0 1 0 1.6-3.9M2.5 2.5v2.5H5M8 5v3l2 1.5" /></svg>
);
export const IconStop = (props: IconProps) => (
  <svg {...base(props)}><rect x="4" y="4" width="8" height="8" rx="1.5" fill="currentColor" stroke="none" /></svg>
);
export const IconSend = (props: IconProps) => (
  <svg {...base(props)}><path d="M8 13V3M4 7l4-4 4 4" /></svg>
);
export const IconAlert = (props: IconProps) => (
  <svg {...base(props)}><path d="M8 2l6.5 11.5h-13L8 2zM8 6.5v3M8 11.5v.01" /></svg>
);
export const IconFile = (props: IconProps) => (
  <svg {...base(props)}><path d="M4 1.5h5l3 3v10H4zM9 1.5v3h3" /></svg>
);
export const IconSearch = (props: IconProps) => (
  <svg {...base(props)}><circle cx="7" cy="7" r="4.5" /><path d="M10.5 10.5L14 14" /></svg>
);
export const IconPencil = (props: IconProps) => (
  <svg {...base(props)}><path d="M11 2.5l2.5 2.5L6 12.5H3.5V10z" /></svg>
);
export const IconTerminal = (props: IconProps) => (
  <svg {...base(props)}><path d="M3 4.5l3 3-3 3M8 11.5h5" /></svg>
);
export const IconTrash = (props: IconProps) => (
  <svg {...base(props)}><path d="M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.5 9h6l.5-9" /></svg>
);
export const IconSparkles = (props: IconProps) => (
  <svg {...base(props)}><path d="M6 2.5l1.2 3.3L10.5 7 7.2 8.2 6 11.5 4.8 8.2 1.5 7l3.3-1.2zM12 9.5l.6 1.4 1.4.6-1.4.6-.6 1.4-.6-1.4-1.4-.6 1.4-.6z" /></svg>
);
export const IconBrain = (props: IconProps) => (
  <svg {...base(props)}><path d="M6 2.5a2 2 0 0 0-2 2 2 2 0 0 0-1.5 3.3A2.2 2.2 0 0 0 4.5 11.5 2 2 0 0 0 8 12.5V3.5a1.5 1.5 0 0 0-2-1zM10 2.5a2 2 0 0 1 2 2 2 2 0 0 1 1.5 3.3 2.2 2.2 0 0 1-2 3.7A2 2 0 0 1 8 12.5" /></svg>
);
export const IconArrowDown = (props: IconProps) => (
  <svg {...base(props)}><path d="M8 3v10M4 9l4 4 4-4" /></svg>
);
export const IconArrowUp = (props: IconProps) => (
  <svg {...base(props)}><path d="M8 13V3M4 7l4-4 4 4" /></svg>
);
export const IconRefresh = (props: IconProps) => (
  <svg {...base(props)}><path d="M13.5 8A5.5 5.5 0 1 1 11.9 4.1M13.5 2.5V5H11" /></svg>
);
export const IconExternal = (props: IconProps) => (
  <svg {...base(props)}><path d="M9 2.5h4.5V7M13.5 2.5L7 9M11.5 9.5v4h-9v-9h4" /></svg>
);
export const IconBranch = (props: IconProps) => (
  <svg {...base(props)}><circle cx="4.5" cy="3.5" r="1.5" /><circle cx="4.5" cy="12.5" r="1.5" /><circle cx="11.5" cy="5" r="1.5" /><path d="M4.5 5v6M11.5 6.5c0 3-7 2-7 4.5" /></svg>
);
export const IconMessage = (props: IconProps) => (
  <svg {...base(props)}><path d="M2.5 3.5h11v7.5H7l-3 2.5V11H2.5z" /></svg>
);
export const IconGlobe = (props: IconProps) => (
  <svg {...base(props)}><circle cx="8" cy="8" r="5.5" /><path d="M2.5 8h11M8 2.5c1.8 2 1.8 9 0 11M8 2.5c-1.8 2-1.8 9 0 11" /></svg>
);
export const IconTool = (props: IconProps) => (
  <svg {...base(props)}><path d="M10 2.5a3 3 0 0 0-2.8 4L2.5 11.2l2.3 2.3 4.7-4.7A3 3 0 0 0 13.5 6l-1.8 1.8-1.8-.3-.3-1.8z" /></svg>
);
export const IconDot = (props: IconProps) => (
  <svg {...base(props)}><circle cx="8" cy="8" r="2.5" fill="currentColor" stroke="none" /></svg>
);
export const IconCircle = (props: IconProps) => (
  <svg {...base(props)}><circle cx="8" cy="8" r="5" /></svg>
);
export const IconGithub = (props: IconProps) => (
  <svg {...base(props)} viewBox="0 0 16 16" fill="currentColor" stroke="none">
    <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
  </svg>
);
