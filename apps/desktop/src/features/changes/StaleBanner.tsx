import { Button } from '@/components/ui/Button';
import { RefreshIcon } from '@/components/ui/icons';

export function StaleBanner(props: { onRefresh: () => void }) {
  return (
    <div className="flex items-center gap-3 border-b border-warning/30 bg-warning/10 px-4 py-1.5 text-xs text-fg">
      <span className="size-1.5 rounded-full bg-warning" />
      Files changed on disk since this diff was loaded.
      <Button size="sm" variant="secondary" className="ml-auto" onClick={props.onRefresh}>
        <RefreshIcon size={12} />
        Refresh
      </Button>
    </div>
  );
}
