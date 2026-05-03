import { Skeleton } from "./ui/Skeleton";

/**
 * Static skeleton that mirrors the AppShell chrome (sidebar, top bar, mobile
 * bottom nav) without depending on the auth context. Used by the Next.js
 * `loading.tsx` files so the user sees a layout-shaped placeholder during
 * route transitions instead of a blank screen.
 *
 * Server-renderable on purpose — avoids hydrating a client tree just to
 * paint placeholders.
 */
export function PageShellSkeleton({
  children,
}: {
  children?: React.ReactNode;
}) {
  return (
    <div className="min-h-screen pb-[88px] lg:pb-0 lg:pl-64">
      {/* Desktop side nav placeholder */}
      <aside className="hidden lg:fixed lg:inset-y-0 lg:left-0 lg:w-64 lg:flex lg:flex-col lg:border-r lg:border-border lg:bg-card/60 lg:backdrop-blur">
        <div className="flex h-16 shrink-0 items-center gap-2 border-b border-border px-5">
          <Skeleton className="h-8 w-8 rounded-md" />
          <Skeleton className="h-4 w-24" />
        </div>
        <div className="flex flex-1 flex-col gap-3 p-4">
          <div className="rounded-xl border border-border bg-muted/40 p-3">
            <div className="flex items-center gap-3">
              <Skeleton className="h-10 w-10 rounded-full" />
              <div className="min-w-0 flex-1 space-y-2">
                <Skeleton className="h-3 w-3/4" />
                <Skeleton className="h-3 w-1/2" />
              </div>
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <Skeleton className="h-9 w-2/3" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        </div>
      </aside>

      {/* Mobile top bar */}
      <header className="sticky top-0 z-40 flex h-16 items-center justify-between border-b border-border bg-background/85 px-4 backdrop-blur lg:hidden">
        <div className="flex items-center gap-2">
          <Skeleton className="h-8 w-8 rounded-md" />
          <Skeleton className="h-4 w-20" />
        </div>
        <div className="flex items-center gap-1">
          <Skeleton className="h-9 w-9 rounded-md" />
          <Skeleton className="h-9 w-9 rounded-full" />
        </div>
      </header>

      {/* Desktop top bar */}
      <header className="sticky top-0 z-30 hidden h-16 items-center justify-between border-b border-border bg-background/85 px-6 backdrop-blur lg:flex">
        <Skeleton className="h-3 w-72" />
        <div className="flex items-center gap-2">
          <Skeleton className="h-9 w-9 rounded-md" />
          <Skeleton className="h-9 w-9 rounded-md" />
          <Skeleton className="h-3 w-32" />
        </div>
      </header>

      <main className="px-4 py-4 lg:px-8 lg:py-8">{children}</main>

      {/* Mobile bottom nav placeholder */}
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-lg lg:hidden">
        <div className="mx-auto grid max-w-lg grid-cols-5 items-end gap-0 px-0.5 pt-1">
          {Array.from({ length: 5 }).map((_, i) => (
            <div
              key={i}
              className="flex flex-col items-center justify-end gap-1 px-0.5 pb-1.5 pt-2"
            >
              <Skeleton
                className={
                  i === 2 ? "-mt-5 h-14 w-14 rounded-full" : "h-9 w-9 rounded-full"
                }
              />
              <Skeleton className="h-2 w-10" />
            </div>
          ))}
        </div>
      </nav>
    </div>
  );
}
