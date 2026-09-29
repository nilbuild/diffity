interface CodeIconProps {
  className?: string;
}

export function CodeIcon(props: CodeIconProps) {
  const { className = 'w-4 h-4' } = props;
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m16 18 6-6-6-6" />
      <path d="m8 6-6 6 6 6" />
    </svg>
  );
}
