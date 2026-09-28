import { toast } from 'sonner';
import { Button } from '@/components/ui/Button';
import { IconButton } from '@/components/ui/IconButton';
import { ArrowDownIcon, ArrowUpIcon, CommentIcon, CopyIcon } from '@/components/ui/icon';
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
}

export function CommentNavBar(props: CommentNavBarProps) {
  const { label, files, additions, deletions, threads, navigable, onNavigate } = props;
  const activeThreadId = useCommentDraft((s) => s.activeThreadId);
  const index = navigable.findIndex((t) => t.id === activeThreadId);

  const step = (delta: number) => {
    if (navigable.length === 0) {
      return;
    }
    const next = index === -1 ? (delta > 0 ? 0 : navigable.length - 1) : (index + delta + navigable.length) % navigable.length;
    onNavigate(navigable[next]);
  };

  const copyPrompt = () => {
    const prompt = threadsAsPrompt(threads);
    if (!prompt) {
      toast.info('No unresolved comments to copy');
      return;
    }
    void navigator.clipboard.writeText(prompt).then(() => toast.success('Unresolved comments copied as a prompt'));
  };

  return (
    <div className="flex h-9 shrink-0 items-center gap-3 border-b border-border bg-canvas px-3 text-xs">
      <span className="truncate font-medium text-fg">{label}</span>
      <span className="text-fg-subtle">
        {files} {files === 1 ? 'file' : 'files'}
      </span>
      <DiffStat additions={additions} deletions={deletions} />
      <div className="ml-auto flex items-center gap-1">
        <span className="inline-flex items-center gap-1 text-fg-muted">
          <CommentIcon size={14} />
          {navigable.length} open
        </span>
        <IconButton size="sm" label="Previous comment" disabled={navigable.length === 0} onClick={() => step(-1)}>
          <ArrowUpIcon size={14} />
        </IconButton>
        <IconButton size="sm" label="Next comment" disabled={navigable.length === 0} onClick={() => step(1)}>
          <ArrowDownIcon size={14} />
        </IconButton>
        <Button size="sm" variant="ghost" onClick={copyPrompt} title="Copy unresolved comments as an agent prompt">
          <CopyIcon size={12} />
          Copy as prompt
        </Button>
      </div>
    </div>
  );
}
