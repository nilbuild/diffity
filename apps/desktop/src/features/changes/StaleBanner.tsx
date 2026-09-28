import { Button } from '@/components/ui/Button';
import { AlertIcon, RefreshIcon } from '@/components/ui/icon';

export function StaleBanner(props: { onRefresh: () => void }) {
  return (
    <div className="flex items-center gap-3 h-9 shrink-0 border-b border-warning/30 bg-warning/10 px-3 text-xs text-fg">
      <AlertIcon size={14} className="shrink-0 text-warning" />
      Files changed on disk since this diff was loaded.
      <Button size="sm" variant="secondary" className="ml-auto" onClick={props.onRefresh}>
        <RefreshIcon size={12} />
        Refresh
      </Button>
    </div>
  );
}
