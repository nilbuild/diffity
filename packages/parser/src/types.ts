export type FileStatus = 'added' | 'deleted' | 'modified' | 'renamed' | 'copied';

export type LineDiffType = 'equal' | 'insert' | 'delete';

export interface WordDiffSegment {
  text: string;
  type: LineDiffType;
}

export type DiffLineType = 'add' | 'delete' | 'context';

export interface DiffLine {
  type: DiffLineType;
  content: string;
  oldLineNumber: number | null;
  newLineNumber: number | null;
  noNewline?: boolean;
  wordDiff?: WordDiffSegment[];
}

export interface DiffHunk {
  header: string;
  oldStart: number;
  oldCount: number;
  newStart: number;
  newCount: number;
  context?: string;
  lines: DiffLine[];
}

export interface DiffFile {
  oldPath: string;
  newPath: string;
  status: FileStatus;
  hunks: DiffHunk[];
  additions: number;
  deletions: number;
  isBinary: boolean;
  oldMode?: string;
  newMode?: string;
  similarityIndex?: number;
  oldFileLineCount?: number;
}

export interface ParsedDiff {
  files: DiffFile[];
  stats: {
    totalAdditions: number;
    totalDeletions: number;
    filesChanged: number;
  };
}
