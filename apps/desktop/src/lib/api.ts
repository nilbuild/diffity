import { parseDiff, type DiffFile, type ParsedDiff } from '@diffity/parser';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import type { CommentThread, CommentAuthor, CommentSide, Comment, SubmitOptions } from '../components/comments/types';
import * as tauri from './tauri';
import type { DiffFileSummary, PullRequest, Thread, Comment as BackendComment, TreeEntry } from './types';
import { TREE_REF } from './types';

dayjs.extend(relativeTime);

let currentRepoPath: string | null = null;

export function setRepoPath(path: string | null) {
  currentRepoPath = path;
}

export function getRepoPathOrNull(): string | null {
  return currentRepoPath;
}

export function getRepoPath(): string {
  if (!currentRepoPath) {
    throw new Error('No repository open');
  }
  return currentRepoPath;
}

export const errorMessage = tauri.errorMessage;

const sessionRefs = new Map<string, string>();

/** The view (ref) of a review session this window has opened. */
export function refForSession(sessionId: string | null | undefined): string | null {
  if (!sessionId) {
    return null;
  }
  return sessionRefs.get(sessionId) ?? null;
}

export interface GitHubRemote {
  owner: string;
  repo: string;
}

export interface GitHubDetails {
  prNumber: number;
  prTitle: string;
  prUrl: string;
  prCreatedAt: string;
  headSha: string;
  commentCount: number;
  baseRef: string;
  headRef: string;
  pr: PullRequest;
}

export interface RepoInfo {
  name: string;
  branch: string;
  root: string;
  description: string;
  capabilities?: { reviews: boolean; revert: boolean; staleness: boolean };
  sessionId?: string | null;
  github?: GitHubRemote | null;
  editor?: 'vscode' | null;
}

export interface Commit {
  hash: string;
  shortHash: string;
  message: string;
  author: string;
  date: string;
  relativeDate: string;
  filesChanged: number;
  additions: number;
  deletions: number;
}

export interface OverviewFile {
  path: string;
  status: 'staged' | 'modified' | 'added';
}

export interface Overview {
  files: OverviewFile[];
}

export interface CommitsPage {
  commits: Commit[];
  hasMore: boolean;
}

const WORKING_TREE_LABELS: Record<string, string> = {
  staged: 'Staged changes',
  unstaged: 'Unstaged changes',
  work: 'Uncommitted changes',
  '.': 'Uncommitted changes',
};

const COMMIT_REF = /^([0-9a-f]{7,40})~1\.\.\1$/i;

/** The commit sha when `ref` is a single-commit ref (`<sha>~1..<sha>`). */
export function parseCommitRef(ref: string): string | null {
  const match = COMMIT_REF.exec(ref);
  return match ? match[1] : null;
}

export function isWorkingTreeRef(ref: string): boolean {
  return ref in WORKING_TREE_LABELS;
}

export function descriptionForRef(ref: string): string {
  const label = WORKING_TREE_LABELS[ref];
  if (label) {
    return label;
  }
  const commit = parseCommitRef(ref);
  if (commit) {
    return `Commit ${commit.slice(0, 7)}`;
  }
  if (ref.includes('..')) {
    const [base, head] = ref.split(/\.{2,3}/);
    return `${shortRefName(base)} → ${shortRefName(head || 'HEAD')}`;
  }
  return `Changes since ${shortRefName(ref)}`;
}

function shortRefName(ref: string): string {
  const name = ref.replace(/^origin\//, '');
  return /^[0-9a-f]{8,40}$/i.test(name) ? name.slice(0, 7) : name;
}

export function commitRef(hash: string): string {
  return `${hash}~1..${hash}`;
}

export function parseGitHubRemote(url: string | null): GitHubRemote | null {
  if (!url) {
    return null;
  }
  const match = /github\.com[:/]([^/]+)\/([^/]+?)(?:\.git)?\/?$/.exec(url.trim());
  if (!match) {
    return null;
  }
  return { owner: match[1], repo: match[2] };
}

export async function fetchDiff(hideWhitespace: boolean, ref?: string): Promise<ParsedDiff> {
  const result = await tauri.getDiff(getRepoPath(), ref || 'work', hideWhitespace);
  const diff = parseDiff(result.patch);
  const summaries = new Map<string, DiffFileSummary>();
  for (const file of result.files) {
    summaries.set(file.path, file);
  }
  let totalAdditions = 0;
  let totalDeletions = 0;
  for (const file of diff.files) {
    const summary = summaries.get(file.newPath) ?? summaries.get(file.oldPath);
    if (summary?.patchOmitted) {
      file.patchOmitted = true;
      file.additions = summary.additions;
      file.deletions = summary.deletions;
    }
    totalAdditions += file.additions;
    totalDeletions += file.deletions;
    if (file.status === 'added' || file.isBinary) {
      continue;
    }
    const count = summary?.oldLineCount;
    if (count !== null && count !== undefined) {
      file.oldFileLineCount = count;
    }
  }
  diff.stats = { ...diff.stats, totalAdditions, totalDeletions };
  return diff;
}

/** The full hunks of a file `fetchDiff` received without them (`patchOmitted`), parsed on its own. */
export async function fetchFilePatch(file: DiffFile, hideWhitespace: boolean, ref?: string): Promise<DiffFile> {
  const path = file.status === 'deleted' ? file.oldPath : file.newPath;
  const oldPath = file.oldPath && file.oldPath !== path && file.oldPath !== '/dev/null' ? file.oldPath : null;
  const patch = await tauri.getFilePatch(getRepoPath(), ref || 'work', path, oldPath, hideWhitespace);
  const parsed = parseDiff(patch).files[0];
  if (!parsed) {
    return { ...file, patchOmitted: false };
  }
  return { ...parsed, oldFileLineCount: file.oldFileLineCount, patchOmitted: false };
}

export function fetchDiffFingerprint(ref?: string): Promise<string> {
  return tauri.diffFingerprint(getRepoPath(), ref || 'work');
}

export async function fetchRepoInfo(ref?: string): Promise<RepoInfo> {
  const repoPath = getRepoPath();
  const effectiveRef = ref || 'work';
  const [repo, resolved, session] = await Promise.all([
    tauri.openRepo(repoPath),
    tauri.resolveRef(repoPath, effectiveRef),
    tauri.getSession(repoPath, effectiveRef),
  ]);
  sessionRefs.set(session.id, effectiveRef);
  return {
    name: repo.name,
    branch: repo.branch ?? '',
    root: repo.path,
    description: descriptionForRef(effectiveRef),
    capabilities: { reviews: true, revert: resolved.canRevert, staleness: true },
    sessionId: session.id,
    github: parseGitHubRemote(repo.remoteUrl),
    editor: 'vscode',
  };
}

export async function openInEditor(filePath: string, line?: number): Promise<{ ok: boolean }> {
  await tauri.openInEditor(getRepoPath(), filePath, line ?? null);
  return { ok: true };
}

export async function fetchOverview(): Promise<Overview> {
  const files = await tauri.repoOverview(getRepoPath());
  return { files };
}

export async function fetchCommits(skip = 0, count = 10, search?: string): Promise<CommitsPage> {
  const commits = await tauri.listCommits(getRepoPath(), count, skip, search ?? null);
  return {
    commits: commits.map(toCommit),
    hasMore: commits.length === count,
  };
}

function toCommit(commit: tauri.CommitRecord): Commit {
  return {
    hash: commit.sha,
    shortHash: commit.shortSha,
    message: commit.subject,
    author: commit.author,
    date: commit.date,
    relativeDate: dayjs(commit.date).fromNow(),
    filesChanged: commit.filesChanged ?? 0,
    additions: commit.additions ?? 0,
    deletions: commit.deletions ?? 0,
  };
}

export async function fetchCommit(sha: string): Promise<Commit | null> {
  const commits = await tauri.listCommits(getRepoPath(), 20, 0, sha);
  const found = commits.find((commit) => commit.sha.startsWith(sha.toLowerCase()));
  return found ? toCommit(found) : null;
}

function toAuthor(comment: BackendComment): CommentAuthor {
  return { name: comment.authorName, type: comment.authorType };
}

function toComment(comment: BackendComment): Comment {
  return {
    id: comment.id,
    author: toAuthor(comment),
    body: comment.body,
    createdAt: comment.createdAt,
    pending: comment.pending,
    mentionsAgent: comment.mentionsAgent,
  };
}

export function toCommentThread(thread: Thread): CommentThread {
  return {
    id: thread.id,
    filePath: thread.filePath,
    side: thread.side,
    startLine: thread.startLine,
    endLine: thread.endLine,
    comments: thread.comments.map(toComment),
    status: thread.status,
    anchorContent: thread.anchorContent ?? undefined,
    updatedAt: thread.updatedAt,
    sessionId: thread.sessionId,
    pending: thread.pending,
    reviewId: thread.reviewId,
    githubThreadId: thread.githubThreadId,
  };
}

export async function fetchThreads(sessionId: string): Promise<CommentThread[]> {
  const threads = await tauri.listThreads(sessionId);
  return threads.map(toCommentThread);
}

export async function createThread(data: {
  sessionId: string;
  filePath: string;
  side: CommentSide;
  startLine: number;
  endLine: number;
  body: string;
  author: CommentAuthor;
  anchorContent?: string;
  options?: SubmitOptions;
}): Promise<CommentThread> {
  const thread = await tauri.createThread({
    sessionId: data.sessionId,
    filePath: data.filePath,
    side: data.side,
    startLine: data.startLine,
    endLine: data.endLine,
    body: data.body,
    anchorContent: data.anchorContent ?? null,
    authorType: data.author.type,
    authorName: data.author.name,
    pending: data.options?.pending ?? false,
  });
  return toCommentThread(thread);
}

export async function replyToThread(threadId: string, body: string, author: CommentAuthor, options?: SubmitOptions): Promise<CommentThread> {
  const thread = await tauri.addReply(threadId, body, author.type, author.name, options?.pending ?? false);
  return toCommentThread(thread);
}

export async function updateThreadStatus(threadId: string, status: CommentThread['status'], summary?: string): Promise<void> {
  await tauri.setThreadStatus(threadId, status, summary ?? null);
}

export function deleteAllThreads(sessionId: string): Promise<void> {
  return tauri.deleteAllThreads(sessionId);
}

export function deleteThread(threadId: string): Promise<void> {
  return tauri.deleteThread(threadId);
}

export function editComment(commentId: string, body: string): Promise<void> {
  return tauri.editComment(commentId, body);
}

export function deleteComment(commentId: string): Promise<void> {
  return tauri.deleteComment(commentId);
}

export function revertFile(filePath: string): Promise<void> {
  return tauri.revertFile(getRepoPath(), filePath);
}

export function revertHunk(patch: string): Promise<void> {
  return tauri.revertHunk(getRepoPath(), patch);
}

function splitLines(contents: string): string[] {
  return contents.split('\n');
}

export async function fetchFileContent(filePath: string, ref?: string): Promise<string[]> {
  const versions = await tauri.getFileVersions(getRepoPath(), ref || 'work', filePath, filePath);
  if (versions.oldContents === null) {
    throw new Error(`File not found: ${filePath}`);
  }
  return splitLines(versions.oldContents);
}

export async function fetchFileVersions(filePath: string, oldPath?: string, ref?: string): Promise<{ oldLines: string[] | null; newLines: string[] | null }> {
  const versions = await tauri.getFileVersions(getRepoPath(), ref || 'work', filePath, oldPath ?? null);
  return {
    oldLines: versions.oldContents === null ? null : splitLines(versions.oldContents),
    newLines: versions.newContents === null ? null : splitLines(versions.newContents),
  };
}

export interface PushCommentsResult {
  pushed: number;
  skipped: number;
  failed: number;
  errors: string[];
}

export interface PullCommentsResult {
  pulled: number;
  updated: number;
  skipped: number;
}

export function toGitHubDetails(pr: PullRequest): GitHubDetails {
  return {
    prNumber: pr.number,
    prTitle: pr.title,
    prUrl: pr.url,
    prCreatedAt: pr.createdAt,
    headSha: pr.headSha,
    commentCount: pr.reviewThreadCount,
    baseRef: pr.baseRef,
    headRef: pr.headRef,
    pr,
  };
}

export async function fetchGitHubDetails(): Promise<GitHubDetails | null> {
  const auth = await tauri.githubAuthStatus();
  if (!auth.authenticated) {
    return null;
  }
  const pr = await tauri.findPr(getRepoPath());
  return pr ? toGitHubDetails(pr) : null;
}

export async function fetchPushableThreads(prNumber: number): Promise<CommentThread[]> {
  const threads = await tauri.githubPushableThreads(getRepoPath(), prNumber);
  return threads.map(toCommentThread);
}

export function pushCommentsToGitHub(sessionId: string, prNumber: number, threadIds: string[]): Promise<PushCommentsResult> {
  return tauri.pushReview(getRepoPath(), sessionId, prNumber, 'COMMENT', null, threadIds);
}

export async function pullCommentsFromGitHub(sessionId: string, prNumber: number): Promise<PullCommentsResult> {
  return tauri.pullReview(getRepoPath(), sessionId, prNumber);
}

export interface TreeEntryResponse {
  type: 'blob' | 'tree';
  path: string;
  name: string;
}

let treeCache: { repoPath: string; entries: Promise<TreeEntry[]> } | null = null;

function loadTree(fresh: boolean): Promise<TreeEntry[]> {
  const repoPath = getRepoPath();
  if (!fresh && treeCache && treeCache.repoPath === repoPath) {
    return treeCache.entries;
  }
  const entries = tauri.listTree(repoPath);
  treeCache = { repoPath, entries };
  entries.catch(() => {
    treeCache = null;
  });
  return entries;
}

export async function fetchTreePaths(): Promise<{ paths: string[] }> {
  const entries = await loadTree(true);
  return { paths: entries.filter((entry) => entry.kind === 'file').map((entry) => entry.path) };
}

export async function fetchTreeEntries(dirPath?: string): Promise<{ entries: TreeEntryResponse[] }> {
  const entries = await loadTree(false);
  const prefix = dirPath ? `${dirPath}/` : '';
  const result: TreeEntryResponse[] = [];
  for (const entry of entries) {
    if (!entry.path.startsWith(prefix)) {
      continue;
    }
    const relative = entry.path.slice(prefix.length);
    if (!relative || relative.includes('/')) {
      continue;
    }
    result.push({ type: entry.kind === 'dir' ? 'tree' : 'blob', path: entry.path, name: relative });
  }
  return { entries: result };
}

export async function fetchTreeInfo(): Promise<RepoInfo> {
  const repoPath = getRepoPath();
  const [repo, session] = await Promise.all([tauri.openRepo(repoPath), tauri.getSession(repoPath, TREE_REF)]);
  sessionRefs.set(session.id, TREE_REF);
  return {
    name: repo.name,
    branch: repo.branch ?? '',
    root: repo.path,
    description: 'Repository file browser',
    capabilities: { reviews: true, revert: false, staleness: false },
    sessionId: session.id,
    github: parseGitHubRemote(repo.remoteUrl),
    editor: 'vscode',
  };
}

export async function fetchTreeFingerprint(): Promise<string> {
  const repoPath = getRepoPath();
  const [entries, fingerprint] = await Promise.all([
    tauri.listTree(repoPath),
    tauri.diffFingerprint(repoPath, 'work').catch(() => ''),
  ]);
  return `${entries.length}:${fingerprint}`;
}

export async function fetchTreeFileContent(filePath: string): Promise<string[]> {
  const file = await tauri.readFile(getRepoPath(), filePath);
  if (file.contents === null) {
    if (file.binary) {
      return ['(binary file)'];
    }
    return [`(file too large to display: ${file.size} bytes)`];
  }
  return splitLines(file.contents);
}

const MIME_TYPES: Record<string, string> = {
  svg: 'image/svg+xml',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  avif: 'image/avif',
  ico: 'image/x-icon',
  bmp: 'image/bmp',
};

export function mimeTypeFor(filePath: string): string {
  const ext = filePath.split('.').pop()?.toLowerCase() ?? '';
  return MIME_TYPES[ext] ?? 'application/octet-stream';
}

export async function fetchRawFileUrl(filePath: string): Promise<string> {
  const data = await tauri.readFileBase64(getRepoPath(), filePath);
  return `data:${mimeTypeFor(filePath)};base64,${data}`;
}
