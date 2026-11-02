import { createContext, useContext } from 'react';
import { cn } from '../../lib/cn';
import type { GuideNote, Side } from '../../lib/types';
import { MarkdownContent } from '../../components/layout/markdown-content';
import { AlertCircleIcon, SparkleIcon } from '../../components/ui/icon';
import { linkRefs } from './guide-refs';
import { useGuideStepAt, type GuideFocusStep } from './guide-focus';

/** The open chapter's notes by file path; unset outside the guide, so the diff renders no notes. */
export const GuideNotesContext = createContext<Map<string, GuideNote[]> | null>(null);

export function notesByFile(notes: GuideNote[]): Map<string, GuideNote[]> {
  const map = new Map<string, GuideNote[]>();
  for (const note of notes) {
    map.set(note.path, [...(map.get(note.path) ?? []), note]);
  }
  return map;
}

export function GuideNoteCard(props: { note: GuideNote; className?: string }) {
  const { note, className } = props;

  return (
    <div
      className={cn(
        'flex items-start gap-2 max-w-[720px] px-3 py-2 rounded-lg border text-[13px] leading-5 font-sans select-text',
        note.critical ? 'border-modified/40 bg-modified/10' : 'border-border bg-bg-secondary',
        className,
      )}
    >
      {note.critical ? (
        <AlertCircleIcon size="sm" className="mt-0.5 text-modified shrink-0" title="Take extra care here" />
      ) : (
        <SparkleIcon size="sm" className="mt-0.5 text-claude shrink-0" />
      )}
      <div className="min-w-0 flex-1 text-text [&_p]:m-0">
        <MarkdownContent content={linkRefs(note.text)} />
      </div>
    </div>
  );
}

interface GuideLineNotesProps {
  filePath: string | undefined;
  side: Side;
  line: number;
  /** Columns the row spans: every column in the unified view, one side's in the split view. */
  colSpan: number;
  /** Split view: put the notes under their side and leave the other side empty. */
  splitSide?: Side;
}

/** Why the call-stack step the reader is on happens, pinned under its line. */
function GuideStepCard(props: { step: GuideFocusStep }) {
  const { step } = props;

  return (
    <div className="guide-step-card flex items-start gap-2.5 max-w-[720px] px-3 py-2 rounded-lg border border-claude/50 bg-claude/10 text-[13px] leading-5 font-sans select-text">
      <span className="mt-px shrink-0 px-1.5 rounded bg-claude text-white font-mono text-[11px] leading-[18px] tabular-nums">
        {step.index + 1}/{step.count}
      </span>
      <div className="min-w-0 flex-1 text-text [&_p]:m-0">
        <MarkdownContent content={linkRefs(step.why)} />
      </div>
    </div>
  );
}

/** The guide's notes on one line of the diff, and the call-stack step the reader is on, as a row under it. */
export function GuideLineNotes(props: GuideLineNotesProps) {
  const { filePath, side, line, colSpan, splitSide } = props;
  const byFile = useContext(GuideNotesContext);
  const step = useGuideStepAt(filePath, side, line);
  const notes = filePath ? byFile?.get(filePath)?.filter((note) => note.line === line && note.side === side) ?? [] : [];

  if (!step && notes.length === 0) {
    return null;
  }
  const cell = (
    <td colSpan={colSpan} className="px-4 py-1.5">
      <div className="flex flex-col gap-1.5">
        {step && <GuideStepCard step={step} />}
        {notes.map((note, index) => <GuideNoteCard key={index} note={note} />)}
      </div>
    </td>
  );
  if (!splitSide) {
    return <tr data-guide-note>{cell}</tr>;
  }
  return (
    <tr data-guide-note>
      {splitSide === 'new' && <td colSpan={colSpan} />}
      {cell}
      {splitSide === 'old' && <td colSpan={colSpan} />}
    </tr>
  );
}
