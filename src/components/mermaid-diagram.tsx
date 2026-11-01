import { useEffect, useRef, useState } from 'react';
import { XIcon } from './ui/icon';
import { useThemeStore } from '../hooks/use-theme';

type Mermaid = typeof import('mermaid').default;

let mermaidPromise: Promise<Mermaid> | null = null;

/** Mermaid is large, so it loads the first time a diagram is shown, not with the app (issue #55). */
function loadMermaid(): Promise<Mermaid> {
  if (!mermaidPromise) {
    mermaidPromise = import('mermaid').then((module) => module.default);
  }
  return mermaidPromise;
}

let initializedTheme: 'light' | 'dark' | null = null;

function initMermaid(mermaid: Mermaid, theme: 'light' | 'dark') {
  if (initializedTheme === theme) {
    return;
  }
  mermaid.initialize({
    startOnLoad: false,
    theme: theme === 'dark' ? 'dark' : 'default',
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
    fontSize: 12,
    flowchart: { padding: 8 },
    securityLevel: 'strict',
  });
  initializedTheme = theme;
}

let idCounter = 0;
let renderCounter = 0;

/** A flowchart node's id as written in the chart, read from the element mermaid draws for it. */
function nodeId(element: Element): string | null {
  const id = element.getAttribute('data-id') ?? /-flowchart-(.+)-\d+$/.exec(element.id)?.[1];
  return id ?? null;
}

/** Marks the nodes that link somewhere, so they look and act clickable. */
function markLinkedNodes(root: HTMLElement, links: Set<string>) {
  for (const node of root.querySelectorAll('g.node')) {
    const id = nodeId(node);
    if (id && links.has(id)) {
      node.setAttribute('data-node-link', id);
      node.setAttribute('role', 'button');
      node.setAttribute('tabindex', '0');
    }
  }
}

function linkedNodeAt(target: EventTarget | null): string | null {
  return (target as Element | null)?.closest?.('[data-node-link]')?.getAttribute('data-node-link') ?? null;
}

interface MermaidDiagramProps {
  chart: string;
  /** Sizes the inline preview (200px tall unless set); the full diagram opens in a dialog. */
  frameClassName?: string;
  /** Node ids that open something on click. */
  nodeLinks?: Set<string>;
  onNodeClick?: (id: string) => void;
}

export function MermaidDiagram(props: MermaidDiagramProps) {
  const { nodeLinks, onNodeClick } = props;
  const linkKey = nodeLinks ? [...nodeLinks].join('\u0000') : '';
  const containerRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [svgContent, setSvgContent] = useState<string | null>(null);
  const idRef = useRef(`mermaid-${idCounter++}`);
  const theme = useThemeStore((state) => state.theme);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    let cancelled = false;

    loadMermaid()
      .then((mermaid) => {
        if (cancelled) {
          return null;
        }
        initMermaid(mermaid, theme);
        // A fresh id per render: reusing one while an earlier render of it is still running leaves an empty diagram.
        return mermaid.render(`${idRef.current}-${++renderCounter}`, props.chart);
      })
      .then((result) => {
        if (cancelled || !result) {
          return;
        }
        container.innerHTML = result.svg;
        if (nodeLinks && nodeLinks.size > 0) {
          markLinkedNodes(container, nodeLinks);
        }
        setSvgContent(container.innerHTML);
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
  }, [props.chart, theme, linkKey]);

  const linked = !!onNodeClick && !!nodeLinks && nodeLinks.size > 0;
  const handleNodeClick = (event: React.MouseEvent | React.KeyboardEvent, inDialog: boolean) => {
    if (!linked) {
      return;
    }
    if ('key' in event && event.key !== 'Enter' && event.key !== ' ') {
      return;
    }
    const id = linkedNodeAt(event.target);
    if (!id) {
      return;
    }
    event.preventDefault();
    if (inDialog) {
      dialogRef.current?.close();
    }
    onNodeClick(id);
  };
  const openDialog = () => {
    // Focus the dialog, not its close button, so the button does not open with a focus ring.
    dialogRef.current?.showModal();
    dialogRef.current?.focus();
  };

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
          onClick={(event) => handleNodeClick(event, false)}
          onKeyDown={(event) => handleNodeClick(event, false)}
          className={`mermaid-links flex justify-center overflow-hidden [&_svg]:max-w-full ${props.frameClassName ?? 'max-h-[200px]'}`}
        />
        {svgContent && linked && (
          <button
            onClick={openDialog}
            className="absolute top-1 right-1 px-2 py-1 text-[11px] font-medium rounded-md bg-bg border border-border text-text-secondary hover:text-text opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity cursor-pointer"
          >
            View full diagram
          </button>
        )}
        {svgContent && !linked && (
          <button
            onClick={openDialog}
            className="absolute inset-0 flex items-end justify-center bg-gradient-to-t from-bg/80 to-transparent opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
          >
            <span className="mb-3 px-3 py-1.5 text-xs font-medium rounded-md bg-bg border border-border text-text">
              View full diagram
            </span>
          </button>
        )}
      </div>

      <dialog
        ref={dialogRef}
        tabIndex={-1}
        className="outline-none bg-overlay text-text ring-1 ring-overlay-border rounded-xl w-[90vw] max-h-[90vh] overflow-auto backdrop:bg-black/60 backdrop:backdrop-blur-sm p-0 m-auto fixed inset-0 h-fit"
        onClick={(e) => {
          if (e.target === dialogRef.current) {
            dialogRef.current?.close();
          }
        }}
      >
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-overlay-border">
          <h2 className="text-sm font-semibold">Diagram</h2>
          <button
            className="p-1 rounded-md text-text-muted hover:text-text hover:bg-hover cursor-pointer"
            onClick={() => dialogRef.current?.close()}
          >
            <XIcon className="w-4 h-4" />
          </button>
        </div>
        <div className="p-6 flex justify-center [&_svg]:!w-full [&_svg]:h-auto [&_svg]:block [&_svg]:mx-auto">
          {svgContent && (
            <div
              className="mermaid-links w-full"
              onClick={(event) => handleNodeClick(event, true)}
              onKeyDown={(event) => handleNodeClick(event, true)}
              dangerouslySetInnerHTML={{ __html: svgContent }}
            />
          )}
        </div>
      </dialog>
    </>
  );
}
