import { toast } from 'sonner';
import { errorMessage, openInEditor } from '../../lib/api';
import type { GuideImpact, GuideNote } from '../../lib/types';
import { useEditorName } from '../../hooks/use-editor-name';
import { useRepoNav } from '../../hooks/use-repo';
import { MarkdownContent } from '../../components/layout/markdown-content';
import { AlertCircleIcon, EditorIcon } from '../../components/ui/icon';
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

/** Code the diff does not touch that the chapter's change may break. Its location opens in the Files tab, at the line;
 * the editor icon opens it in the editor instead. */
export function ImpactList(props: { items: GuideImpact[] }) {
  const { items } = props;
  const editorName = useEditorName();
  const nav = useRepoNav();

  if (items.length === 0) {
    return null;
  }
  return (
    <div className="mt-4">
      <div className="text-xs font-medium text-text-secondary">May break outside this diff</div>
      <ul className="mt-1.5 flex flex-col gap-2.5">
        {items.map((item, index) => {
          const where = `${item.path}${item.line ? `:${item.line}` : ''}`;
          return (
            <li key={index} className="text-[13px] leading-5">
              <code className="block font-mono text-[12px] font-medium text-text break-words">{item.site}</code>
              <div className="text-text-secondary select-text [&_p]:m-0">
                <MarkdownContent content={linkRefs(item.text)} />
              </div>
              <div className="mt-0.5 flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => nav.toTree(item.path, 'file', item.line)}
                  title={`Show ${where} in Files`}
                  className="min-w-0 truncate font-mono text-[11px] text-accent hover:underline underline-offset-2 cursor-pointer"
                >
                  {refLabel({ path: item.path, line: item.line, side: 'new' })}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    openInEditor(item.path, item.line).catch((error) => {
                      toast.error('Could not open the editor', { description: errorMessage(error) });
                    });
                  }}
                  title={`Open in ${editorName}`}
                  aria-label={`Open ${where} in ${editorName}`}
                  className="inline-flex size-5 shrink-0 items-center justify-center rounded text-text-muted hover:bg-hover hover:text-text cursor-pointer"
                >
                  <EditorIcon size={11} />
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
