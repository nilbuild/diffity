interface DiffStatsProps {
  additions: number;
  deletions: number;
  className?: string;
}

export function DiffStats(props: DiffStatsProps) {
  const { additions, deletions, className = '' } = props;

  return (
    <span className={`flex gap-1 shrink-0 font-mono text-[11.5px] tabular-nums ${className}`}>
      {additions > 0 && (
        <span className="text-added font-medium">+{additions}</span>
      )}
      {deletions > 0 && (
        <span className="text-deleted font-medium">-{deletions}</span>
      )}
    </span>
  );
}
