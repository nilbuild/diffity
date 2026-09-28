import { useCallback, useImperativeHandle, useMemo, useRef, type ReactNode, type Ref } from 'react';
import { CodeView, type CodeViewHandle, type CodeViewItem, type CodeViewReactOptions } from '@pierre/diffs/react';
import type { FileDiffLoadedFiles, FileDiffMetadata, SelectedLineRange } from '@pierre/diffs';
import { useResolvedTheme } from '@/lib/theme';
import { DIFF_THEMES, SURFACE_TOKEN_CSS, SURFACE_UNSAFE_CSS, surfaceStyleVars } from './theme';
import type {
  CodeSurfaceHandle,
  LoadedFileVersions,
  SurfaceItem,
  SurfaceRange,
  SurfaceSelection,
  SurfaceSide,
} from './types';

type Meta<T> = T[];
type LibItem<T> = CodeViewItem<Meta<T>>;
type LibRange = SelectedLineRange;

export interface CodeSurfaceProps<T> {
  items: SurfaceItem<T>[];
  diffStyle?: 'split' | 'unified';
  wordDiff?: boolean;
  wrap?: boolean;
  hideFileHeader?: boolean;
  selection: SurfaceSelection | null;
  onSelectionChange: (selection: SurfaceSelection | null) => void;
  onGutterClick?: (itemId: string, range: SurfaceRange) => void;
  loadFiles?: (path: string, oldPath: string | null) => Promise<LoadedFileVersions>;
  renderAnnotation?: (data: T[], itemId: string) => ReactNode;
  renderHeaderPrefix?: (itemId: string) => ReactNode;
  renderHeaderActions?: (itemId: string) => ReactNode;
  renderTop?: () => ReactNode;
  renderBottom?: () => ReactNode;
  onScroll?: (scrollTop: number) => void;
  handleRef?: Ref<CodeSurfaceHandle>;
  className?: string;
}

const toLibSide = (side: SurfaceSide) => (side === 'old' ? 'deletions' : 'additions');
const fromLibSide = (side: string | undefined): SurfaceSide => (side === 'deletions' ? 'old' : 'new');

export function toSurfaceRange(range: LibRange, isFile: boolean): SurfaceRange {
  const start = Math.min(range.start, range.end);
  const end = Math.max(range.start, range.end);
  if (isFile) {
    return { side: 'new', start, end };
  }
  const startSide = fromLibSide(range.side);
  const endSide = fromLibSide(range.endSide ?? range.side);
  if (startSide !== endSide) {
    return { side: endSide, start: range.end, end: range.end };
  }
  return { side: startSide, start, end };
}

function toLibRange(range: SurfaceRange, isFile: boolean): LibRange {
  if (isFile) {
    return { start: range.start, end: range.end };
  }
  const side = toLibSide(range.side);
  return { start: range.start, end: range.end, side, endSide: side };
}

function groupAnnotations<T>(item: SurfaceItem<T>) {
  const groups = new Map<string, { side: SurfaceSide; line: number; data: T[] }>();
  for (const annotation of item.annotations) {
    const side = item.kind === 'file' ? 'new' : annotation.side;
    const key = `${side}:${annotation.line}`;
    const group = groups.get(key);
    if (group) {
      group.data.push(annotation.data);
      continue;
    }
    groups.set(key, { side, line: annotation.line, data: [annotation.data] });
  }
  return [...groups.values()];
}

function toLibItem<T>(item: SurfaceItem<T>): LibItem<T> {
  const groups = groupAnnotations(item);
  if (item.kind === 'file') {
    return {
      id: item.id,
      type: 'file',
      version: item.version,
      collapsed: item.collapsed,
      file: { name: item.name, contents: item.contents, cacheKey: `${item.id}:${item.version}` },
      annotations: groups.map((g) => ({ lineNumber: g.line, metadata: g.data })),
    };
  }
  return {
    id: item.id,
    type: 'diff',
    version: item.version,
    collapsed: item.collapsed,
    fileDiff: item.fileDiff,
    annotations: groups.map((g) => ({ side: toLibSide(g.side), lineNumber: g.line, metadata: g.data })),
  };
}

function useLatest<V>(value: V) {
  const ref = useRef(value);
  ref.current = value;
  return ref;
}

export function CodeSurface<T>(props: CodeSurfaceProps<T>) {
  const {
    items,
    diffStyle = 'split',
    wordDiff = true,
    wrap = false,
    hideFileHeader = false,
    selection,
    onSelectionChange,
    renderAnnotation,
    renderHeaderPrefix,
    renderHeaderActions,
    renderTop,
    renderBottom,
    onScroll,
    handleRef,
    className,
  } = props;
  const themeType = useResolvedTheme();
  const viewRef = useRef<CodeViewHandle<Meta<T>, undefined>>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const cacheRef = useRef(new Map<string, { source: SurfaceItem<T>; lib: LibItem<T> }>());
  const latest = useLatest(props);

  const libItems = useMemo(() => {
    const next = new Map<string, { source: SurfaceItem<T>; lib: LibItem<T> }>();
    const result = items.map((item) => {
      const cached = cacheRef.current.get(item.id);
      if (cached && cached.source.version === item.version && cached.source.collapsed === item.collapsed) {
        next.set(item.id, cached);
        return cached.lib;
      }
      const lib = toLibItem(item);
      next.set(item.id, { source: item, lib });
      return lib;
    });
    cacheRef.current = next;
    return result;
  }, [items]);

  const kindById = useMemo(() => new Map(items.map((item) => [item.id, item.kind])), [items]);

  const loadDiffFiles = useCallback(async (fileDiff: FileDiffMetadata): Promise<FileDiffLoadedFiles> => {
    const loader = latest.current.loadFiles;
    if (!loader) {
      throw new Error('loadFiles not provided');
    }
    const versions = await loader(fileDiff.name, fileDiff.prevName ?? null);
    const newFile = { name: fileDiff.name, contents: versions.newContents ?? '' };
    if (fileDiff.type === 'rename-pure') {
      return { oldFile: null, newFile };
    }
    return {
      oldFile: { name: fileDiff.prevName ?? fileDiff.name, contents: versions.oldContents ?? '' },
      newFile,
    };
  }, [latest]);

  const onGutterUtilityClick = useCallback(
    (range: LibRange, context: { item: { id: string; type: string } }) => {
      const handler = latest.current.onGutterClick;
      if (!handler) {
        return;
      }
      handler(context.item.id, toSurfaceRange(range, context.item.type === 'file'));
    },
    [latest],
  );

  const options = useMemo(
    () =>
      ({
        theme: DIFF_THEMES,
        themeType,
        diffStyle,
        lineDiffType: wordDiff ? 'word-alt' : 'none',
        overflow: wrap ? 'wrap' : 'scroll',
        hunkSeparators: 'line-info',
        diffIndicators: 'bars',
        enableLineSelection: true,
        enableGutterUtility: true,
        onGutterUtilityClick,
        loadDiffFiles,
        stickyHeaders: !hideFileHeader,
        disableFileHeader: hideFileHeader,
        unsafeCSS: hideFileHeader ? SURFACE_TOKEN_CSS : SURFACE_UNSAFE_CSS,
        layout: hideFileHeader ? { paddingTop: 8, paddingBottom: 48, gap: 0 } : { paddingTop: 12, paddingBottom: 48, gap: 12 },
      }) as unknown as CodeViewReactOptions<Meta<T>, undefined>,
    [themeType, diffStyle, wordDiff, wrap, hideFileHeader, onGutterUtilityClick, loadDiffFiles],
  );

  const libSelection = useMemo(() => {
    if (!selection) {
      return null;
    }
    return { id: selection.itemId, range: toLibRange(selection.range, kindById.get(selection.itemId) === 'file') };
  }, [selection, kindById]);

  const handleSelectedLinesChange = useCallback(
    (next: { id: string; range: LibRange } | null) => {
      if (!next) {
        onSelectionChange(null);
        return;
      }
      onSelectionChange({ itemId: next.id, range: toSurfaceRange(next.range, kindById.get(next.id) === 'file') });
    },
    [onSelectionChange, kindById],
  );

  useImperativeHandle(
    handleRef,
    () => ({
      scrollToTop: () => {
        viewRef.current?.scrollTo({ type: 'position', position: 0, behavior: 'smooth-auto' });
      },
      scrollToItem: (itemId) => {
        viewRef.current?.scrollTo({ type: 'item', id: itemId, align: 'start', behavior: 'instant' });
      },
      scrollToLine: (itemId, line, side) => {
        const isFile = kindById.get(itemId) === 'file';
        viewRef.current?.scrollTo({
          type: 'line',
          id: itemId,
          lineNumber: line,
          side: isFile ? undefined : toLibSide(side),
          align: 'center',
          behavior: 'smooth-auto',
        });
      },
      setSelection: (next) => {
        handleSelectedLinesChange(
          next ? { id: next.itemId, range: toLibRange(next.range, kindById.get(next.itemId) === 'file') } : null,
        );
      },
      getTopItemId: () => {
        const instance = viewRef.current?.getInstance();
        const scrollTop = containerRef.current?.scrollTop ?? 0;
        if (!instance) {
          return null;
        }
        let current: string | null = null;
        for (const item of latest.current.items) {
          const top = instance.getTopForItem(item.id);
          if (top === undefined || top > scrollTop + 60) {
            break;
          }
          current = item.id;
        }
        return current ?? latest.current.items[0]?.id ?? null;
      },
    }),
    [kindById, handleSelectedLinesChange, latest],
  );

  const renderLibAnnotation = useMemo(() => {
    if (!renderAnnotation) {
      return undefined;
    }
    return (annotation: { metadata?: Meta<T> }, item: LibItem<T>) => renderAnnotation(annotation.metadata ?? [], item.id);
  }, [renderAnnotation]);

  const renderLibPrefix = useMemo(() => {
    if (!renderHeaderPrefix) {
      return undefined;
    }
    return (item: LibItem<T>) => renderHeaderPrefix(item.id);
  }, [renderHeaderPrefix]);

  const renderLibMetadata = useMemo(() => {
    if (!renderHeaderActions) {
      return undefined;
    }
    return (item: LibItem<T>) => renderHeaderActions(item.id);
  }, [renderHeaderActions]);

  const handleScroll = useMemo(() => {
    if (!onScroll) {
      return undefined;
    }
    return (scrollTop: number) => onScroll(scrollTop);
  }, [onScroll]);

  return (
    <CodeView<Meta<T>, undefined>
      ref={viewRef}
      containerRef={containerRef}
      items={libItems}
      options={options}
      selectedLines={libSelection}
      onSelectedLinesChange={handleSelectedLinesChange}
      renderAnnotation={renderLibAnnotation as never}
      renderHeaderPrefix={renderLibPrefix}
      renderHeaderMetadata={renderLibMetadata}
      renderCodeViewHeader={renderTop}
      renderCodeViewFooter={renderBottom}
      onScroll={handleScroll}
      className={className ?? (hideFileHeader ? 'h-full overflow-auto bg-canvas' : 'h-full overflow-auto bg-canvas px-3')}
      style={surfaceStyleVars}
    />
  );
}
