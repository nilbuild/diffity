interface StaleDiffBannerProps {
  onRefresh: () => void;
  message?: string;
}

export function StaleDiffBanner(props: StaleDiffBannerProps) {
  const { onRefresh, message = 'Files have changed since this diff was loaded' } = props;

  return (
    <div className="sticky top-0 z-30 flex items-center justify-center gap-3 h-8 px-3 bg-accent/10 border-b border-accent/20 text-xs animate-slide-down">
      <span className="text-accent font-medium">
        {message}
      </span>
      <button
        onClick={onRefresh}
        className="h-6 px-2 bg-accent text-white rounded-md text-[11px] font-medium hover:bg-accent-hover transition-colors cursor-pointer"
      >
        Refresh
      </button>
    </div>
  );
}
