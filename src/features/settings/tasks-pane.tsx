import { useQuery, useQueryClient } from '@tanstack/react-query';
import { revealItemInDir } from '@tauri-apps/plugin-opener';
import * as tauri from '../../lib/tauri';
import { cleanUpMerged, DEFAULT_LIMIT, LIMIT_SETTING, NOTIFY_SETTING, useAllTasks } from '../tasks/tasks';
import { setTaskLimit } from '../claude/claude-runner';
import { shortPath } from '../welcome/recent-repos';
import { PreferencesGroup, PreferencesPane, PreferencesRow, SettingsButton, Stepper, Switch } from './preferences';
import { Skeleton } from '../../components/ui/skeleton';
import { fileManagerName, isMac } from '../../lib/platform';

const LIMITS = [1, 2, 3, 4, 5, 6, 8, 10] as const;

function formatBytes(bytes: number): string {
  if (bytes >= 1024 ** 3) {
    return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
  }
  return `${Math.round(bytes / 1024 ** 2)} MB`;
}

export function TasksPane() {
  const client = useQueryClient();
  const tasks = useAllTasks();
  const { data: limitValue, isPending: limitPending } = useQuery({ queryKey: ['setting', LIMIT_SETTING], queryFn: () => tauri.getSetting(LIMIT_SETTING) });
  const { data: notifyValue, isPending: notifyPending } = useQuery({ queryKey: ['setting', NOTIFY_SETTING], queryFn: () => tauri.getSetting(NOTIFY_SETTING) });
  const { data: storage, isFetching } = useQuery({ queryKey: ['task-storage'], queryFn: () => tauri.taskStorage(null), staleTime: 60_000 });
  const limit = Number(limitValue) >= 1 ? Number(limitValue) : DEFAULT_LIMIT;
  const notify = notifyValue !== '0';
  const total = (storage?.tasks ?? []).reduce((sum, item) => sum + item.bytes, 0);
  const merged = tasks.filter((task) => task.mergedAt);

  const save = async (key: string, value: string) => {
    client.setQueryData(['setting', key], value);
    await tauri.setSetting(key, value).catch(() => undefined);
  };

  return (
    <PreferencesPane>
      <PreferencesGroup label="Running tasks">
        <PreferencesRow label="Agents at once" hint="Task agents beyond this wait in a queue. Agent plans have usage limits, so more isn't always faster.">
          {limitPending ? <Skeleton className="w-[114px] h-7 rounded-md" /> : (
            <Stepper
              value={limit}
              steps={LIMITS}
              defaultValue={DEFAULT_LIMIT}
              ariaLabel="Agents at once"
              format={(value) => `${value}`}
              onChange={(value) => {
                setTaskLimit(value);
                void save(LIMIT_SETTING, String(value));
              }}
            />
          )}
        </PreferencesRow>
        <PreferencesRow label="Notifications" hint={`A ${isMac ? 'macOS' : 'desktop'} notification when a task in the background is ready, needs approval or stops.`}>
          {notifyPending ? <Skeleton className="w-[30px] h-[18px] rounded-full" /> : (
            <Switch checked={notify} label="Notifications" onChange={(checked) => void save(NOTIFY_SETTING, checked ? '1' : '0')} />
          )}
        </PreferencesRow>
      </PreferencesGroup>
      <PreferencesGroup label="Storage">
        <PreferencesRow
          label="Task folders"
          hint={storage ? `${shortPath(storage.root)} · ${storage.tasks.length} folder${storage.tasks.length === 1 ? '' : 's'} · ${isFetching ? 'measuring…' : formatBytes(total)}` : 'Measuring…'}
        >
          <SettingsButton onClick={() => storage && void revealItemInDir(storage.root).catch(() => undefined)} disabled={!storage}>
            Reveal in {fileManagerName}
          </SettingsButton>
        </PreferencesRow>
        <PreferencesRow label="Merged tasks" hint="Archiving removes the folder and keeps the branch, its rounds and comments.">
          <SettingsButton
            disabled={merged.length === 0}
            onClick={() => void cleanUpMerged(merged).then(() => client.invalidateQueries({ queryKey: ['task-storage'] }))}
          >
            {merged.length > 0 ? `Archive ${merged.length} merged` : 'None merged'}
          </SettingsButton>
        </PreferencesRow>
        <PreferencesRow
          label="Setup per repository"
          hint="Add .diffity/workspace.json to a repository to share setup with your team: { &quot;copy&quot;: [&quot;.env*&quot;], &quot;setup&quot;: &quot;pnpm install&quot;, &quot;archive&quot;: &quot;docker compose down&quot; }"
        />
      </PreferencesGroup>
    </PreferencesPane>
  );
}
