import { useQuery } from '@tanstack/react-query';
import { RichContent } from '@/components/markdown/RichContent';
import { Spinner } from '@/components/ui/Spinner';
import * as api from '@/lib/api';
import { queryKeys } from '@/lib/query';
import { useWorkspace } from '@/features/workspace/workspace-context';

export type PreviewSide = 'old' | 'new' | 'both';

export function RichPreview(props: { path: string; oldPath: string | null; which: PreviewSide }) {
  const { path, oldPath, which } = props;
  const { repoPath, ref } = useWorkspace();
  const query = useQuery({
    queryKey: queryKeys.fileVersions(repoPath, ref, path),
    queryFn: () => api.getFileVersions(repoPath, ref, path, oldPath),
  });

  if (query.isLoading) {
    return (
      <div className="p-4">
        <Spinner />
      </div>
    );
  }
  const data = query.data;
  if (!data) {
    return <div className="p-4 text-xs text-danger">Could not load file versions.</div>;
  }

  if (which !== 'both') {
    return (
      <div className="border-b border-border font-sans whitespace-normal">
        {which === 'old' ? (
          <PreviewColumn label="Before" contents={data.oldContents} path={oldPath ?? path} />
        ) : (
          <PreviewColumn label="After" contents={data.newContents} path={path} />
        )}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-px overflow-hidden border-b border-border bg-border font-sans whitespace-normal">
      <PreviewColumn label="Before" contents={data.oldContents} path={oldPath ?? path} />
      <PreviewColumn label="After" contents={data.newContents} path={path} />
    </div>
  );
}

function PreviewColumn(props: { label: string; contents: string | null; path: string }) {
  const { label, contents, path } = props;
  return (
    <div className="min-w-0 bg-bg-elevated">
      <div className="border-b border-border px-4 py-1.5 text-[11px] font-semibold tracking-wide text-fg-subtle uppercase">{label}</div>
      <div className="max-h-[640px] overflow-auto px-5 py-4">
        {contents === null ? <div className="text-xs text-fg-subtle">No content</div> : <RichContent path={path} contents={contents} />}
      </div>
    </div>
  );
}
