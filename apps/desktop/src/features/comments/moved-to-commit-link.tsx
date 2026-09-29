import { useNavigate } from 'react-router';
import { useRepoPath } from '../../hooks/use-repo';
import { useRepoThreads } from '../../hooks/use-repo-threads';

interface MovedToCommitLinkProps {
  threadId: string;
  filePath: string;
}

/** "View in commit abc1234" when the commented code now lives in the latest commit. */
export function MovedToCommitLink(props: MovedToCommitLinkProps) {
  const { threadId, filePath } = props;
  const { data } = useRepoThreads();
  const navigate = useNavigate();
  const repoPath = useRepoPath();
  const movedTo = data?.find((thread) => thread.id === threadId)?.movedTo;

  if (!movedTo) {
    return null;
  }

  return (
    <button
      onClick={() => {
        const params = new URLSearchParams({ ref: movedTo.ref, file: filePath });
        navigate(`/r/${encodeURIComponent(repoPath)}/diff?${params.toString()}`);
      }}
      className="text-[11px] text-accent hover:underline cursor-pointer mr-2"
      title={movedTo.subject}
    >
      View in commit {movedTo.shortSha}
    </button>
  );
}
