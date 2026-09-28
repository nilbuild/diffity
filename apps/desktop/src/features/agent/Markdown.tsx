import { memo, useState, type ReactNode } from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { openUrl } from '@tauri-apps/plugin-opener';
import { cn } from '@/lib/cn';
import { IconCheck } from './icons';

function CodeBlock(props: { language: string | null; children: ReactNode; raw: string }) {
  const { language, children, raw } = props;
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(raw);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="group my-2 overflow-hidden rounded-md border border-border bg-bg-muted">
      <div className="flex items-center justify-between border-b border-border px-2 py-0.5 text-[10px] text-fg-subtle">
        <span className="font-mono">{language ?? 'text'}</span>
        <button type="button" onClick={copy} className="opacity-0 transition-opacity group-hover:opacity-100 hover:text-fg">
          {copied ? <IconCheck size={11} /> : 'Copy'}
        </button>
      </div>
      <pre className="selectable overflow-x-auto p-2.5 font-mono text-[12px] leading-[1.5]">{children}</pre>
    </div>
  );
}

function textOf(node: ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') {
    return String(node);
  }
  if (Array.isArray(node)) {
    return node.map(textOf).join('');
  }
  if (node && typeof node === 'object' && 'props' in node) {
    return textOf((node as { props: { children?: ReactNode } }).props.children);
  }
  return '';
}

const components: Components = {
  pre: (props) => {
    const child = Array.isArray(props.children) ? props.children[0] : props.children;
    const className =
      child && typeof child === 'object' && 'props' in child
        ? ((child as { props: { className?: string } }).props.className ?? '')
        : '';
    const match = /language-([\w+-]+)/.exec(className);
    return (
      <CodeBlock language={match ? match[1] : null} raw={textOf(props.children).replace(/\n$/, '')}>
        {props.children}
      </CodeBlock>
    );
  },
  code: (props) => {
    const isBlock: boolean =
      (typeof props.className === 'string' && props.className.startsWith('language-')) ||
      textOf(props.children).includes('\n');
    if (isBlock) {
      return <code className={props.className}>{props.children}</code>;
    }
    return (
      <code className="rounded bg-bg-muted px-1 py-px font-mono text-[0.92em] text-fg">{props.children}</code>
    );
  },
  a: (props) => (
    <a
      href={props.href}
      className="text-accent underline-offset-2 hover:underline"
      onClick={(event) => {
        event.preventDefault();
        if (!props.href) {
          return;
        }
        openUrl(props.href).catch(() => window.open(props.href, '_blank'));
      }}
    >
      {props.children}
    </a>
  ),
  table: (props) => (
    <div className="my-2 overflow-x-auto">
      <table className="w-full border-collapse text-xs">{props.children}</table>
    </div>
  ),
  th: (props) => <th className="border border-border bg-bg-muted px-2 py-1 text-left font-semibold">{props.children}</th>,
  td: (props) => <td className="border border-border px-2 py-1 align-top">{props.children}</td>,
  ul: (props) => <ul className="my-1.5 list-disc space-y-0.5 pl-5">{props.children}</ul>,
  ol: (props) => <ol className="my-1.5 list-decimal space-y-0.5 pl-5">{props.children}</ol>,
  p: (props) => <p className="my-1.5 leading-[1.55]">{props.children}</p>,
  h1: (props) => <h1 className="mt-3 mb-1.5 text-[15px] font-semibold">{props.children}</h1>,
  h2: (props) => <h2 className="mt-3 mb-1.5 text-[14px] font-semibold">{props.children}</h2>,
  h3: (props) => <h3 className="mt-2.5 mb-1 text-[13px] font-semibold">{props.children}</h3>,
  blockquote: (props) => (
    <blockquote className="my-2 border-l-2 border-border-strong pl-3 text-fg-muted">{props.children}</blockquote>
  ),
  hr: () => <hr className="my-3 border-border" />,
  input: (props) => <input type="checkbox" checked={props.checked} readOnly className="mr-1.5 align-middle" />,
};

export const Markdown = memo(function Markdown(props: { children: string; className?: string }) {
  return (
    <div className={cn('selectable min-w-0 text-[13px] break-words [&>*:first-child]:mt-0 [&>*:last-child]:mb-0', props.className)}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {props.children}
      </ReactMarkdown>
    </div>
  );
});
