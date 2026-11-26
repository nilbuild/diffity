import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { binaryVersionsOptions } from '../../queries/file';
import { isImageFile } from '../../lib/file-types';
import type { BinaryFileSide } from '../../lib/api';
import { Spinner } from '../icons/spinner';

interface BinaryDiffViewerProps {
  filePath: string;
  oldPath: string | undefined;
  baseRef?: string;
}

const UNITS = ['B', 'KB', 'MB', 'GB'];

function formatBytes(bytes: number): string {
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < UNITS.length - 1) {
    value /= 1024;
    unit++;
  }
  return `${unit === 0 ? value : value.toFixed(1)} ${UNITS[unit]}`;
}

function formatDelta(oldSize: number, newSize: number): string {
  const delta = newSize - oldSize;
  if (delta === 0) {
    return 'same size';
  }
  return `${delta > 0 ? '+' : '−'}${formatBytes(Math.abs(delta))}`;
}

export function BinaryDiffViewer(props: BinaryDiffViewerProps) {
  const { filePath, oldPath, baseRef } = props;
  const oldFilePath = oldPath && oldPath !== '/dev/null' ? oldPath : filePath;
  const isImage = isImageFile(filePath) || isImageFile(oldFilePath);
  const { data, isLoading, isError } = useQuery(binaryVersionsOptions(filePath, oldPath, baseRef, isImage));

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-14">
        <Spinner className="w-4 h-4 text-text-muted" />
      </div>
    );
  }

  if (isError || !data || (!data.old && !data.new)) {
    return <div className="p-4 text-center text-text-muted italic">Binary file not shown</div>;
  }

  if (!isImage) {
    return (
      <div className="p-4 text-center text-[13px] text-text-muted">
        Binary file · <SizeSummary old={data.old} new={data.new} />
      </div>
    );
  }

  if (data.old && data.new) {
    return (
      <div className="p-4">
        <div className="grid grid-cols-2 gap-4">
          <ImagePanel label="Before" side={data.old} alt={oldFilePath} />
          <ImagePanel label="After" side={data.new} alt={filePath} />
        </div>
        <div className="mt-3 text-center text-xs text-text-muted">
          <SizeSummary old={data.old} new={data.new} />
        </div>
      </div>
    );
  }

  const side = data.new ?? data.old;
  if (!side) {
    return null;
  }
  return (
    <div className="p-4">
      <ImagePanel side={side} alt={data.new ? filePath : oldFilePath} />
    </div>
  );
}

function SizeSummary(props: { old: BinaryFileSide | null; new: BinaryFileSide | null }) {
  const { old: oldSide, new: newSide } = props;
  if (oldSide && newSide) {
    return (
      <>
        {formatBytes(oldSide.size)} → {formatBytes(newSide.size)}
        <span className="ml-1.5 text-text-secondary">({formatDelta(oldSide.size, newSide.size)})</span>
      </>
    );
  }
  const side = newSide ?? oldSide;
  return <>{side ? formatBytes(side.size) : ''}</>;
}

function ImagePanel(props: { side: BinaryFileSide; alt: string; label?: string }) {
  const { side, alt, label } = props;
  const [dimensions, setDimensions] = useState<{ width: number; height: number } | null>(null);

  return (
    <div className="flex flex-col min-w-0">
      {label && <div className="text-xs text-text-muted font-medium mb-2 px-1">{label}</div>}
      <div className="flex flex-1 items-center justify-center min-h-32 p-4 rounded-md border border-border bg-[conic-gradient(var(--color-bg-tertiary)_25%,transparent_0_50%,var(--color-bg-tertiary)_0_75%,transparent_0)] bg-size-[16px_16px]">
        {side.url ? (
          <img
            src={side.url}
            alt={alt}
            className="max-w-full max-h-[480px] object-contain"
            onLoad={(event) => setDimensions({ width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight })}
          />
        ) : (
          <span className="text-xs text-text-muted italic">Too large to preview</span>
        )}
      </div>
      <div className="mt-1.5 px-1 text-xs text-text-muted tabular-nums">
        {dimensions && `${dimensions.width} × ${dimensions.height} · `}
        {formatBytes(side.size)}
      </div>
    </div>
  );
}
