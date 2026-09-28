export { CodeSurface, type CodeSurfaceProps } from './CodeSurface';
export { DiffSurfaceProvider } from './DiffSurfaceProvider';
export {
  buildLineMaps,
  hunkForRange,
  hunkToPatch,
  listHunks,
  parsePatch,
  rangeExists,
  snippetFor,
  type HunkInfo,
  type LineMaps,
} from './parse';
export type {
  CodeSurfaceHandle,
  LoadedFileVersions,
  ParsedFileDiff,
  SurfaceAnnotation,
  SurfaceDiffItem,
  SurfaceFileItem,
  SurfaceItem,
  SurfaceRange,
  SurfaceSelection,
  SurfaceSide,
} from './types';
