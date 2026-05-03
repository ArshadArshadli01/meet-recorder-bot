import { Skeleton } from "../../components/ui/Skeleton";

/**
 * Login is the only route that doesn't render through `AppShell`, so its
 * loading state is just a centered card skeleton matching `<LoginInner>`.
 */
export default function LoginLoading() {
  return (
    <div className="relative flex min-h-screen items-center justify-center px-4 py-10">
      <div className="absolute right-4 top-4">
        <Skeleton className="h-9 w-9 rounded-md" />
      </div>
      <div className="w-full max-w-md rounded-2xl border border-border bg-card/85 p-8 text-center shadow-[var(--shadow-elevated)] backdrop-blur">
        <Skeleton className="mx-auto h-14 w-14 rounded-2xl" />
        <Skeleton className="mx-auto mt-4 h-7 w-44" />
        <Skeleton className="mx-auto mt-2 h-4 w-72" />
        <Skeleton className="mt-6 h-11 w-full rounded-lg" />
        <ul className="mt-6 space-y-3">
          <li className="flex items-start gap-2">
            <Skeleton className="mt-0.5 h-4 w-4 rounded-full" />
            <Skeleton className="h-4 flex-1" />
          </li>
          <li className="flex items-start gap-2">
            <Skeleton className="mt-0.5 h-4 w-4 rounded-full" />
            <Skeleton className="h-4 flex-1" />
          </li>
        </ul>
      </div>
    </div>
  );
}
