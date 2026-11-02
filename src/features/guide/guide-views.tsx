import { toast } from 'sonner';
import { errorMessage, openInEditor } from '../../lib/api';
import type { GuideImpact, GuideNote } from '../../lib/types';
import { useEditorName } from '../../hooks/use-editor-name';
import { MarkdownContent } from '../../components/layout/markdown-content';
import { AlertCircleIcon } from '../../components/ui/icon';
import { linkRefs, refLabel } from './guide-refs';
import { GuideRefLink } from './guide-ref-link';

/** The chapter's critical notes up front, so the reader knows what the risky spot is before hunting for it in the diff. */
export function CareCallout(props: { notes: GuideNote[] }) {
  const { notes } = props;
  const critical = notes.filter((note) => note.critical);

  if (critical.length === 0) {
    return null;
  }
  return (
    <section className="mt-4 rounded-lg border border-modified/40 bg-modified/10 px-3 py-2.5">
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

/** Code the diff does not touch that the chapter's change may break; a click opens it in the editor. */
export function ImpactList(props: { items: GuideImpact[] }) {
  const { items } = props;
  const editorName = useEditorName();

  if (items.length === 0) {
    return null;
  }
  return (
    <div className="mt-4">
      <div className="text-xs font-medium text-text-secondary">May break outside this diff</div>
      <ul className="mt-1.5 flex flex-col gap-2">
        {items.map((item, index) => (
          <li key={index} className="text-[13px] leading-5">
            <div className="flex items-center gap-2 min-w-0">
              <code className="font-mono text-[12px] font-medium text-text truncate">{item.site}</code>
              <button
                type="button"
                onClick={() => {
                  openInEditor(item.path, item.line).catch((error) => {
                    toast.error('Could not open the editor', { description: errorMessage(error) });
                  });
                }}
                title={`Open ${item.path}${item.line ? `:${item.line}` : ''} in ${editorName}`}
                className="px-1 py-0.5 rounded bg-bg-tertiary font-mono text-[11px] text-text-secondary hover:text-accent hover:underline underline-offset-2 cursor-pointer shrink-0"
              >
                {refLabel({ path: item.path, line: item.line, side: 'new' })}
              </button>
            </div>
            <div className="text-text-secondary select-text [&_p]:m-0">
              <MarkdownContent content={linkRefs(item.text)} />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
