import { useState } from 'react';
import { openUrl } from '@tauri-apps/plugin-opener';
import { toast } from 'sonner';
import { cn } from '../../lib/cn';
import { clickModKey } from '../../lib/platform';
import * as tauri from '../../lib/tauri';
import { CommentIcon, CopyIcon, ExternalLinkIcon, GitHubIcon, GitPullRequestIcon } from '../../components/ui/icon';
import { ContextMenu, MenuItem, MenuSeparator } from '../../components/ui/popover';
import { ChecksStatus, PrStateIcon } from '../pr/pr-meta';
import { reviewLabel, shortAgo, type InboxItem } from './inbox';

const TONES = {
  requested: 'bg-modified/12 text-modified',
  changes: 'bg-deleted/10 text-deleted',
  approved: 'bg-added/10 text-added',
  draft: 'bg-fill text-text-muted',
};

interface InboxRowProps {
  item: InboxItem;
  localPath?: string;
  active?: boolean;
  onOpen: (newWindow: boolean) => void;
  onHover?: () => void;
}

export function InboxRow(props: InboxRowProps) {
  const { item, localPath, active = false, onOpen, onHover } = props;
  const { pr } = item;
  const review = reviewLabel(pr);
  const comments = pr.commentCount + pr.reviewThreadCount;
  const folder = localPath?.split('/').pop();
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const run = (action: () => void) => () => {
    setMenu(null);
    action();
  };

  return (
    <>
      <button
        data-active={active || menu !== null}
        onMouseMove={onHover}
        onClick={(event) => onOpen(event.metaKey || event.ctrlKey)}
        onContextMenu={(event) => {
          event.preventDefault();
          onHover?.();
          setMenu({ x: event.clientX, y: event.clientY });
        }}
        tabIndex={-1}
        title={`${pr.title}\n${pr.repo}#${pr.number} · ${pr.headRef} → ${pr.baseRef}${localPath ? `\nOpens in ${localPath}` : ''}`}
        className={cn('flex items-start gap-2.5 w-full px-2.5 py-1.5 rounded-md text-left cursor-pointer outline-none', active || menu ? 'bg-selected' : 'hover:bg-hover')}
      >
        <span className="flex w-4 justify-center shrink-0 pt-[3px]">
          <PrStateIcon pr={pr} className="w-3.5 h-3.5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] leading-5 text-text">{pr.title}</span>
          <span className="flex items-center gap-2 min-w-0 text-[11px] leading-4 text-text-muted">
            <span className="shrink-0 font-mono text-text-secondary">{pr.repo}#{pr.number}</span>
            <span className="truncate">{pr.author}</span>
            {review && <span className={cn('shrink-0 px-1.5 rounded-full font-medium', TONES[review.tone])}>{review.label}</span>}
            {folder && <span className="shrink-0 px-1.5 rounded-full bg-fill font-mono text-[10.5px] text-text-secondary">{folder}</span>}
          </span>
        </span>
        <span className="flex items-center gap-2.5 shrink-0 pt-0.5 text-[11px] text-text-muted tabular-nums">
          {pr.checks && (
            <span className="inline-flex items-center gap-1">
              <ChecksStatus checks={pr.checks} />
              {pr.checkCount > 0 && pr.checks === 'SUCCESS' && <span className="text-added">{pr.checkCount}</span>}
            </span>
          )}
          {comments > 0 && (
            <span className="inline-flex items-center gap-1" title={`${comments} comment${comments === 1 ? '' : 's'}`}>
              <CommentIcon className="w-3 h-3" />
              {comments}
            </span>
          )}
          <span className="min-w-7 text-right whitespace-nowrap">{shortAgo(pr.updatedAt)}</span>
        </span>
      </button>
      <ContextMenu position={menu} onClose={() => setMenu(null)} width={260} className="z-[90]">
        <MenuItem icon={<GitPullRequestIcon size="sm" />} label={folder ? `Open in ${folder}` : 'Open'} onSelect={run(() => onOpen(false))} />
        <MenuItem icon={<ExternalLinkIcon size="sm" />} label="Open in new window" hint={`${clickModKey}-click`} onSelect={run(() => onOpen(true))} />
        <MenuSeparator />
        <MenuItem
          icon={<GitHubIcon size="sm" />}
          label="Open on GitHub"
          onSelect={run(() => {
            openUrl(pr.url).catch((error) => toast.error('Could not open GitHub', { description: tauri.errorMessage(error) }));
          })}
        />
        <MenuItem
          icon={<CopyIcon size="sm" />}
          label="Copy link"
          onSelect={run(() => {
            void navigator.clipboard.writeText(pr.url).then(() => toast.success('Link copied'));
          })}
        />
      </ContextMenu>
    </>
  );
}
