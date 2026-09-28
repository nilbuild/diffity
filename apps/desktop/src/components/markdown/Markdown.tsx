import { isValidElement, type ComponentProps } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { openUrl } from '@tauri-apps/plugin-opener';
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

function Pre(props: ComponentProps<'pre'>) {
  const { children, ...rest } = props;
  if (isValidElement<{ className?: string }>(children) && children.props.className?.includes('language-mermaid')) {
    return <>{children}</>;
  }
  return <pre {...rest}>{children}</pre>;
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
