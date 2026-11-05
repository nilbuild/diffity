import { useState } from 'react';
import { cn } from '../../lib/cn';
import { getRepoPath } from '../../lib/api';
import { MenuItem, MenuLabel, MenuSeparator, Popover, useMenu } from '../../components/ui/popover';
import { ChevronDownIcon, SparkleIcon } from '../../components/ui/icon';
import { enqueueClaude } from './claude-runner';
import { ModelMenu } from './model-picker';
import { useRunPick, type RunPick } from './model-setting';
import { agentMeta } from './agents';

const itemClass = 'inline-flex items-center h-6 rounded-md text-xs text-text-secondary hover:text-text hover:bg-hover transition-colors cursor-pointer';

/** "Ask Claude" on one thread; the chevron picks the model (and so the agent) for just this run. */
export function AskClaudeThreadButton(props: { threadId: string; sessionId: string | null }) {
  const { threadId, sessionId } = props;
  const { open, close, toggle, anchorRef } = useMenu();
  const fallbackPick = useRunPick('fix', getRepoPath());
  const [picked, setPicked] = useState<RunPick | null>(null);
  const pick = picked ?? fallbackPick;
  const agent = agentMeta(pick.agent);

  const ask = () => {
    close();
    enqueueClaude({ kind: 'thread', threadId }, { repoPath: getRepoPath(), sessionId, pick });
  };

  return (
    <span className="inline-flex items-center">
      <button onClick={ask} className={cn(itemClass, 'gap-1 px-2')} title={`${agent.short} answers or makes the change for this comment`}>
        <SparkleIcon className="w-3 h-3 text-claude" />
        Ask {agent.short}
      </button>
      <button
        ref={anchorRef}
        onClick={toggle}
        aria-expanded={open}
        aria-label="Pick a model for this run"
        title="Pick a model for this run"
        className={cn(itemClass, '-ml-1 px-1 text-text-muted', open && 'bg-hover text-text')}
      >
        <ChevronDownIcon size="xs" />
      </button>
      <Popover open={open} onClose={close} anchorRef={anchorRef} align="end" width={260}>
        <MenuLabel>This run only</MenuLabel>
        <ModelMenu value={pick} onChange={setPicked} />
        <MenuSeparator />
        <MenuItem icon={<SparkleIcon size="sm" className="text-claude" />} label={`Ask ${agent.short}`} onSelect={ask} />
      </Popover>
    </span>
  );
}
