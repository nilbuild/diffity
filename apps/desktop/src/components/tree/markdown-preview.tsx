import { Fragment, useMemo, useCallback, type ReactElement } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import type { Components } from 'react-markdown';
import { useHighlighter } from '../../hooks/use-highlighter';
import { getTheme } from '../../hooks/use-theme';
import { MermaidDiagram } from '../mermaid-diagram';
import { RepoImage, REPO_FILE_PREFIX } from './repo-image';

interface MarkdownPreviewProps {
  content: string[];
  filePath?: string;
}

function resolveImageSrc(src: string | undefined, filePath: string | undefined): string | undefined {
  if (!src) {
    return src;
  }
  if (src.startsWith('http://') || src.startsWith('https://') || src.startsWith('data:')) {
    return src;
  }

  const dir = filePath ? filePath.split('/').slice(0, -1).join('/') : '';
  const raw = dir ? dir + '/' + src : src;
  const parts = raw.split('/').filter(Boolean);
  const resolved: string[] = [];
  for (const part of parts) {
    if (part === '..') {
      resolved.pop();
    } else if (part !== '.') {
      resolved.push(part);
    }
  }
  return `${REPO_FILE_PREFIX}${resolved.join('/')}`;
}

interface Frontmatter {
  entries: [string, string][];
  body: string;
}

function parseFrontmatter(raw: string): Frontmatter {
  if (!raw.startsWith('---')) {
    return { entries: [], body: raw };
  }

  const endIndex = raw.indexOf('\n---', 3);
  if (endIndex === -1) {
    return { entries: [], body: raw };
  }

  const fmBlock = raw.slice(4, endIndex);
  const body = raw.slice(endIndex + 4).replace(/^\n/, '');
  const entries: [string, string][] = [];

  for (const line of fmBlock.split('\n')) {
    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) {
      continue;
    }
    const key = line.slice(0, colonIdx).trim();
    const value = line.slice(colonIdx + 1).trim().replace(/^["']|["']$/g, '');
    if (key) {
      entries.push([key, value]);
    }
  }

  return { entries, body };
}

function FrontmatterTable(props: { entries: [string, string][] }) {
  const { entries } = props;
  return (
    <div className="gh-md-frontmatter">
      <table>
        <thead>
          <tr>
            {entries.map(([key]) => (
              <th key={key}>{key}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr>
            {entries.map(([key, value]) => (
              <td key={key}>{value}</td>
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  );
}

export function MarkdownPreview(props: MarkdownPreviewProps) {
  const { content, filePath } = props;
  const { highlight, ready } = useHighlighter();
  const raw = content.join('\n');

  const { entries: frontmatterEntries, body: markdown } = useMemo(() => parseFrontmatter(raw), [raw]);

  const resolveSrc = useCallback((src: string | undefined) => {
    return resolveImageSrc(src, filePath);
  }, [filePath]);

  const components = useMemo<Components>(() => ({
    pre({ children }) {
      const child = children as ReactElement<{ className?: string; children?: string }>;
      const childProps = child?.props;
      if (!childProps) {
        return <div className="gh-md-code-block"><pre>{children}</pre></div>;
      }

      const className = childProps.className || '';
      const match = /language-(\w+)/.exec(className);
      const lang = match ? match[1] : null;
      const codeString = String(childProps.children || '').replace(/\n$/, '');

      if (lang === 'mermaid') {
        return <MermaidDiagram chart={codeString} />;
      }

      let highlighted: { text: string; color?: string }[][] | null = null;
      if (ready && lang) {
        const result = highlight(codeString, `file.${lang}`, getTheme());
        if (result) {
          highlighted = result.map((line) => line.tokens);
        }
      }

      return (
        <div className="gh-md-code-block">
          <pre>
            <code>{highlighted ? (
              highlighted.map((tokens, lineIdx) => (
                <Fragment key={lineIdx}>
                  {lineIdx > 0 && '\n'}
                  {tokens.map((token, tokenIdx) => (
                    <span key={tokenIdx} style={token.color ? { color: token.color } : undefined}>
                      {token.text}
                    </span>
                  ))}
                </Fragment>
              ))
            ) : (
              codeString
            )}</code>
          </pre>
        </div>
      );
    },
    code({ children }) {
      return <code className="gh-md-inline-code">{children}</code>;
    },
    img({ src, alt, width, height }) {
      const resolved = resolveSrc(typeof src === 'string' ? src : undefined);
      if (resolved?.startsWith(REPO_FILE_PREFIX)) {
        return <RepoImage path={resolved.slice(REPO_FILE_PREFIX.length)} alt={alt || ''} width={width} height={height} />;
      }
      return <img src={resolved} alt={alt || ''} width={width} height={height} />;
    },
  }), [highlight, ready, resolveSrc]);

  return (
    <div className="border border-border rounded-lg overflow-hidden">
      {frontmatterEntries.length > 0 && (
        <FrontmatterTable entries={frontmatterEntries} />
      )}
      <div className="gh-md-body">
        <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]} components={components}>
          {markdown}
        </ReactMarkdown>
      </div>
    </div>
  );
}
