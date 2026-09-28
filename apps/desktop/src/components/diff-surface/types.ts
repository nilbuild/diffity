import type { FileDiffMetadata } from '@pierre/diffs';

export type ParsedFileDiff = FileDiffMetadata;

export type SurfaceSide = 'old' | 'new';

export interface SurfaceRange {
  side: SurfaceSide;
  start: number;
  end: number;
}

export interface SurfaceSelection {
  itemId: string;
  range: SurfaceRange;
}

export interface SurfaceAnnotation<T> {
  side: SurfaceSide;
  line: number;
  data: T;
}

interface SurfaceItemBase<T> {
  id: string;
  annotations: SurfaceAnnotation<T>[];
  /** Bump whenever anything about the item (annotations, collapse, content) changes. */
  version: number;
  collapsed?: boolean;
}

export interface SurfaceDiffItem<T> extends SurfaceItemBase<T> {
  kind: 'diff';
  fileDiff: ParsedFileDiff;
}

export interface SurfaceFileItem<T> extends SurfaceItemBase<T> {
  kind: 'file';
  name: string;
  contents: string;
}

export type SurfaceItem<T> = SurfaceDiffItem<T> | SurfaceFileItem<T>;

export interface LoadedFileVersions {
  oldContents: string | null;
  newContents: string | null;
}

export interface CodeSurfaceHandle {
  scrollToTop: () => void;
  scrollToItem: (itemId: string) => void;
  scrollToLine: (itemId: string, line: number, side: SurfaceSide) => void;
  setSelection: (selection: SurfaceSelection | null) => void;
  getTopItemId: () => string | null;
}
