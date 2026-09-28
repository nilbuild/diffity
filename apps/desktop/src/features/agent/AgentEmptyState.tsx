import { Kbd } from '@/components/ui/Kbd';
import { CommentIcon, PencilIcon, SearchIcon, SparklesIcon } from '@/components/ui/icon';

const EXAMPLES = [
  'What does this change do, and is anything risky?',
  'Are there missing tests for these changes?',
  'Explain the error handling in this diff',
];

export function AgentEmptyState(props: { agentName: string; canRun: boolean; onExample: (prompt: string) => void }) {
  const { agentName, canRun, onExample } = props;
  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-4 py-6">
      <div className="mx-auto max-w-[300px]">
        <div className="mb-3 flex size-10 items-center justify-center rounded-lg border border-accent/25 bg-accent-soft text-accent">
          <SparklesIcon size={20} />
        </div>
        <h3 className="text-sm font-semibold">Review with {agentName}</h3>
        <p className="mt-1 text-xs leading-relaxed text-fg-muted">
          The agent reads your diff and repository through Diffity and works alongside you.
        </p>
        <ul className="mt-4 space-y-2.5 text-xs text-fg-muted">
          <li className="flex gap-2">
            <SearchIcon size={14} className="mt-px shrink-0 text-fg-subtle" />
            <span>
              <span className="font-medium text-fg">Review</span> leaves inline comments on the changes, optionally
              focused on security, performance, types…
            </span>
          </li>
          <li className="flex gap-2">
            <PencilIcon size={14} className="mt-px shrink-0 text-fg-subtle" />
            <span>
              <span className="font-medium text-fg">Resolve all</span> fixes open comment threads. Every file write asks
              for your approval.
            </span>
          </li>
          <li className="flex gap-2">
            <CommentIcon size={14} className="mt-px shrink-0 text-fg-subtle" />
            <span>
              <span className="font-medium text-fg">Ask</span> about any line: select code and press <Kbd>⌘L</Kbd> to
              attach it as context.
            </span>
          </li>
        </ul>
        {canRun && (
          <div className="mt-5 space-y-1.5">
            {EXAMPLES.map((example) => (
              <button
                key={example}
                type="button"
                onClick={() => onExample(example)}
                className="block w-full rounded-md border border-border bg-raised px-2.5 py-1.5 text-left text-xs text-fg-muted transition-colors hover:border-border-strong hover:bg-hover hover:text-fg"
              >
                {example}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
