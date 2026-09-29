import { useQuery } from '@tanstack/react-query';
import { fetchRawFileUrl } from '../../lib/api';

export const REPO_FILE_PREFIX = 'repo-file:';

interface RepoImageProps {
  path: string;
  alt?: string;
  width?: number | string;
  height?: number | string;
  className?: string;
}

export function RepoImage(props: RepoImageProps) {
  const { path, alt, width, height, className } = props;
  const { data } = useQuery({
    queryKey: ['raw-file', path],
    queryFn: () => fetchRawFileUrl(path),
    staleTime: 30_000,
  });

  if (!data) {
    return null;
  }

  return <img src={data} alt={alt ?? ''} width={width} height={height} className={className} />;
}
