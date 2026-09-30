import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '../../lib/cn';
import type { PullRequest } from '../../lib/types';
import { useRepoNav } from '../../hooks/use-repo';
import { buttonGroup, buttonGroupDivider } from '../../components/ui/button-styles';
import { ChevronDownIcon, XIcon } from '../../components/ui/icon';
import { PrStateIcon, headLabel } from './pr-meta';
import { checksLabel, checksTone, openPrDetails, stateLabel, useLastSynced, usePrBack, useReviewRole } from './pr-session';

const HOVER_DELAY = 450;

function HoverCard(props: { pr: PullRequest; anchor: HTMLElement }) {
  const { pr, anchor } = props;
  const role = useReviewRole(pr);
  const { when: syncedWhen } = useLastSynced(pr);
  const checks = checksLabel(pr.checks);
  const rect = anchor.getBoundingClientRect();

  return createPortal(
    <div
      role="tooltip"
      className="pointer-events-none fixed z-[60] w-[360px] max-w-[calc(100vw-16px)] px-3 py-2.5 rounded-lg bg-overlay border border-overlay-border font-sans animate-fade-in"
      style={{ top: rect.bottom + 6, left: Math.max(8, Math.min(rect.left, window.innerWidth - 368)) }}
    >
      <div className="text-[13px] leading-5 font-medium text-text line-clamp-2">{pr.title}</div>
      <div className="mt-1 flex items-center gap-1.5 text-xs text-text-secondary">
        <PrStateIcon pr={pr} className="h-3 w-3" />
        <span>{stateLabel(pr)} · #{pr.number}</span>
        {role && <span className="min-w-0 truncate text-text-muted">· {role}</span>}
      </div>
      <div className="mt-1 truncate font-mono text-[11px] text-text-secondary">{pr.baseRef} ← {headLabel(pr)}</div>
      <div className="mt-1.5 flex items-center gap-1.5 text-xs text-text-secondary">
        <span className={cn('size-1.5 shrink-0 rounded-full', checks ? checksTone(pr.checks) : 'bg-text-muted')} />
        <span>{checks ?? 'No checks reported'}</span>
      </div>
      <div className="mt-0.5 text-xs text-text-muted">{syncedWhen ? `Comments synced ${syncedWhen}` : 'Comments not synced yet'}</div>
      <div className="mt-2 pt-1.5 border-t border-overlay-border text-[11px] text-text-muted">Click for details, description and actions</div>
    </div>,
    document.body,
  );
}

interface PrRefChipProps {
  pr: PullRequest;
  pickerOpen: boolean;
  onTogglePicker: () => void;
}

/** The ref chip for a pull request: label opens the PR details, the chevron the ref picker, × leaves the PR. */
export function PrRefChip(props: PrRefChipProps) {
  const { pr, pickerOpen, onTogglePicker } = props;
  const nav = useRepoNav();
  const back = usePrBack(pr);
  const labelRef = useRef<HTMLButtonElement>(null);
  const [hovered, setHovered] = useState(false);
  const [showCard, setShowCard] = useState(false);
  const checks = checksLabel(pr.checks);

  useEffect(() => {
    if (!hovered || pickerOpen) {
      setShowCard(false);
      return;
    }
    const timer = setTimeout(() => setShowCard(true), HOVER_DELAY);
    return () => clearTimeout(timer);
  }, [hovered, pickerOpen]);

  const leave = () => {
    if (back) {
      back.onBack();
      return;
    }
    nav.toDiff('work');
  };
  const leaveTitle = back ? back.title.replace(/^Check out/, 'Back to') : 'Back to uncommitted changes';

  return (
    <div className={cn(buttonGroup, 'min-w-0 max-w-[460px]')}>
      <button
        ref={labelRef}
        onClick={() => {
          setHovered(false);
          openPrDetails();
        }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        className="flex items-center gap-1.5 min-w-0 pl-2.5 pr-2 text-[13px] text-text hover:bg-control-hover transition-colors cursor-pointer"
        aria-label={`Pull request #${pr.number} details`}
      >
        <PrStateIcon pr={pr} className="w-3.5 h-3.5" />
        <span className="truncate font-medium">PR #{pr.number} · {pr.title}</span>
        {checks && <span aria-label={checks} className={cn('shrink-0 size-1.5 rounded-full', checksTone(pr.checks))} />}
      </button>
      <span className={buttonGroupDivider} />
      <button
        onClick={onTogglePicker}
        className={cn('flex items-center justify-center w-6 shrink-0 text-text-secondary hover:text-text hover:bg-control-hover transition-colors cursor-pointer', pickerOpen && 'bg-control-hover text-text')}
        title="Choose what to review"
        aria-label="Choose what to review"
        aria-haspopup="dialog"
        aria-expanded={pickerOpen}
      >
        <ChevronDownIcon size="xs" />
      </button>
      <button
        onClick={leave}
        disabled={back?.disabled}
        className="flex items-center justify-center w-6 shrink-0 pr-0.5 text-text-muted hover:text-text hover:bg-control-hover transition-colors cursor-pointer disabled:opacity-45"
        title={leaveTitle}
        aria-label={leaveTitle}
      >
        <XIcon size={10} />
      </button>
      {showCard && labelRef.current && <HoverCard pr={pr} anchor={labelRef.current} />}
    </div>
  );
}
