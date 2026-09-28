import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { EmptyState } from '@/components/ui/EmptyState';
import { IconButton } from '@/components/ui/IconButton';
import { SegmentedToggle } from '@/components/ui/SegmentedToggle';
import { Spinner } from '@/components/ui/Spinner';
import { FileImageIcon, ZoomInIcon, ZoomOutIcon } from '@/components/ui/icon';
import * as api from '@/lib/api';
import { cn } from '@/lib/cn';
import { useWorkspace } from '@/features/workspace/workspace-context';

type Zoom = 'fit' | number;

const STEPS = [0.25, 0.5, 1, 2, 4];

export function ImageViewer(props: { path: string; mime: string }) {
  const { path, mime } = props;
  const { repoPath } = useWorkspace();
  const [zoom, setZoom] = useState<Zoom>('fit');
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const query = useQuery({
    queryKey: ['repo', repoPath, 'fileBase64', path],
    queryFn: () => api.readFileBase64(repoPath, path),
  });

  if (query.isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner className="text-fg-subtle" />
      </div>
    );
  }
  if (!query.data) {
    return <EmptyState icon={<FileImageIcon size={20} />} tone="danger" title="Could not load image" description={api.errorMessage(query.error)} />;
  }

  const scale = zoom === 'fit' ? null : zoom;
  const stepIndex = scale === null ? STEPS.indexOf(1) : STEPS.indexOf(scale);
  const step = (delta: number) => {
    const next = STEPS[Math.max(0, Math.min(STEPS.length - 1, stepIndex + delta))];
    setZoom(next);
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-9 shrink-0 items-center gap-2 border-b border-border-subtle bg-canvas px-3 text-xs text-fg-subtle">
        {size && (
          <span className="tabular-nums">
            {size.w} × {size.h}px
          </span>
        )}
        <span>{scale === null ? 'Fit' : `${Math.round(scale * 100)}%`}</span>
        <div className="ml-auto flex items-center gap-0.5">
          <IconButton size="sm" label="Zoom out" disabled={scale !== null && stepIndex === 0} onClick={() => step(-1)}>
            <ZoomOutIcon size={14} />
          </IconButton>
          <IconButton size="sm" label="Zoom in" disabled={scale !== null && stepIndex === STEPS.length - 1} onClick={() => step(1)}>
            <ZoomInIcon size={14} />
          </IconButton>
          <SegmentedToggle<string>
            size="sm"
            value={zoom === 'fit' ? 'fit' : zoom === 1 ? 'actual' : ''}
            onChange={(value) => setZoom(value === 'fit' ? 'fit' : 1)}
            options={[
              { value: 'fit', label: 'Fit' },
              { value: 'actual', label: '100%' },
            ]}
          />
        </div>
      </div>
      <div className={cn('min-h-0 flex-1 overflow-auto p-8', scale === null && 'flex items-center justify-center')}>
        <div className={cn('checkerboard inline-block rounded-md border border-border', scale === null && 'max-h-full max-w-full')}>
          <img
            src={`data:${mime};base64,${query.data}`}
            alt={path}
            onLoad={(event) => setSize({ w: event.currentTarget.naturalWidth, h: event.currentTarget.naturalHeight })}
            style={scale !== null && size ? { width: size.w * scale, height: size.h * scale, maxWidth: 'none' } : undefined}
            className={cn('block', scale === null && 'max-h-[calc(100vh-180px)] max-w-full object-contain')}
          />
        </div>
      </div>
    </div>
  );
}
