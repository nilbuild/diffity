export function Spinner(props: { className?: string }) {
  const { className = 'w-3 h-3' } = props;

  return (
    <span className={`inline-block border-2 border-text-muted/40 border-t-transparent rounded-full animate-spin ${className}`} />
  );
}
