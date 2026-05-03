import { Skeleton } from "../components/ui/Skeleton";
import { PageShellSkeleton } from "../components/PageShellSkeleton";

/**
 * Dashboard skeleton — shape mirrors the real `<DashboardInner>` tree so
 * there's no visual jump when the data resolves: title + subtitle, the
 * "enable notifications" promo card, and a stack of bot rows.
 */
export default function DashboardLoading() {
  return (
    <PageShellSkeleton>
      <div className="mx-auto w-full max-w-5xl">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <div className="space-y-2">
            <Skeleton className="h-7 w-44" />
            <Skeleton className="h-4 w-72" />
          </div>
          <Skeleton className="h-10 w-32 rounded-lg" />
        </div>
        <Skeleton className="mb-4 h-24 w-full rounded-2xl" />
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full rounded-2xl" />
          ))}
        </div>
      </div>
    </PageShellSkeleton>
  );
}
