import { create } from 'zustand';
import { toast } from 'sonner';
import type { AgentEvent, LinkedProject } from '../../lib/types';
import { projectName } from './groups';

const EDIT_KINDS = new Set(['edit', 'delete', 'move']);

export interface LinkedChange {
  path: string;
  name: string;
  files: string[];
}

interface ChangedProject {
  agent: string;
  files: string[];
}

/** Projects an agent changed while working from another one, kept until each is opened. */
export const useLinkedChanges = create<{ byPath: Record<string, ChangedProject> }>(() => ({ byPath: {} }));

let opener: ((path: string) => void) | null = null;

export function setProjectOpener(open: (path: string) => void) {
  opener = open;
}

/** Collects the files a run's finished edits touched inside its linked projects. */
export function linkedEditTracker(projects: LinkedProject[]) {
  const calls = new Map<string, { kind: string; status: string; files: Set<string> }>();

  const record = (event: AgentEvent) => {
    if (event.type === 'toolCall') {
      calls.set(event.id, { kind: event.kind, status: event.status, files: new Set(event.locations) });
      return;
    }
    if (event.type !== 'toolCallUpdate') {
      return;
    }
    const call = calls.get(event.id);
    if (!call) {
      return;
    }
    call.status = event.status;
    call.kind = event.kind ?? call.kind;
    event.locations?.forEach((file) => call.files.add(file));
  };

  const changes = (): LinkedChange[] => {
    const byPath = new Map<string, Set<string>>();
    for (const call of calls.values()) {
      if (call.status !== 'completed' || !EDIT_KINDS.has(call.kind)) {
        continue;
      }
      for (const file of call.files) {
        const project = projects.find((item) => file.startsWith(`${item.path}/`));
        if (!project) {
          continue;
        }
        const files = byPath.get(project.path) ?? new Set<string>();
        files.add(file.slice(project.path.length + 1));
        byPath.set(project.path, files);
      }
    }
    return [...byPath].map(([path, files]) => ({ path, name: projectName(path), files: [...files].sort() }));
  };

  return { record, changes };
}

function fileList(files: string[]) {
  const names = files.map((file) => file.split('/').pop() ?? file);
  if (names.length <= 3) {
    return names.join(', ');
  }
  return `${names.slice(0, 3).join(', ')} and ${names.length - 3} more`;
}

/** Tells the user which other projects a run changed, and marks them on the rail until opened. */
export function noteLinkedChanges(changes: LinkedChange[], agent: string) {
  if (changes.length === 0) {
    return;
  }
  useLinkedChanges.setState((state) => {
    const byPath = { ...state.byPath };
    for (const change of changes) {
      byPath[change.path] = { agent, files: [...new Set([...(byPath[change.path]?.files ?? []), ...change.files])] };
    }
    return { byPath };
  });
  const [only] = changes;
  if (changes.length === 1) {
    toast.info(`${agent} also changed ${only.name}`, {
      description: fileList(only.files),
      duration: 12_000,
      action: opener ? { label: `Open ${only.name}`, onClick: () => opener?.(only.path) } : undefined,
    });
    return;
  }
  toast.info(`${agent} also changed ${changes.length} other projects`, {
    description: changes.map((change) => `${change.name}: ${fileList(change.files)}`).join(' · '),
    duration: 12_000,
  });
}

export function clearLinkedChanges(path: string) {
  if (!useLinkedChanges.getState().byPath[path]) {
    return;
  }
  useLinkedChanges.setState((state) => {
    const byPath = { ...state.byPath };
    delete byPath[path];
    return { byPath };
  });
}
