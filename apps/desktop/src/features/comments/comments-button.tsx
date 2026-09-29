import { MessageSquare } from 'lucide-react';
import { useOpenThreadCount } from '../../hooks/use-repo-threads';
import { toggleComments, useUi } from '../../lib/ui-store';
import { cn } from '../../lib/cn';
import { buttonOutline } from '../../components/ui/button-styles';

export function CommentsButton() {
  const count = useOpenThreadCount();
  const open = useUi((state) => state.commentsOpen);

  return (
    <button
      onClick={toggleComments}
      className={cn(buttonOutline, 'px-2.5', open && 'bg-selected hover:bg-selected')}
      title={`All comments in this repository, across every view${count > 0 ? ` (${count} open)` : ''} — C`}
      aria-pressed={open}
    >
      <MessageSquare size={15} strokeWidth={1.75} className="text-text-secondary" />
      {count > 0 && <span className="text-[13px] tabular-nums text-text">{count}</span>}
    </button>
  );
}
