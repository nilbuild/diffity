interface ChevronDownIconProps {
  className?: string;
}

export function ChevronDownIcon(props: ChevronDownIconProps) {
  return (
    <svg className={props.className ?? 'w-4 h-4'} viewBox="0 0 16 16" fill="currentColor">
      <path d="M12.78 5.47a.75.75 0 010 1.06l-4.25 4.25a.75.75 0 01-1.06 0L3.22 6.53a.75.75 0 011.06-1.06L8 9.19l3.72-3.72a.75.75 0 011.06 0z" />
    </svg>
  );
}
