import { Skeleton } from "../../../components/ui/Skeleton";
import { PageShellSkeleton } from "../../../components/PageShellSkeleton";

export default function BotLoading() {
  return (
    <PageShellSkeleton>
      <div className="mx-auto w-full max-w-4xl space-y-4">
        <Skeleton className="h-9 w-32" />
        <Skeleton className="h-44 w-full rounded-2xl" />
        <Skeleton className="h-72 w-full rounded-2xl" />
      </div>
    </PageShellSkeleton>
  );
}
