interface DiffStatsProps {
  additions: number;
  deletions: number;
  className?: string;
}

export function DiffStats(props: DiffStatsProps) {
  const { additions, deletions, className = '' } = props;

  return (
    <span className={`flex gap-1 shrink-0 font-mono text-xs ${className}`}>
      {additions > 0 && (
        <span className="text-added font-semibold">+{additions}</span>
      )}
      {deletions > 0 && (
        <span className="text-deleted font-semibold">-{deletions}</span>
      )}
    </span>
  );
}
