import { ListRowSkeleton } from '../ui/list-row';
import { Skeleton } from '../ui/skeleton';

/** The Up next card while its decision is pending: same box and line heights as `Hero`, no text that could change. */
function HeroSkeleton() {
  return (
    <section aria-busy className="mt-6 rounded-xl border border-border bg-bg-secondary px-6 py-5">
      <div className="flex items-center h-4">
        <Skeleton className="w-44 h-3" />
      </div>
      <div className="flex items-center mt-2 h-6">
        <Skeleton className="w-[340px] max-w-full h-4" />
      </div>
      <div className="flex items-center mt-1 h-5">
        <Skeleton className="w-52 h-3" />
      </div>
      <div className="mt-4 flex items-center gap-3">
        <Skeleton className="w-28 h-7 rounded-md" />
        <Skeleton className="w-44 h-7 rounded-md" />
        <Skeleton className="ml-auto w-36 h-3" />
      </div>
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

  return (
    <main className="flex-1 min-h-0 overflow-hidden">
      <div className="max-w-[1000px] mx-auto px-8 pt-7 pb-12">
        <header className="flex items-center gap-3 h-7">
          <h1 className="text-[18px] leading-6 font-semibold text-text truncate">{repoName}</h1>
          <Skeleton className="w-28 h-3" />
          <span className="flex-1" />
          <Skeleton className="w-[118px] h-7 rounded-md" />
          <Skeleton className="w-[150px] h-7 rounded-md" />
        </header>
        <HomeSkeletonBody />
      </div>
    </main>
  );
}
