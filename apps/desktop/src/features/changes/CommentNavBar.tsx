import { toast } from 'sonner';
import { Button } from '@/components/ui/Button';
import { CountBadge } from '@/components/ui/Badge';
import { IconButton } from '@/components/ui/IconButton';
import { ArrowDownIcon, ArrowUpIcon, CommentIcon, ConversationIcon, CopyIcon } from '@/components/ui/icon';
import { cn } from '@/lib/cn';
import type { Thread } from '@/lib/types';
import { useCommentDraft } from '@/features/comments/draft-store';
import { threadsAsPrompt } from '@/features/comments/thread-utils';
import { DiffStat } from './StatusBadge';

export interface CommentNavBarProps {
  label: string;
  files: number;
  additions: number;
  deletions: number;
  threads: Thread[];
  navigable: Thread[];
  onNavigate: (thread: Thread) => void;
  conversationCount: number;
  conversationOpen: boolean;
  onToggleConversation: () => void;
}

export function CommentNavBar(props: CommentNavBarProps) {
  const { label, files, additions, deletions, threads, navigable, onNavigate, conversationCount, conversationOpen, onToggleConversation } =
    props;
  const activeThreadId = useCommentDraft((s) => s.activeThreadId);
  const index = navigable.findIndex((t) => t.id === activeThreadId);
  const pending = threads.filter((t) => t.pending).length;

  const step = (delta: number) => {
    if (navigable.length === 0) {
      return;
    }
    const next = index === -1 ? (delta > 0 ? 0 : navigable.length - 1) : (index + delta + navigable.length) % navigable.length;
    onNavigate(navigable[next]);
  };

  const copyPrompt = () => {
    const prompt = threadsAsPrompt(threads.filter((t) => !t.pending));
    if (!prompt) {
      toast.info('No unresolved comments to copy');
      return;
    }
    void navigator.clipboard.writeText(prompt).then(() => toast.success('Unresolved comments copied as a prompt'));
  };

  return (
    <div className="flex h-9 shrink-0 items-center gap-2.5 border-b border-border bg-panel px-3 text-xs">
      <span className="truncate text-fg-muted" title={label}>
        {label}
      </span>
      <span className="inline-flex shrink-0 items-center overflow-hidden rounded-md bg-muted text-fg-subtle">
        <span className="px-2 py-0.5">
          {files} {files === 1 ? 'file' : 'files'} changed
        </span>
        <span className="px-2 py-0.5">
          <DiffStat additions={additions} deletions={deletions} />
        </span>
      </span>
      <div className="ml-auto flex shrink-0 items-center gap-1">
        <Button
          size="sm"
          variant="ghost"
          aria-pressed={conversationOpen}
          onClick={onToggleConversation}
          className={cn(conversationOpen && 'bg-accent/12 text-accent hover:bg-accent/15 hover:text-accent')}
          title={conversationOpen ? 'Hide conversation' : 'Show conversation'}
        >
          <ConversationIcon size={12} />
          Conversation
          {conversationCount > 0 && <CountBadge count={conversationCount} tone={conversationOpen ? 'accent' : 'neutral'} />}
        </Button>
        <div className="mx-1 h-4 w-px bg-border" />
        {pending > 0 && (
          <span className="rounded-sm border border-dashed border-warning/50 px-1.5 text-2xs leading-4 font-medium text-warning">
            {pending} pending
          </span>
        )}
        <span className="inline-flex items-center gap-1 px-1 text-fg-muted tabular-nums">
          <CommentIcon size={12} />
          {index === -1 ? navigable.length : `${index + 1}/${navigable.length}`} open
        </span>
        <IconButton size="sm" label="Previous comment" disabled={navigable.length === 0} onClick={() => step(-1)}>
          <ArrowUpIcon size={14} />
        </IconButton>
        <IconButton size="sm" label="Next comment" disabled={navigable.length === 0} onClick={() => step(1)}>
          <ArrowDownIcon size={14} />
        </IconButton>
        <div className="mx-1 h-4 w-px bg-border" />
        <Button size="sm" variant="ghost" onClick={copyPrompt} title="Copy unresolved comments as an agent prompt">
          <CopyIcon size={12} />
          Copy as prompt
        </Button>
      </div>
    </div>
  );
}
