interface ChevronRightIconProps {
  className?: string;
}

export function ChevronRightIcon(props: ChevronRightIconProps) {
  return (
    <svg className={props.className ?? 'w-4 h-4'} viewBox="0 0 16 16" fill="currentColor">
      <path d="M6.22 3.22a.75.75 0 011.06 0l4.25 4.25a.75.75 0 010 1.06l-4.25 4.25a.75.75 0 01-1.06-1.06L9.94 8 6.22 4.28a.75.75 0 010-1.06z" />
    </svg>
  );
}
