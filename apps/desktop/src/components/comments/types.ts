export const GENERAL_THREAD_FILE_PATH = '__general__';

export interface CommentAuthor {
  name: string;
  avatarUrl?: string;
  type: 'user' | 'agent' | 'github';
}

export interface SubmitOptions {
  pending: boolean;
}

export interface Comment {
  id: string;
  author: CommentAuthor;
  body: string;
  createdAt: string;
  pending?: boolean;
  mentionsAgent?: boolean;
}

export type CommentSide = 'old' | 'new';

export type ThreadStatus = 'open' | 'resolved' | 'dismissed';

export interface CommentThread {
  id: string;
  filePath: string;
  side: CommentSide;
  startLine: number;
  endLine: number;
  comments: Comment[];
  status: ThreadStatus;
  anchorContent?: string;
  updatedAt?: string;
  sessionId?: string;
  pending?: boolean;
  reviewId?: string | null;
  githubThreadId?: string | null;
}

export const DEFAULT_AUTHOR: CommentAuthor = { name: 'You', type: 'user' };

export function isThreadResolved(thread: CommentThread): boolean {
  return thread.status === 'resolved' || thread.status === 'dismissed';
}

export interface LineSelection {
  filePath: string;
  side: CommentSide;
  startLine: number;
  endLine: number;
}

export interface LineRenderProps {
  isLineSelected?: (line: number, side: CommentSide) => boolean;
  onLineMouseDown?: (line: number, side: CommentSide) => void;
  onLineMouseEnter?: (line: number, side: CommentSide) => void;
  onCommentClick?: (line: number, side: CommentSide) => void;
  threads?: CommentThread[];
  pendingSelection?: LineSelection | null;
  currentAuthor?: CommentAuthor;
  onAddThread?: (filePath: string, side: CommentSide, startLine: number, endLine: number, body: string, author: CommentAuthor, options?: SubmitOptions) => void;
  onCancelPending?: () => void;
  filePath?: string;
  onReply?: (threadId: string, body: string, author: CommentAuthor, options?: SubmitOptions) => void;
  onResolve?: (threadId: string) => void;
  onUnresolve?: (threadId: string) => void;
  onEditComment?: (commentId: string, body: string) => void;
  onDeleteComment?: (threadId: string, commentId: string) => void;
  onDeleteThread?: (threadId: string) => void;
  getOriginalCode?: (side: CommentSide, startLine: number, endLine: number) => string;
}
