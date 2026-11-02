import { Fragment } from 'react';
import { cn } from '../../lib/cn';
import type { Guide } from '../../lib/types';
import { SidebarFrame } from '../../components/layout/sidebar-frame';
import { MenuItem, Popover, useMenu } from '../../components/ui/popover';
import { formatRelativeTime } from '../../components/comments/comment-bubble';
import { CheckIcon, EllipsisVerticalIcon, RefreshIcon, TrashIcon } from '../../components/ui/icon';
import type { ReadingChapter } from './guide-model';
import { ChapterStory, chapterViewed, stepNav } from './guide-story';
import { OVERVIEW_STEP, type GuideStep } from './use-guide';

interface GuideSidebarProps {
  guide: Guide;
  chapters: ReadingChapter[];
  step: GuideStep;
  onStep: (step: GuideStep) => void;
  reviewedFiles: Set<string>;
  onReviewedChange: (path: string, reviewed: boolean) => void;
  /** Scrolls to a file of the open chapter and opens it. */
  onFileClick: (path: string) => void;
  /** Unset while a guide run is already queued or going. */
  onRewrite: (() => void) | null;
  onDelete: () => void;
}

const stepButton = 'relative inline-flex items-center justify-center h-6 min-w-6 px-1.5 rounded-md font-mono text-[11px] tabular-nums transition-colors cursor-pointer';

/** The sidebar while reading the guide: the steps as small buttons on top, and the open step's story below. */
export function GuideSidebar(props: GuideSidebarProps) {
  const { guide, chapters, step, onStep, reviewedFiles, onReviewedChange, onFileClick, onRewrite, onDelete } = props;
  const { index, chapter } = stepNav(chapters, step, onStep);
  const menu = useMenu();
  let number = 0;

  return (
    <SidebarFrame view="guide">
      <div className="flex items-start gap-1 px-3 pb-2.5 shrink-0">
        <nav className="flex flex-wrap gap-1 flex-1 min-w-0" aria-label="Guide steps">
          <button
            onClick={() => onStep(OVERVIEW_STEP)}
            aria-current={!chapter ? 'step' : undefined}
            title="Overview"
            aria-label="Overview"
            className={cn(stepButton, !chapter ? 'bg-active text-text' : 'text-text-secondary hover:text-text hover:bg-hover')}
          >
            0
          </button>
          {chapters.map((item, itemIndex) => {
            const newPhase = itemIndex > 0 && !!item.phase && item.phase !== chapters[itemIndex - 1].phase;
            const label = item.extra ? '+' : String(++number);
            const complete = chapterViewed(item, reviewedFiles) === item.files.length;
            const active = item.key === step;
            const critical = item.notes.some((note) => note.critical);
            const hint = [item.extra ? item.title : `${number}. ${item.title}`, item.phase ?? null, critical ? 'needs extra care in places' : null, complete ? 'viewed' : null].filter(Boolean).join(' · ');
            return (
              <Fragment key={item.key}>
                {newPhase && <span className="w-px h-4 mx-0.5 self-center bg-border" aria-hidden />}
                <button
                  onClick={() => onStep(item.key)}
                  aria-current={active ? 'step' : undefined}
                  title={hint}
                  aria-label={hint}
                  className={cn(
                    stepButton,
                    active ? 'bg-active text-text' : complete ? 'text-added hover:bg-hover' : item.attention === 'low' ? 'text-text-muted hover:text-text hover:bg-hover' : 'text-text-secondary hover:text-text hover:bg-hover',
                  )}
                >
                  {label}
                  {critical && <span className="absolute top-0.5 right-0.5 w-1 h-1 rounded-full bg-modified" />}
                </button>
              </Fragment>
            );
          })}
        </nav>
        <button
          ref={menu.anchorRef}
          onClick={menu.toggle}
          aria-label="Guide options"
          aria-expanded={menu.open}
          title="Guide options"
          className={cn('inline-flex items-center justify-center w-6 h-6 rounded-md text-text-muted hover:text-text hover:bg-hover cursor-pointer shrink-0', menu.open && 'bg-hover text-text')}
        >
          <EllipsisVerticalIcon size="sm" />
        </button>
        <Popover open={menu.open} onClose={menu.close} anchorRef={menu.anchorRef} align="end" width={230}>
          <div className="px-2.5 pt-1.5 pb-1 text-[11px] text-text-muted">Written by {guide.agentName} · {formatRelativeTime(guide.createdAt)}</div>
          <MenuItem
            icon={<RefreshIcon size="sm" />}
            label="Write a new guide"
            disabled={!onRewrite}
            onSelect={() => {
              menu.close();
              onRewrite?.();
            }}
          />
          <MenuItem
            icon={<TrashIcon size="sm" />}
            label="Delete the guide"
            onSelect={() => {
              menu.close();
              onDelete();
            }}
          />
        </Popover>
      </div>
      <div className="h-px mx-3 bg-border-muted shrink-0" />
      <div className="flex-1 min-h-0 overflow-y-auto px-4 pt-4 pb-6">
        {chapter ? (
          <ChapterStory
            chapter={chapter}
            chapters={chapters}
            index={index}
            reviewedFiles={reviewedFiles}
            onStep={onStep}
            onReviewedChange={onReviewedChange}
            onFileClick={onFileClick}
            compact
          />
        ) : (
          <ChapterList chapters={chapters} reviewedFiles={reviewedFiles} onStep={onStep} />
        )}
      </div>
    </SidebarFrame>
  );
}

/** On the overview: every chapter by title, to jump in anywhere. */
function ChapterList(props: { chapters: ReadingChapter[]; reviewedFiles: Set<string>; onStep: (step: GuideStep) => void }) {
  const { chapters, reviewedFiles, onStep } = props;
  let number = 0;

  return (
    <div>
      <div className="text-xs text-text-muted">{chapters.length} chapter{chapters.length === 1 ? '' : 's'}, the core change first</div>
      <ol className="mt-2 -mx-2 flex flex-col gap-0.5">
        {chapters.map((chapter) => {
          const label = chapter.extra ? '+' : String(++number).padStart(2, '0');
          const complete = chapterViewed(chapter, reviewedFiles) === chapter.files.length;
          const critical = chapter.notes.some((note) => note.critical);
          return (
            <li key={chapter.key}>
              <button
                onClick={() => onStep(chapter.key)}
                className="flex items-start gap-2.5 w-full px-2 py-1.5 rounded-md text-left hover:bg-hover transition-colors cursor-pointer"
              >
                <span className="w-5 pt-px shrink-0 font-mono text-[11px] text-text-muted tabular-nums">
                  {complete ? <CheckIcon size={11} className="mt-0.5 text-added" /> : label}
                </span>
                <span className={cn('flex-1 min-w-0 text-[13px] leading-5 line-clamp-2', complete || chapter.attention === 'low' ? 'text-text-secondary' : 'text-text')}>
                  {chapter.title}
                </span>
                {critical && <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-modified shrink-0" title="Has spots that need extra care" />}
              </button>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/** The Guide tab's sidebar before a guide exists, so the tab never shows the diff's file tree. */
export function GuideSidebarEmpty(props: { writing: boolean }) {
  const { writing } = props;

  return (
    <SidebarFrame view="guide">
      <div className="px-4 pt-2 text-xs leading-5 text-text-muted">
        {writing ? 'The chapters will show here when the guide is written.' : 'No guide yet. Once one is written, its chapters show here.'}
      </div>
    </SidebarFrame>
  );
}
