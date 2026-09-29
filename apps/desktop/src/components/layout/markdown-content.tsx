import { useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { Components } from 'react-markdown';
import { useHighlighter } from '../../hooks/use-highlighter';
import { getTheme } from '../../hooks/use-theme';
import { MermaidDiagram } from '../mermaid-diagram';

interface MarkdownContentProps {
  content: string;
}

export function MarkdownContent(props: MarkdownContentProps) {
  const { content } = props;
  const { highlight, ready } = useHighlighter();

  const components = useMemo<Components>(() => ({
    p({ children }) {
      return <p className="mb-1.5 last:mb-0">{children}</p>;
    },
    strong({ children }) {
      return <strong className="font-semibold text-text">{children}</strong>;
    },
    em({ children }) {
      return <em>{children}</em>;
    },
    a({ href, children }) {
      return (
        <a href={href} className="text-accent hover:underline" target="_blank" rel="noopener noreferrer">
          {children}
        </a>
      );
    },
    ul({ children }) {
      return <ul className="list-disc pl-4 mb-1.5 last:mb-0">{children}</ul>;
    },
    ol({ children }) {
      return <ol className="list-decimal pl-4 mb-1.5 last:mb-0">{children}</ol>;
    },
    li({ children }) {
      return <li className="mb-0.5">{children}</li>;
    },
    blockquote({ children }) {
      return (
        <blockquote className="border-l-2 border-border pl-3 text-text-muted mb-1.5 last:mb-0">
          {children}
        </blockquote>
      );
    },
    pre({ children, node }: any) {
      const codeEl = node?.children?.find((c: any) => c.tagName === 'code');
      const isMermaid = codeEl?.properties?.className?.includes('language-mermaid');
      if (isMermaid) {
        return <>{children}</>;
      }
      return <div className="mb-1.5 last:mb-0">{children}</div>;
    },
    code({ className, children }) {
      const match = /language-(\w+)/.exec(className || '');
      const lang = match ? match[1] : null;
      const codeString = String(children).replace(/\n$/, '');

      if (lang === 'mermaid') {
        return <MermaidDiagram chart={codeString} />;
      }

      if (!lang) {
        return (
          <code className="px-1 py-0.5 rounded bg-bg-tertiary text-[0.9em] font-mono">
            {children}
          </code>
        );
      }

      let highlighted: { text: string; color?: string }[][] | null = null;
      if (ready && lang) {
        const result = highlight(codeString, `file.${lang}`, getTheme());
        if (result) {
          highlighted = result.map((line) => line.tokens);
        }
      }

      return (
        <div className="rounded-md border border-border overflow-hidden">
          <div className="bg-bg-secondary px-3 py-1 border-b border-border">
            <span className="text-[10px] text-text-muted font-mono">{lang}</span>
          </div>
          <pre className="px-3 py-2 overflow-x-auto bg-bg text-xs leading-5 font-mono">
            {highlighted ? (
              highlighted.map((tokens, lineIdx) => (
                <div key={lineIdx}>
                  {tokens.map((token, tokenIdx) => (
                    <span key={tokenIdx} style={token.color ? { color: token.color } : undefined}>
                      {token.text}
                    </span>
                  ))}
                </div>
              ))
            ) : (
              <code>{codeString}</code>
            )}
          </pre>
        </div>
      );
    },
    hr() {
      return <hr className="border-border my-2" />;
    },
    h1({ children }) {
      return <p className="font-semibold text-text mb-1">{children}</p>;
    },
    h2({ children }) {
      return <p className="font-semibold text-text mb-1">{children}</p>;
    },
    h3({ children }) {
      return <p className="font-semibold text-text mb-1">{children}</p>;
    },
    del({ children }) {
      return <del className="text-text-muted">{children}</del>;
    },
    table({ children }) {
      return (
        <table className="border-collapse border border-border text-xs my-1.5">
          {children}
        </table>
      );
    },
    th({ children }) {
      return (
        <th className="border border-border px-2 py-1 bg-bg-secondary text-left font-medium">
          {children}
        </th>
      );
    },
    td({ children }) {
      return (
        <td className="border border-border px-2 py-1">{children}</td>
      );
    },
  }), [highlight, ready]);

  return (
    <div className="markdown-body">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {content}
      </ReactMarkdown>
    </div>
  );
}
