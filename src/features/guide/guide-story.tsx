import type { ReactNode } from 'react';
import { cn } from '../../lib/cn';
import { getFilePath } from '../../lib/diff-utils';
import { DiffStats } from '../../components/diff/diff-stats';
import { MarkdownContent } from '../../components/layout/markdown-content';
import { splitPath } from '../../components/ui/path-label';
import { buttonGhost, buttonOutline, buttonPrimary } from '../../components/ui/button-styles';
import { AlertCircleIcon, ArrowLeftIcon, CheckIcon, ChevronRightIcon } from '../../components/ui/icon';
import type { ReadingChapter } from './guide-model';
import { OVERVIEW_STEP, type GuideStep } from './use-guide';
import { GuideCallStack } from './guide-callstack';
import { linkRefs } from './guide-refs';

export function chapterViewed(chapter: ReadingChapter, reviewedFiles: Set<string>): number {
  return chapter.files.filter((file) => reviewedFiles.has(getFilePath(file))).length;
}

/** The open step and how to move from it: `go(1)` is the next chapter, `go(-1)` the previous one or the overview. */
export function stepNav(chapters: ReadingChapter[], step: GuideStep, onStep: (step: GuideStep) => void) {
  const index = chapters.findIndex((chapter) => chapter.key === step);
  const go = (offset: number) => {
    const next = index + offset;
    if (next < 0) {
      onStep(OVERVIEW_STEP);
      return;
    }
    if (next < chapters.length) {
      onStep(chapters[next].key);
    }
  };
  return { index, chapter: index >= 0 ? chapters[index] : null, go };
}

export function Eyebrow(props: { children: ReactNode }) {
  const { children } = props;

  return <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-text-muted tabular-nums">{children}</div>;
}

export function CriticalTag(props: { chapter: ReadingChapter }) {
  const { chapter } = props;
  const count = chapter.notes.filter((note) => note.critical).length;

  if (count === 0) {
    return null;
  }
  return (
    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-modified/15 text-modified" title="Spots the guide marks for extra care">
      <AlertCircleIcon size={10} />
      {count === 1 ? '1 spot needs care' : `${count} spots need care`}
    </span>
  );
}

export function AttentionTag(props: { attention: ReadingChapter['attention'] }) {
  const { attention } = props;

  if (attention === 'normal') {
    return null;
  }
  return (
    <span
      className={cn('px-1.5 py-0.5 rounded-full text-[10px] font-medium', attention === 'high' ? 'bg-claude/12 text-claude' : 'bg-fill text-text-secondary')}
      title={attention === 'high' ? 'The core of the change: read every line' : 'Tests, config or generated files: skim'}
    >
      {attention === 'high' ? 'Core' : 'Skim'}
    </span>
  );
}

export function Prose(props: { content: string; className?: string }) {
  const { content, className } = props;

  return (
    <div className={cn('text-[14px] leading-6 text-text select-text [&_p]:mb-2.5 [&_p:last-child]:mb-0', className)}>
      <MarkdownContent content={linkRefs(content)} />
    </div>
  );
}

interface ChapterStoryProps {
  chapter: ReadingChapter;
  chapters: ReadingChapter[];
  index: number;
  reviewedFiles: Set<string>;
  onStep: (step: GuideStep) => void;
  onReviewedChange: (path: string, reviewed: boolean) => void;
  onFileClick: (path: string) => void;
  /** In the sidebar: smaller type and one navigation button per row. */
  compact?: boolean;
}

/** One chapter told in words: what it does, what to check, its files, and the way on. */
export function ChapterStory(props: ChapterStoryProps) {
  const { chapter, chapters, index, reviewedFiles, onStep, onReviewedChange, onFileClick, compact = false } = props;
  const { go } = stepNav(chapters, chapter.key, onStep);
  const complete = chapterViewed(chapter, reviewedFiles) === chapter.files.length;
  const next = chapters[index + 1] ?? null;
  const numbered = chapters.filter((item) => !item.extra).length;

  const markViewed = () => {
    for (const file of chapter.files) {
      const path = getFilePath(file);
      if (!reviewedFiles.has(path)) {
        onReviewedChange(path, true);
      }
    }
    if (next) {
      go(1);
    }
  };

  return (
    <div>
      <Eyebrow>
        <span className="font-mono">{chapter.extra ? 'Not in the guide' : `${String(index + 1).padStart(2, '0')} / ${String(numbered).padStart(2, '0')}`}</span>
        {chapter.phase && <span className="text-text-secondary">{chapter.phase}</span>}
        <AttentionTag attention={chapter.attention} />
        <CriticalTag chapter={chapter} />
      </Eyebrow>
      <h1 className={cn('mt-1.5 font-semibold text-text', compact ? 'text-[15px] leading-[22px]' : 'text-xl leading-7')}>{chapter.title}</h1>
      {chapter.summary && <Prose content={chapter.summary} className={compact ? 'mt-2 text-[13px] leading-[21px]' : 'mt-3'} />}
      {chapter.points.length > 0 && <Bullets items={chapter.points} className="mt-3" />}
      {chapter.focus.length > 0 && (
        <div className="mt-4">
          <div className="text-xs font-medium text-text-secondary">While reading, check</div>
          <Bullets items={chapter.focus} className="mt-1.5" />
        </div>
      )}
      {chapter.callstack.length > 0 && <GuideCallStack key={chapter.key} rows={chapter.callstack} compact={compact} />}
      <ChapterFiles chapter={chapter} reviewedFiles={reviewedFiles} onFileClick={onFileClick} />
      <div className="mt-4">
        <ChapterNav
          index={index}
          complete={complete}
          next={next}
          onPrev={() => go(-1)}
          onNext={() => go(1)}
          onDone={() => onStep(OVERVIEW_STEP)}
          onMarkViewed={markViewed}
          stacked={compact}
        />
      </div>
    </div>
  );
}

function Bullets(props: { items: string[]; className?: string }) {
  const { items, className } = props;

  return (
    <ul className={cn('flex flex-col gap-1', className)}>
      {items.map((item) => (
        <li key={item} className="flex items-start gap-2 text-[13px] leading-5 text-text">
          <span className="mt-[7px] w-1 h-1 rounded-full bg-text-muted shrink-0" />
          <span className="select-text [&_p]:m-0"><MarkdownContent content={linkRefs(item)} /></span>
        </li>
      ))}
    </ul>
  );
}

/** The chapter's files with their viewed state; a click scrolls to the file and opens it. */
function ChapterFiles(props: { chapter: ReadingChapter; reviewedFiles: Set<string>; onFileClick: (path: string) => void }) {
  const { chapter, reviewedFiles, onFileClick } = props;

  return (
    <ul className="mt-4 flex flex-col gap-0.5">
      {chapter.files.map((file) => {
        const path = getFilePath(file);
        const { dir, name } = splitPath(path);
        const viewed = reviewedFiles.has(path);
        const critical = chapter.notes.some((note) => note.path === path && note.critical);
        return (
          <li key={path}>
            <button
              onClick={() => onFileClick(path)}
              title={path}
              className="flex items-center gap-2 w-full h-7 px-2 -mx-2 rounded-md text-left text-xs hover:bg-hover transition-colors cursor-pointer"
            >
              <span className={cn('truncate shrink-0 max-w-[60%]', viewed ? 'text-text-muted' : 'text-text')}>{name}</span>
              {critical && <span className="w-1.5 h-1.5 rounded-full bg-modified shrink-0" title="A spot here needs extra care" />}
              <span className="truncate text-text-muted min-w-0 flex-1">{dir.replace(/\/$/, '')}</span>
              <DiffStats additions={file.additions} deletions={file.deletions} className="text-[11px]" />
              {viewed ? <CheckIcon size={11} className="text-added shrink-0" /> : <span className="w-[11px] shrink-0" />}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

interface ChapterNavProps {
  index: number;
  complete: boolean;
  next: ReadingChapter | null;
  onPrev: () => void;
  onNext: () => void;
  onDone: () => void;
  onMarkViewed: () => void;
  /** In the sidebar: one button per row. */
  stacked?: boolean;
}

export function ChapterNav(props: ChapterNavProps) {
  const { index, complete, next, onPrev, onNext, onDone, onMarkViewed, stacked = false } = props;
  const forward = next ? (
    <button onClick={onNext} className={cn(complete ? buttonPrimary : buttonOutline, stacked && 'w-full justify-center')} title={`Next: ${next.title} (])`}>
      Next: <span className="max-w-[220px] truncate">{next.title}</span>
      <ChevronRightIcon size="xs" />
    </button>
  ) : complete ? (
    <button onClick={onDone} className={cn(buttonPrimary, stacked && 'w-full justify-center')}>
      <CheckIcon size="xs" />
      Done · back to overview
    </button>
  ) : null;
  const mark = !complete ? (
    <button onClick={onMarkViewed} className={cn(next ? buttonOutline : buttonPrimary, stacked && 'w-full justify-center')} title="Mark every file in this chapter as viewed">
      <CheckIcon size="xs" />
      {next ? 'Mark viewed and continue' : 'Mark viewed'}
    </button>
  ) : null;
  const back = (
    <button onClick={onPrev} className={cn(buttonGhost, stacked && 'self-start -ml-2')}>
      <ArrowLeftIcon size="xs" />
      {index === 0 ? 'Overview' : 'Previous'}
    </button>
  );
  if (stacked) {
    return (
      <div className="flex flex-col gap-1.5">
        {mark}
        {forward}
        {back}
      </div>
    );
  }
  return (
    <div className="flex items-center gap-2">
      {back}
      <span className="flex-1" />
      {mark}
      {forward}
    </div>
  );
}
