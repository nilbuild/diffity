import { useMemo, type ReactNode } from 'react';
import { toast } from 'sonner';
import { cn } from '../../lib/cn';
import { errorMessage, openInEditor } from '../../lib/api';
import type { GuideFieldChange, GuideImpact, GuideNote, GuideShape } from '../../lib/types';
import { useThemeStore } from '../../hooks/use-theme';
import { useEditorName } from '../../hooks/use-editor-name';
import { MermaidDiagram } from '../../components/mermaid-diagram';
import { MarkdownContent } from '../../components/layout/markdown-content';
import { AlertCircleIcon } from '../../components/ui/icon';
import { diagramWithStyles } from './guide-model';
import { linkRefs, refLabel, useGuideRefs } from './guide-refs';
import { GuideRefLink } from './guide-ref-link';

function Panel(props: { title: string; hint?: string; children: ReactNode; className?: string }) {
  const { title, hint, children, className } = props;

  return (
    <section className={cn('mt-4 rounded-lg border border-border bg-bg', className)}>
      <div className="flex items-center gap-2 px-3 h-8 border-b border-border-muted">
        <span className="text-xs font-medium text-text-secondary whitespace-nowrap">{title}</span>
        {hint && <span className="text-[11px] text-text-muted truncate">{hint}</span>}
      </div>
      {children}
    </section>
  );
}

/** The chapter's critical notes up front, so the reader knows what the risky spot is before hunting for it in the diff. */
export function CareCallout(props: { notes: GuideNote[] }) {
  const { notes } = props;
  const critical = notes.filter((note) => note.critical);

  if (critical.length === 0) {
    return null;
  }
  return (
    <section id="guide-needs-care" className="mt-4 rounded-lg border border-modified/40 bg-modified/10 px-3 py-2.5">
      <div className="flex items-center gap-1.5 text-xs font-semibold text-modified">
        <AlertCircleIcon size={12} />
        Needs care
      </div>
      <ul className="mt-1.5 flex flex-col gap-1.5">
        {critical.map((note, index) => (
          <li key={index} className="text-[13px] leading-5 text-text">
            <div className="select-text [&_p]:m-0">
              <MarkdownContent content={linkRefs(note.text)} />
            </div>
            <GuideRefLink guideRef={{ path: note.path, line: note.line, side: note.side }} className="inline-block mt-1 text-[11px]" />
          </li>
        ))}
      </ul>
    </section>
  );
}

/** A chapter's sequence or state diagram. */
export function ChapterDiagram(props: { title: string; hint: string; chart: string; compact?: boolean }) {
  const { title, hint, chart, compact = false } = props;
  const theme = useThemeStore((state) => state.theme);
  const styled = useMemo(() => diagramWithStyles(chart, theme), [chart, theme]);

  return (
    <Panel title={title} hint={compact ? undefined : hint}>
      <div className="px-3 pb-1">
        <MermaidDiagram chart={styled} frameClassName="max-h-[300px]" />
      </div>
    </Panel>
  );
}

const fieldMark: Record<GuideFieldChange, { sign: string; className: string }> = {
  added: { sign: '+', className: 'text-added' },
  removed: { sign: '−', className: 'text-deleted' },
  changed: { sign: '~', className: 'text-modified' },
  same: { sign: ' ', className: 'text-text-muted' },
};

/** Types, tables, payloads and configs the chapter changes, field by field with the type before and after. */
export function ShapeChanges(props: { shapes: GuideShape[]; compact?: boolean }) {
  const { shapes, compact = false } = props;

  if (shapes.length === 0) {
    return null;
  }
  return (
    <Panel title="What changes shape" hint={compact ? undefined : 'fields before → after'}>
      <div className="py-1 overflow-x-auto">
        {shapes.map((shape, index) => (
          <div key={index} className={cn(index > 0 && 'mt-1 pt-1 border-t border-border-muted')}>
            <div className="flex items-center gap-2 px-3 h-6 text-xs">
              <span className="font-mono font-semibold text-text">{shape.name}</span>
              {shape.path && <GuideRefLink guideRef={{ path: shape.path, line: shape.line, side: shape.side }} className="text-[10px]" />}
            </div>
            {shape.fields.map((field) => (
              <div key={field.name} className={cn('flex items-baseline min-w-max pr-3 font-mono whitespace-pre', compact ? 'text-[11px] leading-5' : 'text-xs leading-[22px]')}>
                <span className={cn('w-7 shrink-0 text-center', fieldMark[field.change].className)}>{fieldMark[field.change].sign}</span>
                <span className={cn(field.change === 'removed' ? 'text-text-muted line-through decoration-deleted/60' : 'text-text')}>{field.name}</span>
                <span className="text-text-muted">: </span>
                <FieldType field={field} />
              </div>
            ))}
          </div>
        ))}
      </div>
    </Panel>
  );
}

function FieldType(props: { field: GuideShape['fields'][number] }) {
  const { field } = props;

  if (field.change === 'changed' && field.before && field.after) {
    return (
      <>
        <span className="text-deleted/80 line-through decoration-deleted/60">{field.before}</span>
        <span className="mx-1.5 text-text-muted">→</span>
        <span className="text-added">{field.after}</span>
      </>
    );
  }
  if (field.change === 'removed') {
    return <span className="text-text-muted line-through decoration-deleted/60">{field.before ?? field.after}</span>;
  }
  return <span className={field.change === 'added' ? 'text-added' : 'text-text-secondary'}>{field.after ?? field.before}</span>;
}

/** Code that depends on the chapter's change; a site outside the diff opens in the editor. */
export function ImpactList(props: { items: GuideImpact[]; compact?: boolean }) {
  const { items, compact = false } = props;
  const refs = useGuideRefs();
  const editorName = useEditorName();

  if (items.length === 0) {
    return null;
  }
  const outside = items.filter((item) => !refs?.has(item.path)).length;
  return (
    <Panel title="Who's affected" hint={outside > 0 ? `${outside} outside this diff` : undefined}>
      <ul className="py-1">
        {items.map((item, index) => {
          const inDiff = !!refs?.has(item.path);
          return (
            <li key={index} className={cn('flex items-start px-3 py-1.5', compact ? 'flex-col gap-1' : 'gap-3')}>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="font-mono text-xs font-medium text-text truncate">{item.site}</span>
                  {!inDiff && <span className="px-1 rounded text-[10px] bg-fill text-text-muted whitespace-nowrap shrink-0">not in diff</span>}
                </div>
                <div className="mt-0.5 text-[12px] leading-[18px] text-text-secondary select-text [&_p]:m-0">
                  <MarkdownContent content={linkRefs(item.text)} />
                </div>
              </div>
              {inDiff ? (
                <GuideRefLink guideRef={{ path: item.path, line: item.line, side: 'new' }} className="mt-px text-[11px] shrink-0" />
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    openInEditor(item.path, item.line).catch((error) => {
                      toast.error('Could not open the editor', { description: errorMessage(error) });
                    });
                  }}
                  title={`Open ${item.path}${item.line ? `:${item.line}` : ''} in ${editorName}`}
                  className="mt-px px-1 py-0.5 rounded bg-bg-tertiary font-mono text-[11px] text-text-secondary hover:text-accent hover:underline underline-offset-2 cursor-pointer shrink-0"
                >
                  {refLabel({ path: item.path, line: item.line, side: 'new' })}
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}
