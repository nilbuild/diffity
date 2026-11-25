import { ListRowSkeleton } from '../ui/list-row';
import { Skeleton } from '../ui/skeleton';
import { buttonOutline } from '../ui/button-styles';
import { EditorIcon, FilesIcon } from '../ui/icon';
import { cn } from '../../lib/cn';
import { useRepoPath } from '../../hooks/use-repo';
import { NewTaskButton } from '../../features/tasks/task-list';

/** The Up next bar while its decision is pending: same box and line heights as `Hero`, no text that could change. */
function HeroSkeleton() {
  return (
    <section aria-busy className="mt-6 flex items-center gap-4 rounded-xl border border-border bg-bg-secondary px-4 py-3.5">
      <Skeleton className="size-8 shrink-0 rounded-lg" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center h-5">
          <Skeleton className="w-[300px] max-w-full h-3.5" />
        </div>
        <div className="mt-0.5 flex items-center h-4">
          <Skeleton className="w-44 h-2.5" />
        </div>
      </div>
      <Skeleton className="w-40 h-7 shrink-0 rounded-md" />
      <Skeleton className="w-28 h-7 shrink-0 rounded-md" />
    </section>
  );
}

function StatusLineSkeleton() {
  return (
    <div aria-busy className="mt-1 flex items-center gap-2 h-4">
      <Skeleton className="w-28 h-2.5" />
      <Skeleton className="w-24 h-2.5" />
      <Skeleton className="w-40 h-2.5" />
    </div>
  );
}

function ListSkeleton(props: { rows: number }) {
  const { rows } = props;

  return (
    <section aria-busy className="mt-8">
      <div className="flex items-center h-8">
        <Skeleton className="w-20 h-3" />
      </div>
      <ul className="-mx-3 mt-1">
        {Array.from({ length: rows }, (_, index) => <ListRowSkeleton key={index} index={index} />)}
      </ul>
    </section>
  );
}

/** Home below its header while the Up next decision is pending: status line, hero and a list, at their real sizes. */
export function HomeSkeletonBody() {
  return (
    <>
      <StatusLineSkeleton />
      <HeroSkeleton />
      <ListSkeleton rows={4} />
    </>
  );
}

/** Home's content area in placeholder form, used when a repository opens straight onto Home. */
export function HomeSkeletonMain(props: { repoName: string }) {
  const { repoName } = props;
  const repoPath = useRepoPath();

  return (
    <main className="flex-1 min-h-0 overflow-hidden">
      <div className="max-w-[1000px] mx-auto px-8 pt-7 pb-12">
        <header className="flex items-center gap-3 h-7">
          <h1 className="text-[18px] leading-6 font-semibold text-text truncate">{repoName}</h1>
          <Skeleton className="w-28 h-3" />
          <span className="flex-1" />
          {/* Home's buttons, inert until the page is up; same boxes so nothing moves when it is. */}
          <span aria-hidden className={cn(buttonOutline, 'h-7 cursor-default')}>
            <FilesIcon size="sm" className="text-text-secondary" />
            Browse files
          </span>
          <span aria-hidden className={cn(buttonOutline, 'h-7 cursor-default')}>
            <EditorIcon size="sm" className="text-text-secondary" />
            Open in editor
          </span>
          <NewTaskButton repoPath={repoPath} />
        </header>
        <HomeSkeletonBody />
      </div>
    </main>
  );
}
