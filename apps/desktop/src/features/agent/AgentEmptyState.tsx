import { Kbd } from '@/components/ui/Kbd';
import { modKey } from '@/lib/platform';
import { ArrowRightIcon, CheckCircleIcon, CommentIcon, SparklesIcon, type IconComponent } from '@/components/ui/icon';

const EXAMPLES = [
  'What does this change do, and is anything risky?',
  'Are there missing tests for these changes?',
  'Explain the error handling in this diff',
];

const CAPABILITIES: { icon: IconComponent; title: string; body: string }[] = [
  { icon: SparklesIcon, title: 'Review', body: 'Leaves inline comments on the diff.' },
  { icon: CheckCircleIcon, title: 'Resolve', body: 'Fixes open threads; every edit asks first.' },
  { icon: CommentIcon, title: 'Mention', body: 'Write @claude in any comment to hand it over.' },
];

export function AgentEmptyState(props: { agentName: string; canRun: boolean; onExample: (prompt: string) => void }) {
  const { agentName, canRun, onExample } = props;
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-4 py-6">
      <div className="my-auto w-full">
        <div className="flex size-9 items-center justify-center rounded-lg border border-accent/25 bg-accent-soft text-accent">
          <SparklesIcon size={20} />
        </div>
        <h3 className="mt-3 text-base font-semibold text-fg">Review with {agentName}</h3>
        <p className="mt-1 text-xs leading-relaxed text-fg-muted">
          Ask about the diff, or select code and press <Kbd>{modKey}L</Kbd> to attach it.
        </p>

        <ul className="mt-4 divide-y divide-border-subtle rounded-md border border-border bg-raised">
          {CAPABILITIES.map((item) => (
            <li key={item.title} className="flex items-start gap-2.5 px-3 py-2">
              <item.icon size={14} className="mt-0.5 shrink-0 text-fg-subtle" />
              <span className="text-xs leading-relaxed text-fg-muted">
                <span className="font-medium text-fg">{item.title}</span> · {item.body}
              </span>
            </li>
          ))}
        </ul>

        {canRun && (
          <div className="mt-5">
            <div className="mb-1.5 text-xs font-medium text-fg-muted">Try asking</div>
            <div className="flex flex-col gap-1">
              {EXAMPLES.map((example) => (
                <button
                  key={example}
                  type="button"
                  onClick={() => onExample(example)}
                  className="group flex w-full cursor-default items-center gap-2 rounded-md border border-border bg-canvas px-2.5 py-1.5 text-left text-xs text-fg-muted transition-colors hover:border-border-strong hover:text-fg"
                >
                  <span className="min-w-0 flex-1">{example}</span>
                  <ArrowRightIcon size={12} className="shrink-0 text-fg-subtle group-hover:text-accent" />
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
