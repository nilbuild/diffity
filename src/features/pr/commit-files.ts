import type { DiffFileSummary } from '../../lib/types';

export interface CommitFile {
  path: string;
  oldPath: string | null;
  status: string;
  additions: number;
  deletions: number;
  hidden: boolean;
}

export function commitFiles(files: DiffFileSummary[], hidden: string[]): CommitFile[] {
  const listed: CommitFile[] = files.map((file) => ({
    path: file.path,
    oldPath: file.oldPath,
    status: file.status === 'untracked' ? 'added' : file.status,
    additions: file.additions,
    deletions: file.deletions,
    hidden: false,
  }));
  const seen = new Set(listed.map((file) => file.path));
  for (const path of hidden) {
    if (!seen.has(path)) {
      listed.push({ path, oldPath: null, status: 'modified', additions: 0, deletions: 0, hidden: true });
    }
  }
  return listed;
}

/** The pathspecs a commit of `files` needs: a rename takes its old path along so the removal lands too. */
export function commitPathspecs(files: CommitFile[]): string[] {
  const paths: string[] = [];
  for (const file of files) {
    paths.push(file.path);
    if (file.oldPath && file.oldPath !== file.path) {
      paths.push(file.oldPath);
    }
  }
  return paths;
}
