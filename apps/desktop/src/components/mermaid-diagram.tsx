import { useEffect, useRef, useState } from 'react';
import mermaid from 'mermaid';
import { XIcon } from './icons/x-icon';

let initialized = false;

function initMermaid(isDark: boolean) {
  mermaid.initialize({
    startOnLoad: false,
    theme: isDark ? 'dark' : 'default',
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
    fontSize: 12,
    flowchart: { padding: 8 },
    securityLevel: 'strict',
  });
  initialized = true;
}

let idCounter = 0;

export function MermaidDiagram(props: { chart: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [svgContent, setSvgContent] = useState<string | null>(null);
  const idRef = useRef(`mermaid-${idCounter++}`);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    const isDark = document.documentElement.classList.contains('dark');
    if (!initialized) {
      initMermaid(isDark);
    }

    let cancelled = false;

    mermaid
      .render(idRef.current, props.chart)
      .then(({ svg }) => {
        if (cancelled) {
          return;
        }
        container.innerHTML = svg;
        setSvgContent(svg);
        setError(null);
      })
      .catch(() => {
        if (cancelled) {
          return;
        }
        setError('Failed to render diagram');
      });

    return () => {
      cancelled = true;
    };
  }, [props.chart]);

  if (error) {
    return (
      <pre className="my-2 p-2 bg-bg-tertiary rounded text-[10px] font-mono overflow-x-auto text-text-muted">
        {props.chart}
      </pre>
    );
  }

  return (
    <>
      <div className="my-3 relative group">
        <div
          ref={containerRef}
          className="flex justify-center overflow-hidden [&_svg]:max-w-full max-h-[200px]"
        />
        {svgContent && (
          <button
            onClick={() => dialogRef.current?.showModal()}
            className="absolute inset-0 flex items-end justify-center bg-gradient-to-t from-bg/80 to-transparent opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
          >
            <span className="mb-3 px-3 py-1.5 text-xs font-medium rounded-md bg-bg border border-border text-text shadow-sm">
              View full diagram
            </span>
          </button>
        )}
      </div>

      <dialog
        ref={dialogRef}
        className="bg-bg text-text border border-border rounded-xl shadow-lg w-[90vw] max-h-[90vh] overflow-auto backdrop:bg-black/60 backdrop:backdrop-blur-sm p-0 m-auto fixed inset-0 h-fit"
        onClick={(e) => {
          if (e.target === dialogRef.current) {
            dialogRef.current?.close();
          }
        }}
      >
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-border">
          <h2 className="text-sm font-semibold">Diagram</h2>
          <button
            className="p-1 rounded-md text-text-muted hover:text-text hover:bg-hover cursor-pointer"
            onClick={() => dialogRef.current?.close()}
          >
            <XIcon className="w-4 h-4" />
          </button>
        </div>
        <div className="p-6 flex justify-center [&_svg]:!w-full [&_svg]:h-auto">
          {svgContent && (
            <div
              className="w-full"
              dangerouslySetInnerHTML={{ __html: svgContent }}
            />
          )}
        </div>
      </dialog>
    </>
  );
}
