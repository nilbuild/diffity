interface StaleDiffBannerProps {
  onRefresh: () => void;
  message?: string;
}

export function StaleDiffBanner(props: StaleDiffBannerProps) {
  const { onRefresh, message = 'Files have changed since this diff was loaded' } = props;

  return (
    <div className="sticky top-0 z-30 flex items-center justify-center gap-3 px-4 py-1.5 bg-accent/10 border-b border-accent/20 text-xs animate-slide-down">
      <span className="text-accent font-medium">
        {message}
      </span>
      <button
        onClick={onRefresh}
        className="px-2.5 py-0.5 bg-accent text-white rounded-md text-[11px] font-medium hover:bg-accent-hover transition-colors cursor-pointer"
      >
        Refresh
      </button>
    </div>
  );
}
