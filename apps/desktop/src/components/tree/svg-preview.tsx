import { useMemo } from 'react';

interface SvgPreviewProps {
  content: string[];
}

export function SvgPreview(props: SvgPreviewProps) {
  const { content } = props;

  const dataUrl = useMemo(() => {
    const raw = content.join('\n');
    const encoded = encodeURIComponent(raw);
    return `data:image/svg+xml,${encoded}`;
  }, [content]);

  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <div className="flex items-center justify-center p-8 bg-bg min-h-[200px]">
        <img
          src={dataUrl}
          alt="SVG preview"
          className="max-w-full max-h-[600px]"
          style={{ background: 'repeating-conic-gradient(#80808020 0% 25%, transparent 0% 50%) 50% / 16px 16px' }}
        />
      </div>
    </div>
  );
}
