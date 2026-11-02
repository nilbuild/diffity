import { useEffect, useLayoutEffect, useMemo, useRef, type ReactNode } from 'react';
import { cn } from '../../lib/cn';
import { getFilePath } from '../../lib/diff-utils';
import type { Guide } from '../../lib/types';
import { useHighlighter } from '../../hooks/use-highlighter';
import { useThemeStore } from '../../hooks/use-theme';
import { FileBlock, type FileBlockProps } from '../../components/diff/file-block';
import type { SinceViewedInfo } from '../../components/diff/since-viewed';
import { DiffStats } from '../../components/diff/diff-stats';
import { GeneralComments } from '../../components/comments/general-comments';
import { buttonPrimary } from '../../components/ui/button-styles';
import { CheckIcon, ChevronRightIcon } from '../../components/ui/icon';
import { phaseGroups, type ReadingChapter } from './guide-model';
import { ChapterNav, ChapterStory, chapterViewed, AttentionTag, CriticalTag, Eyebrow, Prose, stepNav } from './guide-story';
import { useUi } from '../../lib/ui-store';
import { GuideNoteCard, GuideNotesContext, notesByFile } from './guide-notes';
import { OVERVIEW_STEP, type GuideStep } from './use-guide';
import { GuideDiagram } from './guide-diagram';

type SharedFileProps = Omit<FileBlockProps, 'file' | 'collapsed' | 'reviewed' | 'sinceViewed' | 'highlightCode' | 'highlighted' | 'onHighlightEnd'>;

export interface GuideReaderProps extends SharedFileProps {
  guide: Guide;
  chapters: ReadingChapter[];
  step: GuideStep;
  onStep: (step: GuideStep) => void;
  collapsedFiles: Set<string>;
  reviewedFiles: Set<string>;
  sinceViewedFiles: Map<string, SinceViewedInfo>;
  scrollRef?: React.RefCallback<HTMLElement>;
  /** Scrolls to a file of the open chapter and opens it. */
  onFileClick: (path: string) => void;
}

/** The guide's pages: the overview, then one chapter at a time with its files. */
export function GuideReader(props: GuideReaderProps) {
  const { guide, chapters, step, onStep, scrollRef, reviewedFiles } = props;
  const scroller = useRef<HTMLElement | null>(null);
  const { index, chapter, go } = stepNav(chapters, step, onStep);

  // Before paint, so a file or comment revealed in the new page is scrolled to after this.
  useLayoutEffect(() => {
    scroller.current?.scrollTo({ top: 0 });
  }, [step]);

  const goRef = useRef(go);
  goRef.current = go;
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey || (event.key !== '[' && event.key !== ']') || isTyping(event.target)) {
        return;
      }
      event.preventDefault();
      goRef.current(event.key === ']' ? 1 : -1);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const firstUnread = chapters.find((item) => chapterViewed(item, reviewedFiles) < item.files.length) ?? chapters[0];

  return (
    <main
      ref={(node) => {
        scroller.current = node;
        scrollRef?.(node);
      }}
      className="flex-1 overflow-y-auto pb-16"
    >
      {chapter ? (
        <ChapterPage {...props} chapter={chapter} index={index} />
      ) : (
        <OverviewPage
          guide={guide}
          chapters={chapters}
          reviewedFiles={reviewedFiles}
          onStep={onStep}
          start={firstUnread}
          generalComments={props.commentsEnabled ? <GeneralComments threads={props.threads} commentActions={props.commentActions} /> : null}
        />
      )}
    </main>
  );
}

function isTyping(target: EventTarget | null): boolean {
  const element = target as HTMLElement | null;
  return !!element && (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA' || element.tagName === 'SELECT' || element.isContentEditable);
}

interface OverviewPageProps {
  guide: Guide;
  chapters: ReadingChapter[];
  reviewedFiles: Set<string>;
  onStep: (step: GuideStep) => void;
  start: ReadingChapter | undefined;
  generalComments: ReactNode;
}

function OverviewPage(props: OverviewPageProps) {
  const { guide, chapters, reviewedFiles, onStep, start, generalComments } = props;
  const started = chapters.some((chapter) => chapterViewed(chapter, reviewedFiles) > 0);
  const groups = phaseGroups(chapters);

  return (
    <article className="max-w-[760px] mx-auto px-8 pt-8">
      <Eyebrow>Overview</Eyebrow>
      <h1 className="mt-1 text-xl font-semibold text-text">What this change does</h1>
      <Prose content={guide.summary} className="mt-3 text-[15px] leading-7" />

      {(guide.before || guide.after) && (
        <div className={cn('mt-6 grid gap-3', guide.before && guide.after && 'sm:grid-cols-2')}>
          {guide.before && <BeforeAfter label="Before" text={guide.before} />}
          {guide.after && <BeforeAfter label="After" text={guide.after} after />}
        </div>
      )}

      {guide.diagram && <GuideDiagram guide={guide} />}

      <section className="mt-8">
        <div className="flex items-baseline gap-2">
          <h2 className="text-[15px] font-semibold text-text">Read it in {chapters.length} chapter{chapters.length === 1 ? '' : 's'}</h2>
          <span className="text-xs text-text-muted">the core change first, what to skim last</span>
        </div>
        <div className={cn('mt-3 flex flex-col', groups.some((group) => group.phase) ? 'gap-5' : 'gap-2')}>
          {groups.map((group) => (
            <div key={group.chapters[0].key}>
              {group.phase && <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-text-muted">{group.phase}</h3>}
              <ol className="flex flex-col gap-2">
                {group.chapters.map((chapter) => {
                  const index = chapters.indexOf(chapter);
                  const viewed = chapterViewed(chapter, reviewedFiles);
                  const complete = viewed === chapter.files.length;
                  return (
                    <li key={chapter.key}>
                      <button
                        onClick={() => onStep(chapter.key)}
                        className="group flex items-start gap-3 w-full px-3.5 py-3 rounded-lg border border-border bg-bg text-left hover:bg-bg-secondary hover:border-control-border transition-colors cursor-pointer"
                      >
                        <span className={cn('mt-0.5 flex items-center justify-center w-6 h-6 rounded-full shrink-0 font-mono text-[11px] tabular-nums', complete ? 'bg-added/15 text-added' : 'bg-fill text-text-secondary')}>
                          {complete ? <CheckIcon size={11} /> : chapter.extra ? '+' : index + 1}
                        </span>
                        <span className="flex-1 min-w-0">
                          <span className="flex items-center gap-2">
                            <span className="text-[14px] font-medium text-text truncate">{chapter.title}</span>
                            <AttentionTag attention={chapter.attention} />
                            <CriticalTag chapter={chapter} />
                          </span>
                          <span className="mt-0.5 block text-[13px] leading-5 text-text-secondary line-clamp-2">{plainText(chapter.summary)}</span>
                        </span>
                        <span className="flex flex-col items-end gap-0.5 shrink-0 text-xs text-text-muted tabular-nums">
                          <DiffStats additions={chapter.additions} deletions={chapter.deletions} />
                          <span>{viewed > 0 && !complete ? `${viewed} of ${chapter.files.length}` : chapter.files.length} file{chapter.files.length === 1 ? '' : 's'}</span>
                        </span>
                        <ChevronRightIcon size="xs" className="mt-1.5 text-text-muted opacity-0 group-hover:opacity-100 shrink-0" />
                      </button>
                    </li>
                  );
                })}
              </ol>
            </div>
          ))}
        </div>
        {start && (
          <div className="mt-4 flex items-center gap-3">
            <button onClick={() => onStep(start.key)} className={buttonPrimary}>
              {started ? 'Continue' : 'Start reading'}
              <ChevronRightIcon size="xs" />
            </button>
            <span className="text-xs text-text-muted">
              <Key>]</Key> next chapter · <Key>[</Key> previous
            </span>
          </div>
        )}
      </section>

      {generalComments && <section className="mt-10">{generalComments}</section>}
    </article>
  );
}

function BeforeAfter(props: { label: string; text: string; after?: boolean }) {
  const { label, text, after = false } = props;

  return (
    <div className={cn('rounded-lg border px-3.5 py-3', after ? 'border-added/30 bg-diff-add-bg/40' : 'border-border bg-bg-secondary')}>
      <div className={cn('text-[11px] font-semibold uppercase tracking-wide', after ? 'text-added' : 'text-text-muted')}>{label}</div>
      <Prose content={text} className="mt-1 text-[13px] leading-5" />
    </div>
  );
}

function Key(props: { children: ReactNode }) {
  const { children } = props;

  return <kbd className="inline-flex items-center justify-center min-w-4 h-4 px-1 rounded border border-border font-sans text-[10px] text-text-secondary">{children}</kbd>;
}

/** The summary as one line of text for a preview: markdown marks dropped. */
function plainText(markdown: string): string {
  return markdown.replace(/`([^`]*)`/g, '$1').replace(/[*_~]+/g, '').replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/\s+/g, ' ').trim();
}

interface ChapterPageProps extends GuideReaderProps {
  chapter: ReadingChapter;
  index: number;
}

/** A chapter's files at full width. Its story is in the sidebar, or on top here while the sidebar is collapsed. */
function ChapterPage(props: ChapterPageProps) {
  const { chapter, chapters, index, onStep, onFileClick, collapsedFiles, reviewedFiles, sinceViewedFiles, onReviewedChange } = props;
  const theme = useThemeStore((state) => state.theme);
  const { tokenize, languageReady } = useHighlighter();
  const sidebarCollapsed = useUi((state) => state.sidebarCollapsed);
  const lineNotes = useMemo(() => notesByFile(chapter.notes.filter((note) => note.line !== undefined)), [chapter.notes]);
  const story = { chapter, chapters, index, reviewedFiles, onStep, onReviewedChange, onFileClick };

  return (
    <>
      {sidebarCollapsed && (
        <header className="max-w-[760px] mx-auto px-8 pt-8">
          <ChapterStory {...story} />
        </header>
      )}
      <GuideNotesContext.Provider value={lineNotes}>
        <div className="flex flex-col gap-4 px-5 pt-5">
          {chapter.files.map((file) => (
            <div key={getFilePath(file)} className="flex flex-col gap-1.5">
              {chapter.notes.filter((note) => note.path === getFilePath(file) && note.line === undefined).map((note, noteIndex) => (
                <GuideNoteCard key={noteIndex} note={note} />
              ))}
              <FileBlock
                file={file}
                viewMode={props.viewMode}
                onToggleCollapse={props.onToggleCollapse}
                onReviewedChange={onReviewedChange}
                baseRef={props.baseRef}
                canRevert={props.canRevert}
                onRevert={props.onRevert}
                threads={props.threads}
                commentsEnabled={props.commentsEnabled}
                commentActions={props.commentActions}
                onAddThread={props.onAddThread}
                pendingSelection={props.pendingSelection}
                onPendingSelectionChange={props.onPendingSelectionChange}
                hideWhitespace={props.hideWhitespace}
                collapsed={collapsedFiles.has(getFilePath(file))}
                reviewed={reviewedFiles.has(getFilePath(file))}
                sinceViewed={sinceViewedFiles.get(getFilePath(file)) ?? null}
                highlightCode={languageReady(getFilePath(file)) ? (code, state) => tokenize(code, getFilePath(file), theme, state) : undefined}
              />
            </div>
          ))}
        </div>
      </GuideNotesContext.Provider>
      {!sidebarCollapsed && <ChapterFooter {...story} />}
    </>
  );
}

/** Below the last file: the way on, so a reader who scrolled through does not have to look back up. */
function ChapterFooter(props: { chapter: ReadingChapter; chapters: ReadingChapter[]; index: number; reviewedFiles: Set<string>; onStep: (step: GuideStep) => void; onReviewedChange: (path: string, reviewed: boolean) => void }) {
  const { chapter, chapters, index, reviewedFiles, onStep, onReviewedChange } = props;
  const { go } = stepNav(chapters, chapter.key, onStep);
  const next = chapters[index + 1] ?? null;
  const complete = chapterViewed(chapter, reviewedFiles) === chapter.files.length;
  const markViewed = () => {
    for (const file of chapter.files) {
      if (!reviewedFiles.has(getFilePath(file))) {
        onReviewedChange(getFilePath(file), true);
      }
    }
    if (next) {
      go(1);
    }
  };

  return (
    <footer className="px-5 mt-6">
      <ChapterNav index={index} complete={complete} next={next} onPrev={() => go(-1)} onNext={() => go(1)} onDone={() => onStep(OVERVIEW_STEP)} onMarkViewed={markViewed} />
    </footer>
  );
}
