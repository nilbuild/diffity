import { useEffect, useId, useState } from 'react';
import { useResolvedTheme } from '@/lib/theme';

export function Mermaid(props: { code: string }) {
  const { code } = props;
  const theme = useResolvedTheme();
  const id = useId().replace(/[^a-zA-Z0-9]/g, '');
  const [svg, setSvg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    import('mermaid')
      .then(async ({ default: mermaid }) => {
        mermaid.initialize({ startOnLoad: false, theme: theme === 'dark' ? 'dark' : 'default', securityLevel: 'strict' });
        const result = await mermaid.render(`mermaid-${id}`, code);
        if (cancelled) {
          return;
        }
        setSvg(result.svg);
        setError(null);
      })
      .catch((err: unknown) => {
        if (cancelled) {
          return;
        }
        setError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
  }, [code, id, theme]);

  if (error) {
    return <pre className="rounded-md border border-danger/40 bg-danger/5 p-3 text-xs text-danger">{error}</pre>;
  }
  if (!svg) {
    return <div className="h-24 animate-pulse rounded-md bg-bg-muted" />;
  }
  return <div className="flex justify-center overflow-auto" dangerouslySetInnerHTML={{ __html: svg }} />;
}
