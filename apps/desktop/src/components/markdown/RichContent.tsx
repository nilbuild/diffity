import { useMemo } from 'react';
import { Markdown } from './Markdown';
import { Mermaid } from './Mermaid';

export type PreviewKind = 'markdown' | 'svg' | 'mermaid';

export function previewKind(path: string): PreviewKind | null {
  const lower = path.toLowerCase();
  if (lower.endsWith('.md') || lower.endsWith('.markdown') || lower.endsWith('.mdx')) {
    return 'markdown';
  }
  if (lower.endsWith('.svg')) {
    return 'svg';
  }
  if (lower.endsWith('.mmd') || lower.endsWith('.mermaid')) {
    return 'mermaid';
  }
  return null;
}

export function RichContent(props: { path: string; contents: string }) {
  const { path, contents } = props;
  const kind = previewKind(path);
  const svgUrl = useMemo(() => {
    if (kind !== 'svg') {
      return null;
    }
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(contents)}`;
  }, [kind, contents]);

  if (kind === 'svg' && svgUrl) {
    return (
      <div className="checkerboard flex items-center justify-center rounded-md p-6">
        <img src={svgUrl} alt={path} className="max-h-[480px] max-w-full" />
      </div>
    );
  }
  if (kind === 'mermaid') {
    return <Mermaid code={contents} />;
  }
  return <Markdown>{contents}</Markdown>;
}
