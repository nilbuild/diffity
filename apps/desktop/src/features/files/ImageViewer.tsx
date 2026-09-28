import { useQuery } from '@tanstack/react-query';
import { Spinner } from '@/components/ui/Spinner';
import * as api from '@/lib/api';
import { useWorkspace } from '@/features/workspace/workspace-context';

export function ImageViewer(props: { path: string; mime: string }) {
  const { path, mime } = props;
  const { repoPath } = useWorkspace();
  const query = useQuery({
    queryKey: ['repo', repoPath, 'fileBase64', path],
    queryFn: () => api.readFileBase64(repoPath, path),
  });

  if (query.isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner />
      </div>
    );
  }
  if (!query.data) {
    return <div className="p-6 text-xs text-danger">Could not load image. {api.errorMessage(query.error)}</div>;
  }
  return (
    <div className="flex h-full items-center justify-center overflow-auto p-8">
      <div className="checkerboard rounded-md border border-border p-4">
        <img src={`data:${mime};base64,${query.data}`} alt={path} className="max-h-[70vh] max-w-full object-contain [image-rendering:auto]" />
      </div>
    </div>
  );
}
