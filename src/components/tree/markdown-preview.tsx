import { memo, useMemo, useCallback, useLayoutEffect, useRef, useState, type ReactElement } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import type { Components } from 'react-markdown';
import { useHighlighter, type HighlightedCode } from '../../hooks/use-highlighter';
import { useThemeStore } from '../../hooks/use-theme';
import { MermaidDiagram } from '../mermaid-diagram';
import { RepoImage, REPO_FILE_PREFIX } from './repo-image';
import { tokensToHtml } from '../../lib/syntax-token';

interface MarkdownPreviewProps {
  content: string[];
  filePath?: string;
  /** No box and no inner padding: the page's own padding frames it (a folder's README). */
  bare?: boolean;
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

/** How far outside the visible area a code block gets highlighted, so it is colored before it scrolls in. */
const HIGHLIGHT_MARGIN_PX = 1500;

function scrollParent(element: HTMLElement): HTMLElement | null {
  for (let node = element.parentElement; node; node = node.parentElement) {
    if (/(auto|scroll)/.test(getComputedStyle(node).overflowY)) {
      return node;
    }
  }
  return null;
}

function isNear(element: HTMLElement, root: HTMLElement | null): boolean {
  const rect = element.getBoundingClientRect();
  const area = root ? root.getBoundingClientRect() : { top: 0, bottom: window.innerHeight };
  return rect.bottom > area.top - HIGHLIGHT_MARGIN_PX && rect.top < area.bottom + HIGHLIGHT_MARGIN_PX;
}

interface CodeBlockProps {
  code: string;
  lang: string | null;
  highlight: (code: string, filePath: string, theme: 'light' | 'dark') => HighlightedCode | null;
  theme: 'light' | 'dark';
}

/**
 * A fenced code block, plain until it comes near the visible area. A long preview holds tens of thousands of
 * highlighted spans; building them all at once froze the app for a second. Blocks already in view are highlighted
 * before the first paint, so they never show uncolored.
 */
function CodeBlock(props: CodeBlockProps) {
  const { code, lang, highlight, theme } = props;
  const ref = useRef<HTMLDivElement>(null);
  const [near, setNear] = useState(false);

  useLayoutEffect(() => {
    const element = ref.current;
    if (near || !lang || !element) {
      return;
    }
    const root = scrollParent(element);
    if (isNear(element, root)) {
      setNear(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setNear(true);
        }
      },
      { root, rootMargin: `${HIGHLIGHT_MARGIN_PX}px 0px` },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [near, lang]);

  const highlighted = near && lang ? highlight(code, `file.${lang}`, theme) : null;

  return (
    <div ref={ref} className="gh-md-code-block">
      <pre>
        {highlighted ? (
          <code
            style={{ color: highlighted.fg }}
            dangerouslySetInnerHTML={{ __html: highlighted.lines.map((line) => tokensToHtml(line.tokens)).join('\n') }}
          />
        ) : (
          <code>{code}</code>
        )}
      </pre>
    </div>
  );
}

export const MarkdownPreview = memo(function MarkdownPreview(props: MarkdownPreviewProps) {
  const { content, filePath, bare } = props;
  const { highlight } = useHighlighter();
  const theme = useThemeStore((state) => state.theme);
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

      return <CodeBlock code={codeString} lang={lang} highlight={highlight} theme={theme} />;
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
  }), [highlight, theme, resolveSrc]);

  return (
    <div className={bare ? undefined : 'border border-border rounded-md overflow-hidden'}>
      {frontmatterEntries.length > 0 && (
        <FrontmatterTable entries={frontmatterEntries} />
      )}
      <div className={bare ? 'gh-md-body !p-0' : 'gh-md-body'}>
        <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]} components={components}>
          {markdown}
        </ReactMarkdown>
      </div>
    </div>
  );
});
