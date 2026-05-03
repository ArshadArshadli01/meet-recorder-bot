import * as React from "react";
import { cn } from "../../lib/utils";

export function Skeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-md bg-muted/55",
        className
      )}
      {...props}
    >
      <div
        className="pointer-events-none absolute inset-0 rounded-[inherit] bg-gradient-to-r from-transparent via-foreground/[0.07] to-transparent dark:via-foreground/[0.11] motion-reduce:hidden motion-safe:animate-skeleton-shimmer"
        aria-hidden
      />
    </div>
  );
}
