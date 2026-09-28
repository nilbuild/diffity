import { useQuery } from '@tanstack/react-query';
import { open } from '@tauri-apps/plugin-dialog';
import { useNavigate } from 'react-router';
import * as api from '@/lib/api';
import { queryKeys } from '@/lib/query';

export function WelcomePage() {
  const navigate = useNavigate();
  const recent = useQuery({ queryKey: queryKeys.recentRepos(), queryFn: api.recentRepos });

  const openRepo = (path: string) => {
    navigate(`/repo?path=${encodeURIComponent(path)}`);
  };

  const pickFolder = async () => {
    const selected = await open({ directory: true, multiple: false });
    if (typeof selected !== 'string') {
      return;
    }
    openRepo(selected);
  };

  return (
    <div data-tauri-drag-region className="flex h-full flex-col items-center justify-center gap-6">
      <h1 className="text-2xl font-semibold">Diffity</h1>
      <button
        type="button"
        onClick={pickFolder}
        className="rounded-md bg-accent px-4 py-2 text-accent-fg hover:bg-accent-hover"
      >
        Open Folder
      </button>
      <ul className="w-96 space-y-1">
        {(recent.data ?? []).map((repo) => (
          <li key={repo.path}>
            <button
              type="button"
              onClick={() => openRepo(repo.path)}
              className="w-full rounded px-3 py-2 text-left hover:bg-bg-muted"
            >
              <div className="font-medium">{repo.name}</div>
              <div className="truncate text-fg-subtle">{repo.path}</div>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
