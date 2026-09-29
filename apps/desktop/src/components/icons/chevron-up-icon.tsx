interface ChevronUpIconProps {
  className?: string;
}

export function ChevronUpIcon(props: ChevronUpIconProps) {
  return (
    <svg className={props.className ?? 'w-4 h-4'} viewBox="0 0 16 16" fill="currentColor">
      <path d="M3.22 10.53a.75.75 0 010-1.06l4.25-4.25a.75.75 0 011.06 0l4.25 4.25a.75.75 0 01-1.06 1.06L8 6.81 4.28 10.53a.75.75 0 01-1.06 0z" />
    </svg>
  );
}
