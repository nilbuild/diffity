import { openPullRequests } from '../../lib/ui-store';
import { useHasGitHubRemote } from '../../hooks/use-repo-state';
import { buttonOutline } from '../../components/ui/button-styles';
import { GitPullRequestIcon } from '../../components/icons/git-pull-request-icon';

export function PullRequestsButton() {
  const hasRemote = useHasGitHubRemote();

  if (!hasRemote) {
    return null;
  }
  return (
    <button onClick={openPullRequests} className={buttonOutline} title="Pull requests: list, search and check out">
      <GitPullRequestIcon className="h-3.5 w-3.5" />
      <span className="hidden min-[1360px]:inline">Pull requests</span>
    </button>
  );
}
