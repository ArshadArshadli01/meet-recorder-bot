import { Skeleton } from "../../components/ui/Skeleton";
import { PageShellSkeleton } from "../../components/PageShellSkeleton";

export default function NotificationsLoading() {
  return (
    <PageShellSkeleton>
      <div className="mx-auto w-full max-w-3xl">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div className="space-y-2">
            <Skeleton className="h-7 w-40" />
            <Skeleton className="h-4 w-56" />
          </div>
          <Skeleton className="h-10 w-48 rounded-lg" />
        </div>
        <Skeleton className="mb-4 h-9 w-56 rounded-lg" />
        <div className="flex flex-col gap-2">
          {Array.from({ length: 7 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full rounded-xl" />
          ))}
        </div>
      </div>
    </PageShellSkeleton>
  );
}
