import { useEffect, type RefObject } from 'react';
import type { CodeSurfaceHandle, LineMaps, SurfaceSelection } from '@/components/diff-surface';
import { useRevealStore } from '@/features/workspace/reveal-store';
import type { DiffEntry } from './use-diff';

interface Options {
  entriesByPath: Map<string, DiffEntry>;
  lineMaps: Map<string, LineMaps>;
  focusFile: (path: string) => void;
  surfaceRef: RefObject<CodeSurfaceHandle | null>;
  setSelection: (selection: SurfaceSelection | null) => void;
}

export function useRevealRequests(options: Options) {
  const { entriesByPath, lineMaps, focusFile, surfaceRef, setSelection } = options;
  const request = useRevealStore((s) => s.request);
  const consume = useRevealStore((s) => s.consume);

  useEffect(() => {
    if (!request || !entriesByPath.has(request.path)) {
      return;
    }
    consume(request.nonce);
    const { path, line } = request;
    if (line === null) {
      focusFile(path);
      return;
    }
    const side = lineMaps.get(path)?.new.has(line) ? 'new' : 'old';
    focusFile(path);
    setSelection({ itemId: path, range: { side, start: line, end: line } });
    setTimeout(() => surfaceRef.current?.scrollToLine(path, line, side), 50);
  }, [request, entriesByPath, lineMaps, focusFile, surfaceRef, setSelection, consume]);
}
