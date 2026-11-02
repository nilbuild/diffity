import { useMemo } from 'react';
import { cn } from '../../lib/cn';
import type { Guide } from '../../lib/types';
import { useThemeStore } from '../../hooks/use-theme';
import { MermaidDiagram } from '../../components/mermaid-diagram';
import { MarkdownContent } from '../../components/layout/markdown-content';
import { diagramWithStyles, flowFocus } from './guide-model';
import { diagramRefs, linkRefs, useGuideRefs } from './guide-refs';
import { StepControls, useStepper } from './guide-stepper';
import { GuideRefLink } from './guide-ref-link';

/** The overview diagram: nodes and arrows that open their code, and a walkthrough that plays the flow step by step. */
export function GuideDiagram(props: { guide: Guide }) {
  const { guide } = props;
  const theme = useThemeStore((state) => state.theme);
  const refs = useGuideRefs();
  const diagram = guide.diagram ?? '';
  const chart = useMemo(() => diagramWithStyles(diagram, theme), [diagram, theme]);
  const linkRefsById = useMemo(() => new Map([...diagramRefs(diagram)].filter(([, ref]) => refs?.has(ref.path))), [diagram, refs]);
  const links = useMemo(() => new Set(linkRefsById.keys()), [linkRefsById]);
  const flow = guide.flow ?? [];
  const nodes = useMemo(() => flow.map((step) => step.node), [flow]);
  const stepper = useStepper(flow.length, () => {});
  const focus = useMemo(() => flowFocus(nodes, stepper.active), [nodes, stepper.active]);
  const hasRemoved = /:::removed\b/.test(diagram);
  const current = stepper.active !== null ? flow[stepper.active] : null;
  const currentRef = current ? linkRefsById.get(current.node) : undefined;

  return (
    <section
      tabIndex={flow.length > 0 ? 0 : undefined}
      aria-label="How it flows"
      onKeyDown={flow.length > 0 ? stepper.onKeyDown : undefined}
      className="mt-6 rounded-lg border border-border bg-bg outline-none focus-visible:ring-1 focus-visible:ring-accent"
    >
      <div className={cn('flex items-center gap-3 pl-4 text-xs text-text-secondary', flow.length > 0 ? 'pr-1.5 h-9 border-b border-border-muted' : 'pr-4 pt-3')}>
        <span className="font-medium text-text">How it flows</span>
        <Legend className="bg-diff-add-bg border-added/60" label="New" />
        <Legend className="bg-modified/15 border-modified/60" label="Changed" />
        {hasRemoved && <Legend className="bg-diff-del-bg border-deleted/60 border-dashed" label="Removed" />}
        <span className="flex-1" />
        {links.size > 0 && <span className="text-text-muted">Click a box to open its code</span>}
        {flow.length > 0 && (
          <span className="flex items-center gap-1">
            <StepControls stepper={stepper} count={flow.length} idleLabel={`${flow.length} steps`} noun="step" />
          </span>
        )}
      </div>
      <div className="px-4 pb-1">
        <MermaidDiagram
          chart={chart}
          frameClassName="max-h-[340px]"
          links={links}
          focus={focus}
          onLinkClick={(key) => {
            const ref = linkRefsById.get(key);
            if (ref) {
              refs?.open(ref);
            }
          }}
        />
      </div>
      {current && (
        <div className="flex items-start gap-3 px-4 py-2.5 border-t border-border-muted">
          <span className="mt-px font-mono text-[11px] text-claude tabular-nums shrink-0">{String((stepper.active ?? 0) + 1).padStart(2, '0')}</span>
          <div className="flex-1 min-w-0 text-[13px] leading-5 text-text select-text [&_p]:m-0">
            <MarkdownContent content={linkRefs(current.text)} />
          </div>
          {currentRef && <GuideRefLink guideRef={currentRef} className="text-[11px] shrink-0" />}
        </div>
      )}
    </section>
  );
}

function Legend(props: { className: string; label: string }) {
  const { className, label } = props;

  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={cn('w-2.5 h-2.5 rounded-sm border', className)} />
      {label}
    </span>
  );
}
