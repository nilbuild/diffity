import { buttonGhost, buttonPrimary } from '../ui/button-styles';
import { useState, useRef, useEffect } from 'react';
import type { Comment } from './types';
import { MarkdownContent } from '../layout/markdown-content';
import { ThreadBadge } from '../ui/thread-badge';
import { PencilIcon, TrashIcon } from '../ui/icon';

interface CommentBubbleProps {
  comment: Comment;
  onEdit: (body: string) => void;
  onDelete: () => void;
}

export function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHr = Math.floor(diffMin / 60);
  const diffDays = Math.floor(diffHr / 24);

  if (diffSec < 60) {
    return 'just now';
  }
  if (diffMin < 60) {
    return `${diffMin}m ago`;
  }
  if (diffHr < 24) {
    return `${diffHr}h ago`;
  }
  if (diffDays < 30) {
    return `${diffDays}d ago`;
  }
  return date.toLocaleDateString();
}

function AuthorAvatar(props: { name: string; avatarUrl?: string; type: 'user' | 'agent' | 'github' }) {
  const { name, avatarUrl, type } = props;

  if (avatarUrl) {
    return (
      <img src={avatarUrl} alt={name} className="w-5 h-5 rounded-full" />
    );
  }

  const tone = type === 'agent' ? 'bg-claude/12 text-claude' : 'bg-fill text-text-secondary';
  const initial = name.charAt(0).toUpperCase();

  return (
    <div className={`w-5 h-5 rounded-full ${tone} flex items-center justify-center text-[10px] font-semibold`}>
      {initial}
    </div>
  );
}

export function CommentBubble(props: CommentBubbleProps) {
  const { comment, onEdit, onDelete } = props;
  const [isEditing, setIsEditing] = useState(false);
  const [editBody, setEditBody] = useState(comment.body);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (isEditing && textareaRef.current) {
      textareaRef.current.focus();
      textareaRef.current.selectionStart = textareaRef.current.value.length;
    }
  }, [isEditing]);

  const handleSave = () => {
    const trimmed = editBody.trim();
    if (!trimmed || trimmed === comment.body) {
      setIsEditing(false);
      setEditBody(comment.body);
      return;
    }
    onEdit(trimmed);
    setIsEditing(false);
  };

  const handleCancel = () => {
    setIsEditing(false);
    setEditBody(comment.body);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleSave();
      return;
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      handleCancel();
    }
  };

  return (
    <div className="group border-t border-border-muted first:border-t-0">
      <div className="px-3 py-2.5">
        <div className="flex items-center gap-2 mb-1">
          <AuthorAvatar name={comment.author.name} avatarUrl={comment.author.avatarUrl} type={comment.author.type} />
          <span className="text-[13px] font-semibold text-text">{comment.author.name}</span>
          {comment.author.type === 'agent' && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-fill text-text-secondary font-medium">bot</span>
          )}
          <span className="text-xs text-text-muted">{formatRelativeTime(comment.createdAt)}</span>
          {comment.pending && <ThreadBadge variant="pending" />}
          {!isEditing && (
            <div className="ml-auto flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              <button
                onClick={() => setIsEditing(true)}
                className="w-6 h-6 inline-flex items-center justify-center rounded-md text-text-muted hover:text-text hover:bg-hover cursor-pointer"
                title="Edit comment"
              >
                <PencilIcon className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={onDelete}
                className="w-6 h-6 inline-flex items-center justify-center rounded-md text-text-muted hover:text-deleted hover:bg-hover cursor-pointer"
                title="Delete comment"
              >
                <TrashIcon className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>
        <div className="text-[13px] leading-5 text-text pl-7">
        {isEditing ? (
          <div>
            <textarea
              ref={textareaRef}
              value={editBody}
              onChange={(e) => setEditBody(e.target.value)}
              onKeyDown={handleKeyDown}
              rows={3}
              className="w-full px-3 py-2 text-[13px] bg-bg text-text resize-y outline-none rounded-md border border-border focus:border-focus min-h-[60px]"
            />
            <div className="flex items-center gap-2 mt-1.5">
              <div className="flex-1" />
              <button
                onClick={handleCancel}
                className={buttonGhost}
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={!editBody.trim()}
                className={buttonPrimary}
              >
                Save
              </button>
            </div>
          </div>
        ) : (
          <MarkdownContent content={comment.body} />
        )}
        </div>
      </div>
    </div>
  );
}
