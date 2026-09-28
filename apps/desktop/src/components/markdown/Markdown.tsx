import { isValidElement, useState, type ComponentProps, type ReactNode } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { openUrl } from '@tauri-apps/plugin-opener';
import { CheckIcon, CopyIcon } from '@/components/ui/icon';
import { cn } from '@/lib/cn';
import { Mermaid } from './Mermaid';

export interface MarkdownProps {
  children: string;
  className?: string;
  compact?: boolean;
}

function Code(props: ComponentProps<'code'>) {
  const { className, children, ...rest } = props;
  const language = /language-(\w+)/.exec(className ?? '')?.[1];
  if (language === 'mermaid') {
    return <Mermaid code={String(children).trim()} />;
  }
  return (
    <code className={className} {...rest}>
      {children}
    </code>
  );
}

function textOf(node: ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') {
    return String(node);
  }
  if (Array.isArray(node)) {
    return node.map(textOf).join('');
  }
  if (isValidElement<{ children?: ReactNode }>(node)) {
    return textOf(node.props.children);
  }
  return '';
}

function CopyButton(props: { text: string }) {
  const { text } = props;
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch {
      setCopied(false);
    }
  };
  return (
    <button
      type="button"
      aria-label="Copy code"
      onClick={() => void copy()}
      className="markdown-copy absolute top-1.5 right-1.5 inline-flex size-6 cursor-default items-center justify-center rounded-md border border-border bg-raised text-fg-muted opacity-0 transition-opacity hover:text-fg"
    >
      {copied ? <CheckIcon size={12} className="text-success" /> : <CopyIcon size={12} />}
    </button>
  );
}

function Pre(props: ComponentProps<'pre'>) {
  const { children, ...rest } = props;
  if (isValidElement<{ className?: string }>(children) && children.props.className?.includes('language-mermaid')) {
    return <>{children}</>;
  }
  return (
    <div className="markdown-pre relative">
      <pre {...rest}>{children}</pre>
      <CopyButton text={textOf(children).replace(/\n$/, '')} />
    </div>
  );
}

function Link(props: ComponentProps<'a'>) {
  const { href, children } = props;
  return (
    <a
      href={href}
      onClick={(event) => {
        event.preventDefault();
        if (!href) {
          return;
        }
        openUrl(href).catch(() => window.open(href, '_blank'));
      }}
    >
      {children}
    </a>
  );
}

const components = { code: Code, pre: Pre, a: Link };

export function Markdown(props: MarkdownProps) {
  const { children, className, compact } = props;
  return (
    <div className={cn('markdown selectable', compact && 'markdown-compact', className)}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {children}
      </ReactMarkdown>
    </div>
  );
}
