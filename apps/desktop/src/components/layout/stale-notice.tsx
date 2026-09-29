interface StaleNoticeProps {
  onRefresh: () => void;
  message?: string;
}

export function StaleNotice(props: StaleNoticeProps) {
  const { onRefresh, message = 'Files changed on disk' } = props;

  return (
    <button
      onClick={onRefresh}
      className="group inline-flex items-center gap-1.5 h-5 px-2 rounded-full border border-border bg-bg text-text-secondary shrink-0 cursor-pointer hover:text-text hover:bg-hover transition-colors"
      title={`${message} — refresh to see the latest version`}
    >
      <span className="w-1.5 h-1.5 rounded-full bg-modified/80" />
      <span>{message}</span>
      <span className="font-medium text-text">Refresh</span>
    </button>
  );
}
