import ReactMarkdown from 'react-markdown';
import type { Components } from 'react-markdown';
import { cn } from '../../lib/cn';

const inline = (props: { children?: React.ReactNode }) => <>{props.children}</>;

const components: Components = {
  p: inline,
  ul: inline,
  ol: inline,
  li: (props) => <>{props.children} </>,
  h1: (props) => <strong className="font-semibold">{props.children} </strong>,
  h2: (props) => <strong className="font-semibold">{props.children} </strong>,
  h3: (props) => <strong className="font-semibold">{props.children} </strong>,
  h4: (props) => <strong className="font-semibold">{props.children} </strong>,
  blockquote: inline,
  pre: inline,
  a: inline,
  img: () => null,
  strong: (props) => <strong className="font-semibold">{props.children}</strong>,
  em: (props) => <em>{props.children}</em>,
  code: (props) => <code className="px-1 py-px rounded bg-fill font-mono text-[0.9em]">{props.children}</code>,
};

function tidy(text: string): string {
  let result = text.replace(/(^|\s)[-*]\s(?=\S)/g, '$1· ').replace(/(^|\s)#{1,6}\s/g, '$1');
  if ((result.match(/\*\*/g) ?? []).length % 2 === 1) {
    result = result.replace(/\*\*(?!.*\*\*)/, '');
  }
  if ((result.match(/`/g) ?? []).length % 2 === 1) {
    result = result.replace(/`(?!.*`)/, '');
  }
  return result;
}

/** Compact one-paragraph markdown for previews (lists, headings and blocks flattened inline). */
export function InlineMarkdown(props: { text: string; className?: string }) {
  const { text, className } = props;

  return (
    <p className={cn('break-words', className)}>
      <ReactMarkdown components={components}>{tidy(text)}</ReactMarkdown>
    </p>
  );
}
